import { setTimeout as delay } from 'node:timers/promises';
import { parseTask, parseRunResult, prepareTask } from '@riqvo/contracts';
import type { PreparedStep, RunResult, StepResult, TestStep } from '@riqvo/contracts';
import type { Locator, Page } from 'playwright';
import { captureScreenshot, getPcCapabilities, openPcBrowser } from './browser';
import type { PcBrowserOptions, PcBrowserSession } from './browser';

/** 单次回放的本地选项及公共进度通知。 */
export interface RunPcOptions extends PcBrowserOptions {
  signal?: AbortSignal;
  onStep?: (result: StepResult) => void;
}
/** 声明式定位器类型由共享协议定义。 */
type StepLocator = Extract<TestStep, { action: 'click' }>['locator'];

/** 将声明式定位转换为 Playwright 公共接口，保留严格唯一定位语义。 */
export function locate(page: Page, locator: StepLocator): Locator {
  if (locator.strategy === 'testId') return page.getByTestId(locator.value);
  if (locator.strategy === 'label') return page.getByLabel(locator.value, { exact: locator.exact });
  if (locator.strategy === 'role')
    return page.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
      name: locator.name,
      exact: locator.exact,
    });
  return page.locator(locator.value);
}

/** 轮询页面真实状态；断言失败不会自动放宽预期。 */
async function assertEventually(check: () => Promise<boolean>, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(Math.min(80, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw new Error('ASSERTION_FAILED');
}

/** 执行共享协议中一个已解析步骤，不接受任意脚本。 */
async function perform(page: Page, step: PreparedStep): Promise<void> {
  const options = { timeout: step.timeoutMs };
  if (step.action === 'navigate') {
    await page.goto(step.url, { ...options, waitUntil: 'domcontentloaded' });
    return;
  }
  if (step.action === 'assertUrl') {
    await page.waitForURL((url) => url.href === step.url, options);
    return;
  }
  if (step.action === 'screenshot') return;
  const target = locate(page, step.locator);
  if (step.action === 'fill') await target.fill(step.value, options);
  else if (step.action === 'select') await target.selectOption(step.value, options);
  else if (step.action === 'check') await target.setChecked(step.checked, options);
  else if (step.action === 'click') await target.click(options);
  else if (step.action === 'waitFor') await target.waitFor({ ...options, state: step.state });
  else if (step.action === 'assertVisible')
    await target.waitFor({ ...options, state: step.visible ? 'visible' : 'hidden' });
  else if (step.action === 'assertText') {
    await target.waitFor({ ...options, state: 'visible' });
    await assertEventually(async () => {
      const text = await target.innerText(options);
      return step.match === 'equals' ? text === step.expected : text.includes(step.expected);
    }, step.timeoutMs);
  }
}

/** 将驱动异常转为固定错误码，避免传播页面文本和输入值。 */
function errorCode(error: unknown, step: PreparedStep): NonNullable<StepResult['error']>['code'] {
  if (error instanceof Error && error.message.includes('strict mode violation'))
    return 'AMBIGUOUS_LOCATOR';
  if (step.action.startsWith('assert')) return 'ASSERTION_FAILED';
  if (step.action === 'navigate') return 'NAVIGATION_FAILED';
  return error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'DRIVER_ERROR';
}

/**
 * 执行一次 PC 回放并返回可由 contracts 验证的结果；调用方负责显式重试。
 * @param input 不可信的任务快照。
 * @param options 本机配置、取消信号和进度通知。
 * @returns 完整报告，媒体不可用与业务失败分别表示。
 */
export async function runPcTask(input: unknown, options: RunPcOptions): Promise<RunResult> {
  const task = parseTask(input);
  const result: RunResult = {
    protocolVersion: 1,
    taskId: task.id,
    attempt: task.attempt,
    status: 'unverified',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    steps: [],
    artifacts: [],
  };
  const browserName = task.target.browser;
  if (!['chromium', 'chrome', 'edge'].includes(browserName)) {
    result.status = 'unsupported';
    result.error = { code: 'UNSUPPORTED_CAPABILITY' };
    return parseRunResult(task, result);
  }
  const prepared = prepareTask(
    task,
    getPcCapabilities(browserName as 'chromium' | 'chrome' | 'edge'),
  );
  if (prepared.status === 'unsupported') {
    result.status = 'unsupported';
    result.error = { code: 'UNSUPPORTED_CAPABILITY' };
    return parseRunResult(task, result);
  }
  let session: PcBrowserSession | undefined;
  let page: Page | undefined;
  const stop = (): void => {
    void session?.context.close().catch(() => undefined);
  };
  options.signal?.addEventListener('abort', stop, { once: true });
  try {
    if (options.signal?.aborted) throw new Error('CANCELLED');
    session = await openPcBrowser(
      browserName as 'chromium' | 'chrome' | 'edge',
      task.target.mode,
      task.artifacts.includes('video'),
      options,
    );
    if (options.signal?.aborted) throw new Error('CANCELLED');
    page = await session.context.newPage();
    let unsupported = false;
    session.context.on('page', (other) => {
      if (other !== page) {
        unsupported = true;
        void other.close().catch(() => undefined);
      }
    });
    for (const step of prepared.steps) {
      const current: StepResult = {
        stepId: step.id,
        status: 'passed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
      try {
        if (options.signal?.aborted) throw new Error('CANCELLED');
        await perform(page, step);
        if (unsupported) throw new Error('UNSUPPORTED_CAPABILITY');
        if (step.action === 'screenshot' || task.artifacts.includes('screenshot')) {
          const artifact = await captureScreenshot(page, options.artifactDir, step.id);
          result.artifacts.push(artifact);
          if (step.action === 'screenshot' && artifact.state !== 'available')
            throw new Error('CAPTURE_FAILED');
        }
        if (options.signal?.aborted) throw new Error('CANCELLED');
      } catch (error) {
        current.status = options.signal?.aborted
          ? 'cancelled'
          : unsupported
            ? 'unsupported'
            : 'failed';
        current.error = {
          code: options.signal?.aborted
            ? 'CANCELLED'
            : unsupported
              ? 'UNSUPPORTED_CAPABILITY'
              : errorCode(error, step),
        };
        result.status = current.status;
        result.artifacts.push(await captureScreenshot(page, options.artifactDir, step.id));
      }
      current.finishedAt = new Date().toISOString();
      result.steps.push(current);
      options.onStep?.(current);
      if (current.status !== 'passed') break;
    }
    if (
      result.status === 'unverified' &&
      prepared.steps.some((step) => step.action.startsWith('assert'))
    )
      result.status = 'passed';
  } catch {
    result.status = options.signal?.aborted ? 'cancelled' : 'failed';
    result.error = { code: options.signal?.aborted ? 'CANCELLED' : 'DRIVER_ERROR' };
  } finally {
    options.signal?.removeEventListener('abort', stop);
    if (session) result.artifacts.push(...(await session.finish(page)));
    else if (task.artifacts.includes('video'))
      result.artifacts.push({
        id: 'video_missing',
        kind: 'video',
        state: 'missing',
        reason: 'CAPTURE_FAILED',
      });
    result.finishedAt = new Date().toISOString();
  }
  return parseRunResult(task, result);
}
