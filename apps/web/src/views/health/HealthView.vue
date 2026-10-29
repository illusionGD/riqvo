<template>
  <section class="health-view" aria-label="平台服务健康">
    <section
      class="health-view__panel"
      aria-labelledby="connection-title"
      :aria-busy="store.loading"
    >
      <div class="health-view__summary">
        <div>
          <span
            class="health-view__indicator"
            :class="{ 'is-ready': store.ready }"
            aria-hidden="true"
          ></span>
          <h2 id="connection-title" class="health-view__status">{{ title }}</h2>
          <p class="health-view__description">{{ description }}</p>
        </div>
        <NButton
          class="health-view__refresh"
          :loading="store.loading"
          :disabled="store.loading"
          @click="handleRefresh"
        >
          {{ store.loading ? '检查中…' : '重新检查' }}
        </NButton>
      </div>

      <NAlert v-if="store.error" class="health-view__error" type="error" role="alert">
        {{ store.error }}
      </NAlert>
      <ul class="health-view__checks" aria-label="依赖服务状态" aria-live="polite">
        <li v-for="dependency in dependencies" :key="dependency.key" class="health-view__check">
          <div>
            <h3>{{ dependency.label }}</h3>
            <p>{{ dependency.description }}</p>
          </div>
          <NTag
            class="health-view__badge"
            :type="statusType(dependency.key)"
            :bordered="false"
            size="small"
          >
            {{ statusText(dependency.key) }}
          </NTag>
        </li>
      </ul>
      <p class="health-view__updated">
        {{ store.checkedAt ? `最近检查 ${store.checkedAt}` : '正在建立连接' }}
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { NAlert, NButton, NTag, type TagProps } from 'naive-ui';
import { useHealthStore } from '../../stores/health';
import type { HealthSnapshot } from '../../types/health';

type DependencyKey = keyof HealthSnapshot['checks'];

const store = useHealthStore();
const title = computed(() => {
  if (store.loading && !store.snapshot) return '正在检查连接';
  if (store.error) return '连接中断';
  return store.ready ? '服务已就绪' : '服务暂不可用';
});
const description = computed(() =>
  store.ready ? '平台依赖检查通过，基础服务运行正常。' : '检查未通过的服务，处理后可重新检查。',
);
const dependencies: { key: DependencyKey; label: string; description: string }[] = [
  { key: 'mysql', label: '数据服务', description: 'MySQL 连接与数据库初始化' },
  { key: 'redis', label: '任务基础服务', description: 'Redis 连接状态' },
  { key: 'artifacts', label: '产物存储', description: '视频、截图等产物目录的读写能力' },
];

onMounted(handleRefresh);

/** 仅通过 store action 刷新，确保加载和错误状态一致。 */
async function handleRefresh(): Promise<void> {
  await store.refresh();
}

/**
 * 转换公共就绪状态，不能将未检查的依赖显示为可用。
 * @param key 当前行展示的依赖。
 * @returns 展示给用户的就绪状态文字。
 */
function statusText(key: DependencyKey): string {
  const status = store.snapshot?.checks[key];
  if (!status) return store.loading ? '检查中' : '未连接';
  return { ready: '已就绪', unavailable: '不可用', migration_required: '待初始化' }[status];
}

/**
 * 区分依赖失败、未检查和未初始化状态。
 * @param key 当前行展示的依赖。
 * @returns 对应的 Naive UI 状态样式。
 */
function statusType(key: DependencyKey): TagProps['type'] {
  const status = store.snapshot?.checks[key];
  if (!status) return 'default';
  return { ready: 'success', unavailable: 'error', migration_required: 'warning' }[
    status
  ] as TagProps['type'];
}
</script>

<style scoped lang="scss">
.health-view {
  &__panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    overflow: hidden;
  }
  &__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: 28px;
  }
  &__indicator {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 10px;
    border-radius: 50%;
    background: var(--color-error);
  }
  &__indicator.is-ready {
    background: var(--color-accent);
  }
  &__status {
    display: inline;
    font-size: 20px;
    font-weight: 600;
  }
  &__description {
    margin-bottom: 0;
    color: var(--color-muted);
    font-size: 14px;
    line-height: 1.6;
  }
  &__refresh {
    flex-shrink: 0;
  }
  &__checks {
    list-style: none;
    margin: 0;
    padding: 0 28px;
  }
  &__check {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-md);
    border-top: 1px solid var(--color-border);
    padding: 20px 0;
  }
  &__check h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 6px;
  }
  &__check p {
    color: var(--color-muted);
    font-size: 13px;
    margin: 0;
  }
  &__badge {
    flex-shrink: 0;
  }
  &__error {
    margin: 0 28px 20px;
  }
  &__updated {
    border-top: 1px solid var(--color-border);
    margin: 0;
    padding: 14px 28px;
    color: var(--color-muted);
    font-size: 12px;
  }
}

@media (max-width: 560px) {
  .health-view {
    &__summary {
      align-items: flex-start;
      flex-direction: column;
      padding: 20px;
    }
    &__checks {
      padding: 0 20px;
    }
  }
}
</style>
