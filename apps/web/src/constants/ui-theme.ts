import type { GlobalThemeOverrides } from 'naive-ui';

/** 浅色后台主题，颜色与全局设计变量对应。 */
export const UI_THEME = {
  common: {
    primaryColor: '#5269d8',
    primaryColorHover: '#6b7fe6',
    primaryColorPressed: '#4055b9',
    primaryColorSuppl: '#5269d8',
    successColor: '#16845b',
    errorColor: '#b84242',
    textColorBase: '#253044',
    borderRadius: '6px',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  },
} as const satisfies GlobalThemeOverrides;

/** 深色组件主题避免复用浅色文字，保证表单与弹层可读。 */
export const UI_DARK_THEME = {
  common: {
    primaryColor: '#a1b1ff',
    primaryColorHover: '#bdc7ff',
    primaryColorPressed: '#8799ed',
    primaryColorSuppl: '#a1b1ff',
    successColor: '#63d8aa',
    errorColor: '#ee9999',
    textColorBase: '#e5e9f1',
    borderRadius: '6px',
    bodyColor: '#141820',
    cardColor: '#1e242e',
    modalColor: '#1e242e',
    popoverColor: '#262e3b',
    fontFamily: UI_THEME.common.fontFamily,
  },
} as const satisfies GlobalThemeOverrides;
