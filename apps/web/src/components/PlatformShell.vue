<template>
  <div class="platform-shell">
    <aside class="platform-shell__sidebar">
      <div class="platform-shell__brand">
        <span class="platform-shell__mark">r</span
        ><span class="platform-shell__brand-name">riqvo<span>自动化测试平台</span></span>
      </div>
      <div class="platform-shell__workspace">
        <span class="platform-shell__workspace-icon" aria-hidden="true">P</span>
        <div>本机工作区<small>PC 浏览器测试</small></div>
      </div>
      <p class="platform-shell__nav-label">测试管理</p>
      <nav aria-label="平台导航" class="platform-shell__nav">
        <button
          v-for="item in NAV_ITEMS"
          :key="item.key"
          type="button"
          :class="{ 'is-active': section === item.key }"
          :aria-current="section === item.key ? 'page' : undefined"
          :aria-label="item.label"
          :title="item.label"
          @click="selectSection(item.key)"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="item.icon" /></svg
          ><span>{{ item.label }}</span>
        </button>
      </nav>
      <div class="platform-shell__footer">
        <span class="platform-shell__connection" :class="{ 'is-connected': connected }"></span
        ><span>{{ connected ? '执行器已连接' : '等待执行器连接' }}</span>
      </div>
    </aside>
    <div class="platform-shell__body">
      <header class="platform-shell__topbar">
        <div class="platform-shell__breadcrumb">
          <span>自动化测试</span><span aria-hidden="true">/</span
          ><strong>{{ currentLabel }}</strong>
        </div>
        <div class="platform-shell__tools">
          <NTag
            class="platform-shell__status"
            size="small"
            :bordered="false"
            :type="connected ? 'success' : 'warning'"
            >{{ statusLabel }}</NTag
          >
          <div class="platform-shell__themes" role="group" aria-label="主题模式">
            <NButton
              size="small"
              :type="ui.mode === 'light' ? 'primary' : 'default'"
              :quaternary="ui.mode !== 'light'"
              :aria-pressed="ui.mode === 'light'"
              aria-label="浅色主题"
              @click="useLight"
              >浅色</NButton
            >
            <NButton
              size="small"
              :type="ui.mode === 'dark' ? 'primary' : 'default'"
              :quaternary="ui.mode !== 'dark'"
              :aria-pressed="ui.mode === 'dark'"
              aria-label="深色主题"
              @click="useDark"
              >深色</NButton
            >
            <NButton
              size="small"
              :type="ui.mode === 'system' ? 'primary' : 'default'"
              :quaternary="ui.mode !== 'system'"
              :aria-pressed="ui.mode === 'system'"
              aria-label="跟随系统主题"
              @click="useSystem"
              >系统</NButton
            >
          </div>
        </div>
      </header>
      <div class="platform-shell__content"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NTag } from 'naive-ui';
import { useUiStore } from '../stores/ui';
import type { WorkbenchSection } from '../types/ui';

const ui = useUiStore();
const props = defineProps<{ section: WorkbenchSection; connected: boolean; statusLabel: string }>();
const emit = defineEmits<{ select: [section: WorkbenchSection] }>();
const currentLabel = computed(() => NAV_ITEMS.find((item) => item.key === props.section)?.label);
const NAV_ITEMS = [
  {
    key: 'workbench',
    label: '测试工作台',
    icon: 'M3 4h18v13H3z M8 21h8 M12 17v4 M7 8l3 3-3 3 M13 13h4',
  },
  { key: 'results', label: '运行结果', icon: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5' },
  {
    key: 'guide',
    label: '使用说明',
    icon: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1z M12 5v15',
  },
  { key: 'health', label: '系统状态', icon: 'M3 12h4l3-8 4 16 3-8h4' },
] as const;

/** 导航仅切换已实现的工作区，不重建执行器连接。 */
function selectSection(section: WorkbenchSection): void {
  emit('select', section);
}
/** 主题选择交由公共 store 持久化。 */
function useLight(): void {
  ui.setMode('light');
}
/** 深色覆盖导航与业务组件。 */
function useDark(): void {
  ui.setMode('dark');
}
/** 持续跟随操作系统的配色变化。 */
function useSystem(): void {
  ui.setMode('system');
}
</script>

<style scoped lang="scss">
.platform-shell {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  min-height: 100vh;
  &__sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    padding: 0 12px;
  }
  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 76px;
    padding: 0 10px;
  }
  &__mark {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    background: var(--color-accent);
    color: var(--color-surface);
    font-size: 28px;
    line-height: 1;
    font-weight: 700;
    border-radius: 9px;
  }
  &__brand-name {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  &__brand-name span {
    display: block;
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--color-muted);
    font-weight: 400;
  }
  &__workspace {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 10px;
    margin-bottom: 24px;
    background: var(--color-subtle);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
  }
  &__workspace small {
    display: block;
    color: var(--color-muted);
    font-size: 11px;
    font-weight: 400;
    margin-top: 2px;
  }
  &__workspace-icon {
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-accent);
    width: 28px;
    height: 28px;
    border-radius: 5px;
  }
  &__nav-label {
    margin: 0 12px 8px;
    color: var(--color-muted);
    font-size: 11px;
  }
  &__nav {
    display: grid;
    gap: 5px;
  }
  &__nav button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--color-muted);
    padding: 11px 12px;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }
  &__nav button:hover {
    background: var(--color-subtle);
    color: var(--color-text);
  }
  &__nav button.is-active {
    background: var(--color-selected);
    color: var(--color-accent);
    font-weight: 600;
  }
  &__nav svg {
    width: 19px;
    height: 19px;
    flex: none;
  }
  &__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: auto;
    border-top: 1px solid var(--color-border);
    padding: 18px 10px;
    font-size: 11px;
    color: var(--color-muted);
  }
  &__connection {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--color-muted);
  }
  &__connection.is-connected {
    background: #18a058;
  }
  &__body {
    min-width: 0;
  }
  &__topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    height: 58px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  &__breadcrumb {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 12px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  &__breadcrumb strong {
    font-weight: 500;
    color: var(--color-text);
  }
  &__tools {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  &__themes {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-subtle);
  }
  &__content {
    min-width: 0;
  }
}
@media (max-width: 1050px) {
  .platform-shell {
    grid-template-columns: 64px minmax(0, 1fr);
    &__sidebar {
      padding: 0 8px;
    }
    &__brand {
      padding: 0;
      justify-content: center;
    }
    &__brand-name,
    &__workspace,
    &__nav-label,
    &__nav span,
    &__footer span:last-child {
      display: none;
    }
    &__nav button,
    &__footer {
      justify-content: center;
    }
    &__topbar {
      padding: 0 16px;
    }
    &__status {
      display: none;
    }
  }
}
@media (max-width: 640px) {
  .platform-shell {
    grid-template-columns: 52px minmax(0, 1fr);
    &__sidebar {
      padding: 0 4px;
    }
    &__mark {
      width: 30px;
      height: 30px;
    }
    &__topbar {
      padding: 0 10px;
      gap: 8px;
    }
    &__breadcrumb > span {
      display: none;
    }
    &__themes :deep(.n-button) {
      padding: 0 8px;
    }
  }
}
</style>
