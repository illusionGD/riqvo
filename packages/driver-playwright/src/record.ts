import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { parseTask } from '@riqvo/contracts';
import type { TestTask, TestStep } from '@riqvo/contracts';
import type { BrowserContext, Frame, Page } from 'playwright';
import { recorderScript } from './recorder-script';

/** 录制快照不包含密码变量的值；不支持交互必须由界面明确展示。 */
export interface RecordingSnapshot {
  task: TestTask;
  issue?: string;
}
/** 公开录制会话，只提供快照与停止，不暴露内部事件队列。 */
export interface PcRecorder {
  snapshot: () => RecordingSnapshot;
  stop: () => Promise<RecordingSnapshot>;
}
const locatorSchema = z.strictObject({
  strategy: z.enum(['testId', 'css']),
  value: z.string().min(1).max(1000),
});
const eventSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('click'), locator: locatorSchema }),
  z.strictObject({
    action: z.literal('fill'),
    locator: locatorSchema,
    value: z.string().max(10000).optional(),
    secret: z.literal(true).optional(),
  }),
  z.strictObject({
    action: z.literal('select'),
    locator: locatorSchema,
    value: z.string().max(10000),
  }),
  z.strictObject({ action: z.literal('check'), locator: locatorSchema, checked: z.boolean() }),
  z.strictObject({
    action: z.literal('unsupported'),
    reason: z.enum(['FILE_INPUT', 'MULTI_SELECT', 'DRAG', 'KEYBOARD_ACTION', 'CONTENT_EDITABLE']),
  }),
]);

/** 将实际地址转换成环境无关路由，不把不同站点通过字符串替换混在一起。 */
function navigation(url: string, task: TestTask): Extract<TestStep, { action: 'navigate' }> {
  const actual = new URL(url);
  const candidates = Object.entries(task.environment.sites)
    .map(([site, address]) => {
      const base = new URL(address);
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      return { site, base };
    })
    .sort((left, right) => right.base.pathname.length - left.base.pathname.length);
  const match = candidates.find(
    ({ base }) => actual.origin === base.origin && actual.pathname.startsWith(base.pathname),
  );
  if (!match || actual.hash) throw new Error('UNSUPPORTED_NAVIGATION');
  const query: Extract<TestStep, { action: 'navigate' }>['query'] = {};
  for (const [key, value] of actual.searchParams) {
    if (Object.hasOwn(query, key)) throw new Error('UNSUPPORTED_NAVIGATION');
    query[key] = { source: 'literal', value };
  }
  return {
    id: 'navigation',
    action: 'navigate',
    site: match.site,
    path: actual.pathname.slice(match.base.pathname.length),
    query,
    timeoutMs: 10000,
  };
}

/**
 * 将公开浏览器上下文接入录制，采集真实事件并生成 D02 协议步骤。
 * @param context 调用方独占的受控上下文。
 * @param input 环境、目标及初始导航快照；旧步骤不会被追加录制修改。
 * @returns 可读取、停止的录制会话，页面和视频由调用方清理。
 */
export async function attachPcRecorder(
  context: BrowserContext,
  input: unknown,
): Promise<PcRecorder> {
  const task = parseTask(input);
  const first = task.case.steps[0];
  if (!first || first.action !== 'navigate') throw new Error('RECORDING_NEEDS_NAVIGATION');
  task.case.steps = [{ ...first, id: 'step_1' }];
  task.variables = {};
  let primary: Page | undefined;
  let active = true;
  let issue: string | undefined;
  let firstNavigation = true;
  let lastUrl = '';
  let clickedSinceNavigation = false;
  let sequence = 1;
  const secrets = new Map<string, string>();
  const binding = `__riqvo_${randomUUID().replaceAll('-', '')}`;
  const flush = `${binding}_flush`;
  const snapshot = (): RecordingSnapshot => structuredClone({ task, ...(issue ? { issue } : {}) });
  const fail = (code: string): void => {
    issue ??= code;
    active = false;
  };
  const append = (step: TestStep): void => {
    if (!active) return;
    if (task.case.steps.length >= 1000) {
      fail('STEP_LIMIT');
      return;
    }
    const steps = [...task.case.steps];
    const previous = steps.at(-1);
    if (
      step.action === 'fill' &&
      previous?.action === 'fill' &&
      JSON.stringify(step.locator) === JSON.stringify(previous.locator)
    ) {
      steps[steps.length - 1] = { ...step, id: previous.id };
    } else {
      steps.push({ ...step, id: `step_${++sequence}` });
    }
    try {
      task.case.steps = parseTask({ ...task, case: { ...task.case, steps } }).case.steps;
    } catch {
      fail('UNSUPPORTED_INTERACTION');
    }
  };
  await context.exposeBinding(binding, ({ page, frame }, input: unknown) => {
    if (!active) return;
    if (page !== primary || frame !== page.mainFrame()) {
      fail('IFRAME_OR_POPUP');
      return;
    }
    const parsed = eventSchema.safeParse(input);
    if (!parsed.success) {
      fail('UNSUPPORTED_INTERACTION');
      return;
    }
    const event = parsed.data;
    if (event.action === 'unsupported') {
      fail(event.reason);
      return;
    }
    const base = { id: 'pending', timeoutMs: 10000, locator: event.locator };
    if (event.action === 'fill') {
      if (event.secret) {
        const key = JSON.stringify(event.locator);
        if (!secrets.has(key)) secrets.set(key, `secret_${secrets.size + 1}`);
        append({ ...base, action: 'fill', value: { source: 'variable', name: secrets.get(key)! } });
      } else if (event.value !== undefined)
        append({ ...base, action: 'fill', value: { source: 'literal', value: event.value } });
      else fail('UNSUPPORTED_INTERACTION');
    } else if (event.action === 'select')
      append({ ...base, action: 'select', value: { source: 'literal', value: event.value } });
    else if (event.action === 'check') append({ ...base, action: 'check', checked: event.checked });
    else {
      append({ ...base, action: 'click' });
      clickedSinceNavigation = true;
    }
  });
  await context.addInitScript(recorderScript, { binding, flush });
  const navigate = (frame: Frame): void => {
    if (
      !active ||
      !primary ||
      frame !== primary.mainFrame() ||
      frame.url() === 'about:blank' ||
      frame.url() === lastUrl
    )
      return;
    lastUrl = frame.url();
    try {
      const step = navigation(lastUrl, task);
      if (firstNavigation) {
        task.case.steps = parseTask({
          ...task,
          case: { ...task.case, steps: [{ ...step, id: 'step_1' }] },
        }).case.steps;
        firstNavigation = false;
      } else append(clickedSinceNavigation ? { ...step, action: 'assertUrl' } : step);
      clickedSinceNavigation = false;
      parseTask(task);
    } catch {
      fail('UNSUPPORTED_NAVIGATION');
    }
  };
  const attach = (page: Page): void => {
    if (primary) {
      if (active) fail('IFRAME_OR_POPUP');
      return;
    }
    primary = page;
    page.on('framenavigated', navigate);
    page.on('close', () => {
      if (active) fail('BROWSER_CLOSED');
    });
    page.on('crash', () => fail('BROWSER_CLOSED'));
    page.on('filechooser', () => fail('FILE_INPUT'));
  };
  context.on('page', attach);
  for (const page of context.pages()) {
    attach(page);
    await page.evaluate(recorderScript, { binding, flush });
    navigate(page.mainFrame());
  }
  return {
    snapshot,
    async stop() {
      if (primary && !primary.isClosed()) {
        await primary
          .evaluate(async (name) => {
            const drain = (
              window as unknown as Record<string, (() => Promise<unknown>) | undefined>
            )[name];
            await drain?.();
          }, flush)
          .catch(() => undefined);
      }
      active = false;
      context.off('page', attach);
      primary?.off('framenavigated', navigate);
      return snapshot();
    },
  };
}
