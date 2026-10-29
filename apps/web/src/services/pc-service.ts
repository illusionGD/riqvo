import { z } from 'zod';
import { parseTask, parseRunResult } from '@riqvo/contracts';
import type { ArtifactReference, TestTask } from '@riqvo/contracts';
import type { PcState } from '../types/pc';

const artifactBase = {
  id: z.string(),
  kind: z.enum(['screenshot', 'video', 'trace']),
  stepId: z.string().optional(),
};
const artifactSchema = z.discriminatedUnion('state', [
  z.object({
    ...artifactBase,
    state: z.literal('available'),
    reference: z.string().regex(/^a_[a-f0-9]{32}$/),
  }),
  z.object({
    ...artifactBase,
    state: z.literal('missing'),
    reason: z.enum(['CAPTURE_FAILED', 'UPLOAD_FAILED']),
  }),
  z.object({ ...artifactBase, state: z.literal('expired') }),
]);
const stateSchema = z.object({
  mode: z.enum(['idle', 'opening', 'recording', 'running', 'finishing']),
  draft: z.unknown().optional(),
  result: z.unknown().optional(),
  progress: z.array(
    z.object({
      stepId: z.string(),
      status: z.enum(['passed', 'failed', 'skipped', 'cancelled', 'unsupported']),
      startedAt: z.string(),
      finishedAt: z.string(),
      error: z
        .object({
          code: z.enum([
            'TIMEOUT',
            'ELEMENT_NOT_FOUND',
            'AMBIGUOUS_LOCATOR',
            'ASSERTION_FAILED',
            'NAVIGATION_FAILED',
            'DRIVER_ERROR',
            'UNSUPPORTED_CAPABILITY',
            'CANCELLED',
          ]),
          diagnosticId: z.string().optional(),
        })
        .optional(),
    }),
  ),
  recordingArtifacts: z.array(artifactSchema),
  issue: z.string().optional(),
});
let token = '';

/** 初始化本机会话；令牌只用于当前工作台控制，不作为模型凭据。 */
async function connect(signal: AbortSignal = AbortSignal.timeout(5000)): Promise<void> {
  const response = await fetch('/api/pc/bootstrap', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('无法连接本机执行器，请确认执行器已启动。');
  const value: unknown = await response.json();
  token = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(value).token;
}

/** 统一 HTTP 请求及错误消息，不显示原始业务载荷。 */
async function request(path: string, value?: unknown): Promise<unknown> {
  if (!token) await connect();
  const response = await fetch(`/api/pc/${path}`, {
    method: value === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-riqvo-token': token },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  if (!response.ok) {
    if (response.status === 403) {
      token = '';
      throw new Error('本机连接已过期，请重新连接后操作。');
    }
    if (response.status === 409) throw new Error('当前浏览器正在使用中，请先停止录制或回放。');
    if (response.status === 400)
      throw new Error('步骤、环境或变量无效，请检查必填项和当前支持的操作。');
    throw new Error('本机执行器请求失败，请重试。');
  }
  return response.json() as Promise<unknown>;
}

/** 校验推送快照；完成结果必须对应同一份实际运行任务。 */
function parseState(input: unknown): PcState {
  const value = stateSchema.parse(input);
  const draft = value.draft ? parseTask(value.draft) : undefined;
  const result = value.result && draft ? parseRunResult(draft, value.result) : undefined;
  return { ...value, draft, result };
}

/**
 * 建立同源 SSE；每次重连先重新认证，以适应执行器重启后的令牌轮换。
 * @param onState 收到合法完整快照时调用。
 * @param onDisconnected 断开或消息无效时反馈状态，不覆盖用户操作错误。
 * @returns 取消连接、待执行重试及初始化请求的清理函数。
 */
export function subscribePcState(
  onState: (state: PcState) => void,
  onDisconnected: (message: string) => void,
): () => void {
  let closed = false;
  let source: EventSource | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;

  /** 由单一退避定时器重连，避免原生重试与重新认证同时产生连接。 */
  function retry(message: string): void {
    if (closed) return;
    source?.close();
    source = undefined;
    controller?.abort();
    onDisconnected(message);
    clearTimeout(timer);
    timer = setTimeout(() => {
      void open();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 15000);
  }

  /** 初始化 Cookie 后再打开只读事件流，首条消息就是最新快照。 */
  async function open(): Promise<void> {
    controller = new AbortController();
    try {
      await connect(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]));
      if (closed) return;
      const current = new EventSource('/api/pc/events');
      source = current;
      current.addEventListener('state', (event: MessageEvent<string>) => {
        if (closed || source !== current) return;
        try {
          const input: unknown = JSON.parse(event.data);
          const state = parseState(input);
          retryDelay = 1000;
          onState(state);
        } catch {
          retry('执行器状态无效，正在重新连接。');
        }
      });
      current.onerror = () => {
        if (!closed && source === current) retry('执行器连接中断，正在重新连接。');
      };
    } catch {
      retry('执行器连接中断，正在重新连接。');
    }
  }

  void open();
  return () => {
    closed = true;
    clearTimeout(timer);
    controller?.abort();
    source?.close();
    source = undefined;
  };
}
/** 按已校验任务开始新的可视录制。 */
export async function startRecording(task: TestTask): Promise<void> {
  await request('record', task);
}
/** 停止录制并等待视频完成。 */
export async function stopRecording(): Promise<void> {
  await request('stop', {});
}
/** 发起独立、隔离的回放尝试。 */
export async function startReplay(task: TestTask): Promise<void> {
  await request('run', task);
}
/** 取消活动任务并等待浏览器清理。 */
export async function cancelPcTask(): Promise<void> {
  await request('cancel', {});
}
/** 返回受控产物地址，缺失或已清理的媒体不生成链接。 */
export function artifactUrl(artifact: ArtifactReference): string | undefined {
  return artifact.state === 'available' ? `/api/pc/artifacts/${artifact.reference}` : undefined;
}
