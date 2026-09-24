export const APP_OPTIONS = [
  { label: 'qly', value: 'qly' },
  { label: 'bsd', value: 'bsd' },
  { label: 'dy-ht', value: 'dy-ht' },
  { label: 'demo-app', value: 'demo-app' },
] as const;

export const API_BASE = 'https://api.lihuihao.chat';

export type AppId = (typeof APP_OPTIONS)[number]['value'];
