export const APP_OPTIONS = [
  { label: 'qly', value: 'qly' },
  { label: 'bsd', value: 'bsd' },
  { label: 'dy-ht', value: 'dy-ht' },
  { label: 'demo-app', value: 'demo-app' },
] as const;

export type AppId = (typeof APP_OPTIONS)[number]['value'];

/** 每个项目独立主题色（antd colorPrimary） */
export const APP_THEME_COLORS: Record<AppId, string> = {
  qly: '#fa8c16',
  bsd: '#003a8c',
  'dy-ht': '#eb2f96',
  'demo-app': '#722ed1',
};

export function getAppThemeColor(appId: AppId): string {
  return APP_THEME_COLORS[appId] || APP_THEME_COLORS.qly;
}

export const API_BASE = 'https://api.lihuihao.chat';
