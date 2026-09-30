import { useState } from 'react';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { getAppThemeColor } from '@/lib/constants';
import { createQueryClient } from '@/lib/queryClient';
import { useFilterStore } from '@/stores/filterStore';

dayjs.locale('zh-cn');

/** 根据当前项目切换 antd 主题色 */
function AppTheme({ children }: { children: React.ReactNode }) {
  const appId = useFilterStore((s) => s.appId);
  const colorPrimary = getAppThemeColor(appId);

  return (
    <ConfigProvider
      theme={{
        cssVar: { key: 'monitor' },
        hashed: false,
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          cssVar: { key: 'monitor' },
          hashed: false,
          token: {
            colorPrimary: getAppThemeColor('qly'),
            borderRadius: 8,
            colorBgLayout: '#f0f2f5',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
          },
          components: {
            Card: {
              headerFontSize: 15,
            },
            Table: {
              headerBorderRadius: 0,
            },
            Layout: {
              headerHeight: 56,
            },
          },
        }}
      >
        <AntApp>
          <AppTheme>{children}</AppTheme>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
