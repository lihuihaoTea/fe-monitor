import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
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
import { useFilters } from "@/hooks/useFilters";

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

/** 上下布局：固定 Header，Content 独立滚动 */
export function MainLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { token } = theme.useToken();
  const { appId, setAppId, dateRange, setDateRange, loading, refresh } =
    useFilters();

  const selectedKey = useMemo(() => {
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.key));
    return match?.key || "/stability";
  }, [pathname]);

  return (
    <Layout className="app-layout">
      <Header
        className="app-header"
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
          onClick={({ key }) => navigate(key)}
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
        className="app-content"
        style={{ background: token.colorBgLayout }}
      >
        <div className="app-content-inner">
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
