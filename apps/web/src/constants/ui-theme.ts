import type { GlobalThemeOverrides } from 'naive-ui';

/** 共享 Naive UI 主题；主色和状态色与全局 SCSS 变量保持一致。 */
export const UI_THEME = {
  common: {
    primaryColor: '#166c55',
    primaryColorHover: '#25836a',
    primaryColorPressed: '#105440',
    primaryColorSuppl: '#166c55',
    successColor: '#166c55',
    errorColor: '#a23d2b',
    textColorBase: '#22312d',
    borderRadius: '8px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  },
} as const satisfies GlobalThemeOverrides;
