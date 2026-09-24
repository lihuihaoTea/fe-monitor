'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DatePicker, Layout, Menu, Select, Space, theme, Typography } from 'antd';
import {
  DashboardOutlined,
  AlertOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { APP_OPTIONS, type AppId } from '@/lib/constants';
import { useFilters } from '@/context/FilterContext';

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;

const NAV_ITEMS = [
  { key: '/stability', label: '稳定性看板', icon: <AlertOutlined /> },
  { key: '/performance', label: '性能看板', icon: <DashboardOutlined /> },
  { key: '/behavior', label: '用户行为看板', icon: <TeamOutlined /> },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = theme.useToken();
  const { appId, setAppId, dateRange, setDateRange, loading, refresh } = useFilters();

  const selectedKey = useMemo(() => {
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.key));
    return match?.key || '/stability';
  }, [pathname]);

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          paddingInline: 24,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          FE Monitor
        </Typography.Title>

        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS}
          onClick={({ key }) => router.push(key)}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent' }}
        />

        <Space size={12} wrap>
          <Select
            value={appId}
            options={[...APP_OPTIONS]}
            style={{ width: 140 }}
            onChange={(value: AppId) => setAppId(value)}
            placeholder="选择项目"
          />
          <RangePicker
            value={dateRange}
            allowClear={false}
            onChange={(values) => {
              if (values?.[0] && values?.[1]) {
                setDateRange([values[0] as Dayjs, values[1] as Dayjs]);
              }
            }}
          />
          <Typography.Link onClick={refresh} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </Typography.Link>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        {children}
      </Content>
    </Layout>
  );
}
