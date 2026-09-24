'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { FilterProvider, useFilters } from '@/context/FilterContext';
import { AppShell } from '@/components/AppShell';
import { getAppThemeColor } from '@/lib/constants';

dayjs.locale('zh-cn');

/** 根据当前项目切换 antd 主题色 */
function AppTheme({ children }: { children: React.ReactNode }) {
  const { appId } = useFilters();
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
  return (
    <AntdRegistry>
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
        <App>
          <FilterProvider>
            <AppTheme>
              <AppShell>{children}</AppShell>
            </AppTheme>
          </FilterProvider>
        </App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
