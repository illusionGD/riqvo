import type { GlobalThemeOverrides } from 'naive-ui';

/** Shared Naive UI theme; keep the primary and status colors aligned with global SCSS tokens. */
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
