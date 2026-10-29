import { ContractError, parseCapabilities, parseTask } from './task';
import type { InputValue, TestStep, TestTask } from './task';

/** 运行时参数已解析的步骤；用例快照仍保持原始引用。 */
export type PreparedStep =
  | Exclude<TestStep, { action: 'navigate' | 'assertUrl' | 'fill' | 'select' | 'assertText' }>
  | (Extract<TestStep, { action: 'navigate' | 'assertUrl' }> & { url: string })
  | (Omit<Extract<TestStep, { action: 'fill' }>, 'value'> & { value: string })
  | (Omit<Extract<TestStep, { action: 'select' }>, 'value'> & { value: string })
  | (Omit<Extract<TestStep, { action: 'assertText' }>, 'expected'> & { expected: string });

/** 预检失败描述，不包含业务输入或凭据。 */
export interface UnsupportedReason {
  /** 能力类别。 */
  capability: 'target' | 'mode' | 'action' | 'locator' | 'artifact';
  /** 缺失的能力名称。 */
  required: string;
  /** 与步骤相关时才提供其标识。 */
  stepId?: string;
}
/** 能力不支持时没有可执行步骤，调用者必须停止派发。 */
export type PreparationResult =
  | { status: 'ready'; steps: PreparedStep[] }
  | { status: 'unsupported'; reasons: UnsupportedReason[] };

/**
 * 读取显式变量引用；内容始终当作普通字符串。
 * @param input 字面值或变量引用。
 * @param task 运行快照。
 * @returns 已解析字符串。
 */
function readValue(input: InputValue, task: TestTask): string {
  if (input.source === 'literal') return input.value;
  if (!Object.hasOwn(task.variables, input.name)) throw new ContractError('MISSING_VARIABLE');
  return task.variables[input.name]!;
}

/**
 * 将相对路由解析到环境中的逻辑站点。
 * @param step 导航步骤。
 * @param task 运行快照。
 * @returns 完整地址。
 */
function resolveUrl(
  step: Extract<TestStep, { action: 'navigate' | 'assertUrl' }>,
  task: TestTask,
): string {
  if (!Object.hasOwn(task.environment.sites, step.site)) throw new ContractError('MISSING_SITE');
  const base = new URL(task.environment.sites[step.site]!);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const url = new URL(step.path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    throw new ContractError('INVALID_ROUTE');
  for (const [name, value] of Object.entries(step.query))
    url.searchParams.set(name, readValue(value, task));
  return url.href;
}

/**
 * 在驱动执行前解析任务。此步骤不会访问网络或控制浏览器。
 * @param taskInput 不可信任务快照。
 * @param capabilitiesInput 当前会话的能力声明。
 * @returns 已解析步骤或明确的不支持原因。
 */
export function prepareTask(taskInput: unknown, capabilitiesInput: unknown): PreparationResult {
  const task = parseTask(taskInput);
  const capabilities = parseCapabilities(capabilitiesInput);
  const reasons: UnsupportedReason[] = [];
  if (
    task.target.platform !== capabilities.platform ||
    task.target.browser !== capabilities.browser
  ) {
    reasons.push({
      capability: 'target',
      required: `${task.target.platform}/${task.target.browser}`,
    });
  }
  if (!capabilities.modes.includes(task.target.mode))
    reasons.push({ capability: 'mode', required: task.target.mode });
  const artifacts = new Set(task.artifacts);
  if (task.case.steps.some((step) => step.action === 'screenshot')) artifacts.add('screenshot');
  for (const kind of artifacts) {
    if (!capabilities.artifacts.includes(kind))
      reasons.push({ capability: 'artifact', required: kind });
  }
  for (const step of task.case.steps) {
    if (!capabilities.actions.includes(step.action))
      reasons.push({ capability: 'action', required: step.action, stepId: step.id });
    if ('locator' in step && !capabilities.locators.includes(step.locator.strategy))
      reasons.push({ capability: 'locator', required: step.locator.strategy, stepId: step.id });
  }
  const steps = task.case.steps.map((step): PreparedStep => {
    if (step.action === 'navigate' || step.action === 'assertUrl')
      return { ...step, url: resolveUrl(step, task) };
    if (step.action === 'fill' || step.action === 'select')
      return { ...step, value: readValue(step.value, task) };
    if (step.action === 'assertText') return { ...step, expected: readValue(step.expected, task) };
    return step;
  });
  if (reasons.length) return { status: 'unsupported', reasons };
  return { status: 'ready', steps };
}
