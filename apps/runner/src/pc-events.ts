import type { ServerResponse } from 'node:http';
import { setInterval, clearInterval } from 'node:timers';
import type { WorkbenchState } from './pc-workbench';

/**
 * 在受认证的连接中发送完整状态；慢客户端只保留最新待发快照。
 * @param response 已通过工作台来源及身份校验的响应。
 * @param subscribe 状态订阅，注册时同步提供当前快照。
 */
export function streamPcEvents(
  response: ServerResponse,
  subscribe: (listener: (state: WorkbenchState) => void) => () => void,
): void {
  let closed = false;
  let blocked = false;
  let pending: string | undefined;
  let unsubscribe = (): void => {};
  const heartbeat = setInterval(() => {
    if (!closed && !blocked) write(': heartbeat\n\n');
  }, 15000);
  heartbeat.unref();

  /** 连接结束后不再保留订阅、心跳或未发送的快照。 */
  function cleanup(): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    pending = undefined;
    response.off('drain', drain);
  }
  /** 遵循流背压，不为已经离开的页面持续排队。 */
  function write(frame: string): void {
    if (closed) return;
    try {
      blocked = !response.write(frame);
    } catch {
      cleanup();
      response.destroy();
    }
  }
  /** 缓冲排空时只发送最后一次变化，完整快照无需逐条补播。 */
  function drain(): void {
    blocked = false;
    if (pending !== undefined) {
      const frame = pending;
      pending = undefined;
      write(frame);
    }
  }
  response.once('close', cleanup);
  response.once('error', cleanup);
  response.on('drain', drain);
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
  });
  response.flushHeaders();
  write('retry: 1000\n\n');
  unsubscribe = subscribe((state) => {
    const frame = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    if (blocked) pending = frame;
    else write(frame);
  });
  if (closed) unsubscribe();
}
