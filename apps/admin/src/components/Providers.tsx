'use client';

import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { FilterProvider } from '@/context/FilterContext';
import { AppShell } from '@/components/AppShell';

dayjs.locale('zh-cn');

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677FF',
            borderRadius: 8,
          },
        }}
      >
        <App>
          <FilterProvider>
            <AppShell>{children}</AppShell>
          </FilterProvider>
        </App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
