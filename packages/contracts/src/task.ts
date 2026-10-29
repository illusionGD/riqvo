import { z } from 'zod';

/** 协议标识用于关联快照和事件，不接受路径或任意长文本。 */
export const ID_SCHEMA = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const TEXT_SCHEMA = z.string().max(10000);
const VALUE_SCHEMA = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('literal'), value: TEXT_SCHEMA }),
  z.strictObject({ source: z.literal('variable'), name: ID_SCHEMA }),
]);
const LOCATOR_SCHEMA = z.discriminatedUnion('strategy', [
  z.strictObject({ strategy: z.literal('testId'), value: z.string().min(1).max(500) }),
  z.strictObject({ strategy: z.literal('css'), value: z.string().min(1).max(1000) }),
  z.strictObject({
    strategy: z.literal('label'),
    value: z.string().min(1).max(500),
    exact: z.boolean().default(true),
  }),
  z.strictObject({
    strategy: z.literal('role'),
    role: z.string().min(1).max(50),
    name: z.string().min(1).max(500),
    exact: z.boolean().default(true),
  }),
]);
const COMMON_STEP = {
  id: ID_SCHEMA,
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
};
const ROUTE_FIELDS = {
  site: ID_SCHEMA,
  path: z.string().max(2000).refine(isRelativeRoute),
  query: z.record(ID_SCHEMA, VALUE_SCHEMA).default({}),
};

/**
 * 路由只能是站点目录内的相对路径，查询参数另行编码。
 * @param path 原始相对路径。
 * @returns 是否为不会逃出站点目录的路径。
 */
function isRelativeRoute(path: string): boolean {
  if (/^[\\/]|[\\:?#\s]|%(?:2e|2f|5c|25)/i.test(path) || hasControlCharacters(path)) return false;
  try {
    const decoded = decodeURIComponent(path);
    return (
      !hasControlCharacters(decoded) &&
      !decoded.split('/').some((part) => part === '.' || part === '..')
    );
  } catch {
    return false;
  }
}

/**
 * 防止 URL 解析器静默移除控制字符，导致实际地址与声明不同。
 * @param value 原始或解码后的文本。
 * @returns 是否含 ASCII 控制字符。
 */
function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

/**
 * 环境地址只能描述站点，不能携带账号或查询凭据。
 * @param value 完整站点地址。
 * @returns 是否为可用的 HTTP(S) 基地址。
 */
function isSiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//.test(value) &&
      !/[\\\s]/.test(value) &&
      !hasControlCharacters(value) &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** 最小步骤协议；未知动作和字段必须显式报错，不能悄悄删除。 */
export const STEP_SCHEMA = z.discriminatedUnion('action', [
  z.strictObject({ ...COMMON_STEP, action: z.literal('navigate'), ...ROUTE_FIELDS }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('fill'),
    locator: LOCATOR_SCHEMA,
    value: VALUE_SCHEMA,
  }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('select'),
    locator: LOCATOR_SCHEMA,
    value: VALUE_SCHEMA,
  }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('check'),
    locator: LOCATOR_SCHEMA,
    checked: z.boolean(),
  }),
  z.strictObject({ ...COMMON_STEP, action: z.literal('click'), locator: LOCATOR_SCHEMA }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('waitFor'),
    locator: LOCATOR_SCHEMA,
    state: z.enum(['visible', 'hidden']),
  }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('assertText'),
    locator: LOCATOR_SCHEMA,
    expected: VALUE_SCHEMA,
    match: z.enum(['equals', 'contains']),
  }),
  z.strictObject({
    ...COMMON_STEP,
    action: z.literal('assertVisible'),
    locator: LOCATOR_SCHEMA,
    visible: z.boolean(),
  }),
  z.strictObject({ ...COMMON_STEP, action: z.literal('assertUrl'), ...ROUTE_FIELDS }),
  z.strictObject({ ...COMMON_STEP, action: z.literal('screenshot') }),
]);

/** 截图、视频和 Trace 均只通过引用跨进程传递。 */
export const ARTIFACT_KIND_SCHEMA = z.enum(['screenshot', 'video', 'trace']);
const PLATFORM_SCHEMA = z.enum(['pc', 'android', 'ios']);
const BROWSER_SCHEMA = z.enum(['chromium', 'chrome', 'edge', 'safari']);
const MODE_SCHEMA = z.enum(['background', 'visible']);

/** 一次尝试使用固定用例版本和环境版本，后续编辑不改变此快照。 */
export const TASK_SCHEMA = z.strictObject({
  protocolVersion: z.literal(1),
  id: ID_SCHEMA,
  attempt: z.number().int().min(1).max(100),
  case: z.strictObject({
    id: ID_SCHEMA,
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    steps: z.array(STEP_SCHEMA).min(1).max(1000),
  }),
  environment: z.strictObject({
    id: ID_SCHEMA,
    revision: z.number().int().positive(),
    name: z.string().min(1).max(100),
    sites: z.record(ID_SCHEMA, z.string().max(2000).refine(isSiteUrl)),
  }),
  target: z.strictObject({ platform: PLATFORM_SCHEMA, browser: BROWSER_SCHEMA, mode: MODE_SCHEMA }),
  variables: z.record(ID_SCHEMA, TEXT_SCHEMA).default({}),
  artifacts: z.array(ARTIFACT_KIND_SCHEMA).max(3).default([]),
});

/** 能力由具体驱动声明；这里的声明不代表已经通过真机验收。 */
export const CAPABILITIES_SCHEMA = z.strictObject({
  protocolVersion: z.literal(1),
  driver: z.enum(['playwright', 'appium']),
  platform: PLATFORM_SCHEMA,
  browser: BROWSER_SCHEMA,
  actions: z.array(
    z.enum([
      'navigate',
      'fill',
      'select',
      'check',
      'click',
      'waitFor',
      'assertText',
      'assertVisible',
      'assertUrl',
      'screenshot',
    ]),
  ),
  locators: z.array(z.enum(['testId', 'role', 'label', 'css'])),
  modes: z.array(MODE_SCHEMA),
  artifacts: z.array(ARTIFACT_KIND_SCHEMA),
});

/** 可持久化的任务快照，输入值不支持任意代码或模板表达式。 */
export type TestTask = z.infer<typeof TASK_SCHEMA>;
/** 驱动对当前会话的显式能力声明。 */
export type DriverCapabilities = z.infer<typeof CAPABILITIES_SCHEMA>;
/** 用例中的单个声明式步骤。 */
export type TestStep = z.infer<typeof STEP_SCHEMA>;
/** 字符串值或命名变量引用。 */
export type InputValue = z.infer<typeof VALUE_SCHEMA>;

/** 错误只暴露固定代码，避免将输入内容或凭据写进日志。 */
export class ContractError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_TASK'
      | 'INVALID_CAPABILITIES'
      | 'INVALID_RESULT'
      | 'INVALID_EVENT'
      | 'INVALID_ROUTE'
      | 'MISSING_VARIABLE'
      | 'MISSING_SITE',
  ) {
    super(`协议校验失败：${code}`);
    this.name = 'ContractError';
  }
}

/**
 * 解析不可信任务输入并返回独立快照。
 * @param input 来自文件、API 或执行器消息的原始数据。
 * @returns 经过校验的任务。
 */
export function parseTask(input: unknown): TestTask {
  const result = TASK_SCHEMA.safeParse(input);
  if (!result.success) throw new ContractError('INVALID_TASK');
  const ids = result.data.case.steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length) throw new ContractError('INVALID_TASK');
  return result.data;
}

/**
 * 解析当前驱动的能力，禁止根据名称猜测支持范围。
 * @param input 原始能力声明。
 * @returns 经过校验的能力。
 */
export function parseCapabilities(input: unknown): DriverCapabilities {
  const result = CAPABILITIES_SCHEMA.safeParse(input);
  if (!result.success) throw new ContractError('INVALID_CAPABILITIES');
  return result.data;
}
