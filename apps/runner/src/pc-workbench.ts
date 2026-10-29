import { parseTask, prepareTask } from '@riqvo/contracts';
import type { ArtifactReference, RunResult, StepResult, TestTask } from '@riqvo/contracts';
import {
  attachPcRecorder,
  getPcCapabilities,
  openPcBrowser,
  runPcTask,
} from '@riqvo/driver-playwright';
import type { PcBrowser, PcBrowserSession, PcRecorder } from '@riqvo/driver-playwright';
import type { Page } from 'playwright';

/** 本机原型状态通过 HTTP 对外提供；变量值不进入此快照。 */
export interface WorkbenchState {
  mode: 'idle' | 'opening' | 'recording' | 'running' | 'finishing';
  draft?: TestTask;
  result?: RunResult;
  recordingArtifacts: ArtifactReference[];
  progress: StepResult[];
  issue?: string;
}
/** 仅来自执行主机配置，不能由 HTTP 任务指定文件路径。 */
export interface WorkbenchConfig {
  artifactDir: string;
  browserPaths: Partial<Record<PcBrowser, string>>;
}
/** 固定错误码用于 HTTP 映射，避免泄露原始输入。 */
export class WorkbenchError extends Error {
  constructor(public readonly code: 'BUSY' | 'INVALID_TASK' | 'UNSUPPORTED' | 'NOT_RECORDING') {
    super(code);
  }
}

/**
 * 单个本机工作台独占一个浏览器；正式多设备租约由 D09 实现。
 * @param config 只读本机配置。
 * @returns 公共控制接口及只允许已登记产物的下载索引。
 */
export function createPcWorkbench(config: WorkbenchConfig) {
  const state: WorkbenchState = { mode: 'idle', recordingArtifacts: [], progress: [] };
  const listeners = new Set<(state: WorkbenchState) => void>();
  const artifacts = new Map<string, 'screenshot' | 'video'>();
  let controller: AbortController | undefined;
  let session: PcBrowserSession | undefined;
  let recorder: PcRecorder | undefined;
  let page: Page | undefined;
  let work: Promise<void> = Promise.resolve();
  let finishing: Promise<void> | undefined;
  const register = (values: ArtifactReference[]): void => {
    for (const artifact of values) {
      if (artifact.state === 'available' && artifact.kind !== 'trace')
        artifacts.set(artifact.reference, artifact.kind);
    }
  };
  const sanitize = (task: TestTask): TestTask => ({ ...structuredClone(task), variables: {} });
  const parse = (input: unknown): TestTask => {
    try {
      return parseTask(input);
    } catch {
      throw new WorkbenchError('INVALID_TASK');
    }
  };
  const browser = (task: TestTask): PcBrowser => {
    if (
      task.target.platform !== 'pc' ||
      !['chromium', 'chrome', 'edge'].includes(task.target.browser)
    )
      throw new WorkbenchError('UNSUPPORTED');
    return task.target.browser as PcBrowser;
  };
  const idle = (): void => {
    if (state.mode !== 'idle') throw new WorkbenchError('BUSY');
  };
  const reset = (task: TestTask): void => {
    state.draft = sanitize(task);
    state.result = undefined;
    state.issue = undefined;
    state.recordingArtifacts = [];
    state.progress = [];
    recorder = undefined;
    session = undefined;
    page = undefined;
    controller = new AbortController();
    finishing = undefined;
  };
  const snapshot = (): WorkbenchState => {
    return structuredClone(state);
  };
  /** 只在状态变更时通知，不通过后台定时器读取快照。 */
  const publish = (): void => {
    for (const listener of listeners) listener(snapshot());
  };
  /** 每次连接立即同步完整状态，断线期间不需要保存历史消息。 */
  const subscribe = (listener: (state: WorkbenchState) => void): (() => void) => {
    listeners.add(listener);
    listener(snapshot());
    return () => {
      listeners.delete(listener);
    };
  };
  const stopRecording = async (): Promise<void> => {
    if (finishing) return finishing;
    if (!recorder || !session) throw new WorkbenchError('NOT_RECORDING');
    state.mode = 'finishing';
    publish();
    const current = session;
    finishing = (async () => {
      try {
        const recorded = await recorder!.stop();
        state.draft = recorded.task;
        state.issue = recorded.issue ?? state.issue;
        state.recordingArtifacts = await current.finish(page);
      } catch {
        state.issue ??= 'RECORDING_FINISH_FAILED';
        await current.finish(page).catch(() => undefined);
      } finally {
        register(state.recordingArtifacts);
        recorder = undefined;
        session = undefined;
        state.mode = 'idle';
        publish();
      }
    })();
    return finishing;
  };
  return {
    snapshot,
    subscribe,
    artifacts,
    record(input: unknown): void {
      idle();
      const task = parse(input);
      const name = browser(task);
      task.target.mode = 'visible';
      if (task.case.steps[0]?.action !== 'navigate') throw new WorkbenchError('INVALID_TASK');
      const initial = { ...task, case: { ...task.case, steps: [task.case.steps[0]] } };
      let prepared;
      try {
        prepared = prepareTask(initial, getPcCapabilities(name));
      } catch {
        throw new WorkbenchError('INVALID_TASK');
      }
      if (prepared.status !== 'ready' || prepared.steps[0]?.action !== 'navigate')
        throw new WorkbenchError('UNSUPPORTED');
      const url = prepared.steps[0].url;
      reset(task);
      state.mode = 'opening';
      publish();
      work = (async () => {
        try {
          session = await openPcBrowser(name, 'visible', task.artifacts.includes('video'), {
            artifactDir: config.artifactDir,
            executablePath: config.browserPaths[name],
          });
          if (controller?.signal.aborted) throw new Error('CANCELLED');
          recorder = await attachPcRecorder(session.context, initial, (recorded) => {
            state.draft = recorded.task;
            state.issue = recorded.issue ?? state.issue;
            publish();
          });
          page = await session.context.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          if (controller?.signal.aborted) throw new Error('CANCELLED');
          state.mode = 'recording';
          publish();
          page.once('close', () => {
            if (state.mode === 'recording') void stopRecording();
          });
        } catch {
          state.issue = controller?.signal.aborted ? 'CANCELLED' : 'BROWSER_START_FAILED';
          if (recorder && session) await stopRecording();
          else {
            if (session) await session.finish(page);
            state.mode = 'idle';
            publish();
          }
        }
      })();
    },
    stopRecording,
    run(input: unknown): void {
      idle();
      const task = parse(input);
      const name = browser(task);
      try {
        if (prepareTask(task, getPcCapabilities(name)).status !== 'ready')
          throw new Error('UNSUPPORTED');
      } catch {
        throw new WorkbenchError('INVALID_TASK');
      }
      reset(task);
      state.mode = 'running';
      publish();
      work = (async () => {
        try {
          state.result = await runPcTask(task, {
            artifactDir: config.artifactDir,
            executablePath: config.browserPaths[name],
            signal: controller?.signal,
            onStep(step) {
              state.progress.push(step);
              publish();
            },
          });
          register(state.result.artifacts);
        } catch {
          state.issue = 'RUN_FAILED';
        } finally {
          state.mode = 'idle';
          publish();
        }
      })();
    },
    async cancel(): Promise<void> {
      controller?.abort();
      if (state.mode === 'recording') {
        state.issue = 'CANCELLED';
        await stopRecording();
      } else if (state.mode === 'finishing') await finishing;
      else await work;
    },
  };
}
