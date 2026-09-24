"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Button,
  DatePicker,
  Layout,
  Menu,
  Select,
  Space,
  theme,
  Typography,
} from "antd";
import {
  DashboardOutlined,
  AlertOutlined,
  TeamOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { APP_OPTIONS, APP_THEME_COLORS, type AppId } from "@/lib/constants";
import { useFilters } from "@/context/FilterContext";

const { Header, Content } = Layout;
const { RangePicker } = DatePicker;

const NAV_ITEMS = [
  { key: "/stability", label: "稳定性看板", icon: <AlertOutlined /> },
  { key: "/performance", label: "性能看板", icon: <DashboardOutlined /> },
  { key: "/behavior", label: "用户行为看板", icon: <TeamOutlined /> },
];

const APP_SELECT_OPTIONS = APP_OPTIONS.map((opt) => ({
  value: opt.value,
  label: (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: APP_THEME_COLORS[opt.value],
          flexShrink: 0,
        }}
      />
      {opt.label}
    </span>
  ),
}));

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token } = theme.useToken();
  const { appId, setAppId, dateRange, setDateRange, loading, refresh } =
    useFilters();

  const selectedKey = useMemo(() => {
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.key));
    return match?.key || "/stability";
  }, [pathname]);

  const pageTitle = useMemo(
    () => NAV_ITEMS.find((item) => item.key === selectedKey)?.label || "监控看板",
    [selectedKey]
  );

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          paddingInline: 24,
          height: 56,
          lineHeight: "56px",
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <Typography.Title
          level={4}
          style={{
            margin: 0,
            whiteSpace: "nowrap",
            fontSize: 17,
            letterSpacing: 0.2,
            color: token.colorPrimary,
          }}
        >
          日志监控
        </Typography.Title>

        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS}
          onClick={({ key }) => router.push(key)}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            background: "transparent",
            lineHeight: "54px",
          }}
        />

        <Space size={10} wrap>
          <Select
            value={appId}
            options={APP_SELECT_OPTIONS}
            style={{ width: 148 }}
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
          <Button
            type="default"
            icon={<ReloadOutlined spin={loading} />}
            onClick={refresh}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </Header>

      <Content
        style={{
          padding: "20px 24px 32px",
          maxWidth: 1360,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            {pageTitle}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {dateRange[0].format("YYYY-MM-DD")} ~ {dateRange[1].format("YYYY-MM-DD")}
          </Typography.Text>
        </div>
        {children}
      </Content>
    </Layout>
  );
}
