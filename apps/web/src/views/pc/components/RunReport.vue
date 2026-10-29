<template>
  <section class="run-report" aria-label="最近一次运行">
    <div class="run-report__heading">
      <h2>最近一次运行</h2>
      <NTag
        v-if="state?.result"
        data-testid="run-status"
        :type="state.result.status === 'passed' ? 'success' : 'warning'"
        >{{ STATUS_LABELS[state.result.status] }}</NTag
      >
    </div>
    <p v-if="state?.result && state.draft" class="run-report__caption">
      {{ state.draft.case.title }} · 版本 {{ state.draft.case.version }} ·
      {{ state.draft.target.browser }} · {{ state.result.taskId }}
    </p>
    <p v-if="state?.result?.error" role="alert">执行错误：{{ state.result.error.code }}</p>
    <p v-if="state?.result?.status === 'unverified'">
      操作已执行，但用例没有业务断言。请添加检查后再验证。
    </p>
    <NEmpty
      v-if="!state?.progress.length && !state?.recordingArtifacts.length"
      description="开始回放后查看步骤结果与录像"
    />
    <ol v-if="state?.progress.length" class="run-report__steps">
      <li v-for="step in state.progress" :key="step.stepId">
        <span>{{ step.stepId }}</span
        ><span
          >{{ STATUS_LABELS[step.status] }}
          <code v-if="step.error">{{ step.error.code }}</code></span
        >
      </li>
    </ol>
    <div class="run-report__media" data-testid="result-media">
      <figure v-for="artifact in videos" :key="artifact.id">
        <video :src="artifactUrl(artifact)" controls preload="metadata" aria-label="运行录像" />
        <figcaption>{{ state?.result ? '回放录像' : '录制会话录像' }}</figcaption>
      </figure>
      <details v-if="screenshots.length">
        <summary>查看截图（{{ screenshots.length }}）</summary>
        <div class="run-report__screenshots">
          <a
            v-for="artifact in screenshots"
            :key="artifact.id"
            :href="artifactUrl(artifact)"
            target="_blank"
            rel="noopener"
            ><img
              :src="artifactUrl(artifact)"
              :alt="`步骤 ${artifact.stepId ?? ''} 截图`"
              loading="lazy"
          /></a>
        </div>
      </details>
      <p v-for="artifact in missing" :key="artifact.id">
        {{ artifact.kind === 'video' ? '录像' : '截图' }}不可用：{{
          artifact.state === 'missing' ? artifact.reason : '已过期'
        }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NEmpty, NTag } from 'naive-ui';
import type { PcState } from '../../../types/pc';
import { artifactUrl } from '../../../services/pc-service';
import { STATUS_LABELS } from '../pc-labels';

const props = defineProps<{ state: PcState | undefined }>();
const artifacts = computed(
  () => props.state?.result?.artifacts ?? props.state?.recordingArtifacts ?? [],
);
const videos = computed(() =>
  artifacts.value.filter((value) => value.state === 'available' && value.kind === 'video'),
);
const screenshots = computed(() =>
  artifacts.value.filter((value) => value.state === 'available' && value.kind === 'screenshot'),
);
const missing = computed(() => artifacts.value.filter((value) => value.state !== 'available'));
</script>

<style scoped lang="scss">
.run-report {
  &__heading {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  &__caption {
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }
  &__steps {
    padding: 0;
    list-style: none;
    max-height: 280px;
    overflow: auto;
  }
  &__steps li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm);
    border-bottom: 1px solid var(--color-border);
  }
  &__media figure {
    margin: var(--space-md) 0;
  }
  &__media video {
    display: block;
    width: min(100%, 760px);
    border-radius: 8px;
    background: var(--color-text);
  }
  &__media figcaption {
    color: var(--color-muted);
    padding-top: var(--space-sm);
  }
  &__media summary {
    cursor: pointer;
    padding: var(--space-sm) 0;
  }
  &__screenshots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-sm);
  }
  &__screenshots img {
    width: 100%;
    border: 1px solid var(--color-border);
  }
}
</style>
