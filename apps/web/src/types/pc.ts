import type { ArtifactReference, RunResult, StepResult, TestTask } from '@riqvo/contracts';

/** 本机原型的 HTTP 状态，与业务输入分开保存。 */
export interface PcState {
  mode: 'idle' | 'opening' | 'recording' | 'running' | 'finishing';
  draft?: TestTask;
  result?: RunResult;
  progress: StepResult[];
  recordingArtifacts: ArtifactReference[];
  issue?: string;
}
