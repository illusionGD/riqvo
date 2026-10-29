<template>
  <div class="health-view">
    <header class="health-view__header">
      <a class="health-view__brand" href="/" aria-label="riqvo 首页">
        <span class="health-view__mark" aria-hidden="true">r</span>riqvo
      </a>
      <span class="health-view__phase">工程基础 · D01</span>
    </header>

    <main class="health-view__main">
      <p class="health-view__eyebrow">WEB 自动化测试平台</p>
      <h1 class="health-view__title">从连接就绪开始。</h1>
      <p class="health-view__intro">检查平台服务状态，为配置项目和接入执行器做好准备。</p>

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

      <aside class="health-view__note">
        <h2>管理与执行，各就其位</h2>
        <p>
          通过网页管理测试，由执行器控制电脑浏览器或连接的手机。当前已建立工程入口，用例录制和设备绑定将在后续功能中开放。
        </p>
      </aside>
    </main>
    <footer class="health-view__footer">PC 浏览器 · 安卓 Chrome · iPhone Safari</footer>
  </div>
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

/** Refresh only through the store action to keep loading and error states consistent. */
async function handleRefresh(): Promise<void> {
  await store.refresh();
}

/**
 * Translate public readiness states; never show an unchecked dependency as available.
 * @param key Dependency shown by the current row.
 * @returns User-facing readiness label.
 */
function statusText(key: DependencyKey): string {
  const status = store.snapshot?.checks[key];
  if (!status) return store.loading ? '检查中' : '未连接';
  return { ready: '已就绪', unavailable: '不可用', migration_required: '待初始化' }[status];
}

/**
 * Distinguish a failed dependency from an unchecked or uninitialized one.
 * @param key Dependency shown by the current row.
 * @returns The corresponding Naive UI status treatment.
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
  min-height: 100vh;
  padding: 0 var(--space-xl);

  &__header,
  &__main,
  &__footer {
    max-width: 960px;
    margin: 0 auto;
  }
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28px 0;
    border-bottom: 1px solid var(--color-border);
  }
  &__brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--color-text);
    text-decoration: none;
    font-size: 25px;
    font-weight: 700;
    letter-spacing: -1px;
  }
  &__mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: var(--color-accent);
    color: white;
    font-size: 27px;
  }
  &__phase,
  &__eyebrow {
    color: var(--color-muted);
    font-size: 12px;
    letter-spacing: 0.07em;
  }
  &__main {
    padding: 60px 0 36px;
  }
  &__eyebrow {
    color: var(--color-accent);
    font-weight: 600;
  }
  &__title {
    margin: var(--space-md) 0;
    font-size: clamp(28px, 4vw, 40px);
    letter-spacing: -1px;
    font-weight: 600;
  }
  &__intro {
    margin-bottom: 36px;
    color: var(--color-muted);
    line-height: 1.7;
  }
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
  &__note {
    padding: 24px 0 0;
    max-width: 680px;
  }
  &__note h2 {
    font-size: 14px;
    font-weight: 600;
  }
  &__note p {
    color: var(--color-muted);
    line-height: 1.8;
    font-size: 13px;
  }
  &__footer {
    padding: 20px 0 28px;
    font-size: 12px;
    color: var(--color-muted);
  }
}

@media (max-width: 560px) {
  .health-view {
    padding: 0 var(--space-md);
    &__main {
      padding-top: 36px;
    }
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
