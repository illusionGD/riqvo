import { z } from 'zod';
import { ContractError, ID_SCHEMA, parseTask } from './task';
import {
  ARTIFACT_SCHEMA,
  RUN_RESULT_SCHEMA,
  STEP_RESULT_SCHEMA,
  parseRunResult,
  validArtifact,
  validStepResult,
} from './result';

const ENVELOPE = {
  protocolVersion: z.literal(1),
  taskId: ID_SCHEMA,
  attempt: z.number().int().min(1).max(100),
  sequence: z.number().int().positive(),
  at: z.iso.datetime(),
};
const EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({ ...ENVELOPE, type: z.literal('run.started') }),
  z.strictObject({ ...ENVELOPE, type: z.literal('step.started'), stepId: ID_SCHEMA }),
  z.strictObject({ ...ENVELOPE, type: z.literal('step.finished'), result: STEP_RESULT_SCHEMA }),
  z.strictObject({ ...ENVELOPE, type: z.literal('artifact.recorded'), artifact: ARTIFACT_SCHEMA }),
  z.strictObject({ ...ENVELOPE, type: z.literal('run.finished'), result: RUN_RESULT_SCHEMA }),
]);

/** 每次尝试内 sequence 从 1 递增；接收端负责持久化、排序及去重。 */
export type RunEvent = z.infer<typeof EVENT_SCHEMA>;

/**
 * 校验单条事件与任务一致；跨消息顺序和投递不由无状态协议包处理。
 * @param taskInput 原始任务快照。
 * @param input 原始执行事件。
 * @returns 已校验事件。
 */
export function parseRunEvent(taskInput: unknown, input: unknown): RunEvent {
  const task = parseTask(taskInput);
  const parsed = EVENT_SCHEMA.safeParse(input);
  if (!parsed.success) throw new ContractError('INVALID_EVENT');
  const event = parsed.data;
  if (event.taskId !== task.id || event.attempt !== task.attempt)
    throw new ContractError('INVALID_EVENT');
  if (event.type === 'step.started' || event.type === 'step.finished') {
    const id = event.type === 'step.started' ? event.stepId : event.result.stepId;
    if (!task.case.steps.some((step) => step.id === id)) throw new ContractError('INVALID_EVENT');
    if (
      event.type === 'step.finished' &&
      (!validStepResult(event.result) || Date.parse(event.at) < Date.parse(event.result.finishedAt))
    )
      throw new ContractError('INVALID_EVENT');
  }
  if (event.type === 'artifact.recorded' && !validArtifact(task, event.artifact))
    throw new ContractError('INVALID_EVENT');
  if (event.type === 'run.finished') {
    try {
      parseRunResult(task, event.result);
      if (Date.parse(event.at) < Date.parse(event.result.finishedAt))
        throw new ContractError('INVALID_EVENT');
    } catch {
      throw new ContractError('INVALID_EVENT');
    }
  }
  return event;
}
