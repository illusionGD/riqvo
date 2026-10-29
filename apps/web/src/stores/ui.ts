import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ThemeMode } from '../types/ui';

const THEME_KEY = 'riqvo.ui.theme';

/**
 * 浏览器禁用存储或偏好值无效时使用浅色，保证界面仍可打开。
 * @returns 已保存的主题模式或默认浅色模式。
 */
function readMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* 隐私模式下仍可使用会话内主题切换。 */
  }
  return 'light';
}

/** 主题状态独立于测试任务，切换或刷新不会触发执行操作。 */
export const useUiStore = defineStore('ui', () => {
  const mode = ref<ThemeMode>(readMode());
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const systemDark = ref(media.matches);
  const isDark = computed(
    () => mode.value === 'dark' || (mode.value === 'system' && systemDark.value),
  );
  let listening = false;

  /** 只更新系统偏好，手动选择的主题不会被系统变化覆盖。 */
  function syncSystem(): void {
    systemDark.value = media.matches;
  }
  /** 应用根部挂载时监听系统配色，重复调用不会新增监听。 */
  function connect(): void {
    if (listening) return;
    listening = true;
    syncSystem();
    media.addEventListener('change', syncSystem);
  }
  /** 应用卸载时清理监听。 */
  function disconnect(): void {
    media.removeEventListener('change', syncSystem);
    listening = false;
  }
  /**
   * 保存用户明确选择的主题，存储不可用时仍立即生效。
   * @param value 浅色、深色或跟随系统。
   */
  function setMode(value: ThemeMode): void {
    mode.value = value;
    try {
      window.localStorage.setItem(THEME_KEY, value);
    } catch {
      /* 不因界面偏好保存失败打断测试工作流。 */
    }
  }
  return { mode, isDark, connect, disconnect, setMode };
});
