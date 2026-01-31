import type { ThemeConfig } from 'antd/es/config-provider';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#7c5cff',
    colorInfo: '#7c5cff',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#ff4d4f',
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Button: {
      primaryShadow: '0 2px 8px rgba(124, 92, 255, 0.3)',
    },
  },
};
