import { z } from 'zod';
import { ARTIFACT_KIND_SCHEMA, ContractError, ID_SCHEMA, parseTask } from './task';
import type { TestTask } from './task';

/** 结果使用固定错误代码；原始日志通过受控诊断引用另行保存。 */
const ERROR_SCHEMA = z.strictObject({
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
  diagnosticId: ID_SCHEMA.optional(),
});
const TIMING = { startedAt: z.iso.datetime(), finishedAt: z.iso.datetime() };

/** 媒体可用性独立于测试结果；丢失或清理不伪造下载地址。 */
export const ARTIFACT_SCHEMA = z.discriminatedUnion('state', [
  z.strictObject({
    id: ID_SCHEMA,
    kind: ARTIFACT_KIND_SCHEMA,
    stepId: ID_SCHEMA.optional(),
    state: z.literal('available'),
    reference: ID_SCHEMA,
  }),
  z.strictObject({
    id: ID_SCHEMA,
    kind: ARTIFACT_KIND_SCHEMA,
    stepId: ID_SCHEMA.optional(),
    state: z.literal('missing'),
    reason: z.enum(['CAPTURE_FAILED', 'UPLOAD_FAILED']),
  }),
  z.strictObject({
    id: ID_SCHEMA,
    kind: ARTIFACT_KIND_SCHEMA,
    stepId: ID_SCHEMA.optional(),
    state: z.literal('expired'),
  }),
]);
/** 单步结束记录，不接受定位器或输入值等冗余敏感字段。 */
export const STEP_RESULT_SCHEMA = z.strictObject({
  stepId: ID_SCHEMA,
  status: z.enum(['passed', 'failed', 'skipped', 'cancelled', 'unsupported']),
  ...TIMING,
  error: ERROR_SCHEMA.optional(),
});
/** 一个任务的一次尝试，重试须使用新的 attempt。 */
export const RUN_RESULT_SCHEMA = z.strictObject({
  protocolVersion: z.literal(1),
  taskId: ID_SCHEMA,
  attempt: z.number().int().min(1).max(100),
  status: z.enum(['passed', 'failed', 'cancelled', 'unsupported', 'unverified']),
  ...TIMING,
  steps: z.array(STEP_RESULT_SCHEMA).max(1000),
  artifacts: z.array(ARTIFACT_SCHEMA).max(3000),
  error: ERROR_SCHEMA.optional(),
});

/** 与一次运行绑定的最终报告。 */
export type RunResult = z.infer<typeof RUN_RESULT_SCHEMA>;
/** 步骤执行记录；不能据此推断整个任务成功。 */
export type StepResult = z.infer<typeof STEP_RESULT_SCHEMA>;
/** 媒体产物的受控引用及可用状态。 */
export type ArtifactReference = z.infer<typeof ARTIFACT_SCHEMA>;

/**
 * 校验错误代码与执行状态一致。
 * @param value 步骤或运行记录。
 * @returns 状态与错误是否一致。
 */
function validOutcome(value: { status: string; error?: z.infer<typeof ERROR_SCHEMA> }): boolean {
  if (value.status === 'passed' || value.status === 'skipped' || value.status === 'unverified')
    return !value.error;
  if (value.status === 'cancelled') return value.error?.code === 'CANCELLED';
  if (value.status === 'unsupported') return value.error?.code === 'UNSUPPORTED_CAPABILITY';
  return !!value.error && !['CANCELLED', 'UNSUPPORTED_CAPABILITY'].includes(value.error.code);
}

/**
 * 校验单步结束记录的时序和状态。
 * @param value 已解析的步骤结果。
 * @returns 是否具有一致语义。
 */
export function validStepResult(value: StepResult): boolean {
  return Date.parse(value.finishedAt) >= Date.parse(value.startedAt) && validOutcome(value);
}

/**
 * 检查产物是否引用当前用例的步骤。
 * @param task 任务快照。
 * @param artifact 已解析产物。
 * @returns 引用是否属于当前任务。
 */
export function validArtifact(task: TestTask, artifact: ArtifactReference): boolean {
  return !artifact.stepId || task.case.steps.some((step) => step.id === artifact.stepId);
}

/**
 * 校验最终报告与快照、尝试编号及执行记录一致，避免伪造通过。
 * @param taskInput 原始任务快照。
 * @param input 原始报告。
 * @returns 通过完整性校验的报告。
 */
export function parseRunResult(taskInput: unknown, input: unknown): RunResult {
  const task = parseTask(taskInput);
  const parsed = RUN_RESULT_SCHEMA.safeParse(input);
  if (!parsed.success) throw new ContractError('INVALID_RESULT');
  const result = parsed.data;
  const start = Date.parse(result.startedAt);
  const end = Date.parse(result.finishedAt);
  if (result.taskId !== task.id || result.attempt !== task.attempt || end < start)
    throw new ContractError('INVALID_RESULT');
  let previousEnd = start;
  let stopped = false;
  for (const [index, step] of result.steps.entries()) {
    if (
      step.stepId !== task.case.steps[index]?.id ||
      !validStepResult(step) ||
      Date.parse(step.startedAt) < previousEnd ||
      Date.parse(step.finishedAt) > end ||
      (stopped && step.status !== 'skipped')
    )
      throw new ContractError('INVALID_RESULT');
    previousEnd = Date.parse(step.finishedAt);
    if (['failed', 'cancelled', 'unsupported'].includes(step.status)) stopped = true;
  }
  if (
    new Set(result.artifacts.map((artifact) => artifact.id)).size !== result.artifacts.length ||
    result.artifacts.some((artifact) => !validArtifact(task, artifact))
  )
    throw new ContractError('INVALID_RESULT');
  const complete = result.steps.length === task.case.steps.length;
  const allPassed = result.steps.every((step) => step.status === 'passed');
  const hasAssertion = task.case.steps.some((step) =>
    ['assertText', 'assertVisible', 'assertUrl'].includes(step.action),
  );
  const terminal = result.steps.find((step) =>
    ['failed', 'cancelled', 'unsupported'].includes(step.status),
  );
  if (result.status === 'passed') {
    if (!complete || !allPassed || !hasAssertion || result.error)
      throw new ContractError('INVALID_RESULT');
  } else if (result.status === 'unverified') {
    if (!complete || terminal || (allPassed && hasAssertion) || result.error)
      throw new ContractError('INVALID_RESULT');
  } else {
    if (terminal && terminal.status !== result.status) throw new ContractError('INVALID_RESULT');
    if (
      !terminal &&
      (!result.error ||
        result.steps.some((step) => step.status !== 'passed' && step.status !== 'skipped'))
    )
      throw new ContractError('INVALID_RESULT');
    if (!validOutcome({ status: result.status, error: result.error ?? terminal?.error }))
      throw new ContractError('INVALID_RESULT');
  }
  return result;
}
