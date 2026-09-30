import { Card, Col, Row, Statistic, Typography } from "antd";
import { chartColorAt } from "@/lib/chartColors";
import { formatNumber } from "@/lib/format";

export interface SummaryItem {
  title: string;
  value: number | string;
  suffix?: string;
  precision?: number;
  /** 指标说明文案 */
  description?: string;
  /** 覆盖默认调色盘颜色（一般不需要） */
  color?: string;
}

export function MetricSummary({
  items,
  loading,
}: {
  items: SummaryItem[];
  loading?: boolean;
}) {
  const colSpan = items.length <= 4 ? 6 : items.length === 5 ? undefined : 4;

  return (
    <Card
      className="monitor-card"
      title="指标汇总"
      loading={loading}
      styles={{ body: { paddingTop: 12, paddingBottom: 12 } }}
    >
      <Row gutter={[12, 12]} wrap>
        {items.map((item, index) => {
          const raw = item.value;
          const value =
            typeof raw === "number"
              ? Number.isFinite(raw)
                ? raw
                : 0
              : raw == null || raw === ""
              ? 0
              : raw;

          return (
            <Col
              key={item.title}
              xs={12}
              sm={8}
              md={colSpan}
              flex={items.length === 5 ? "1 1 160px" : undefined}
            >
              <div className="monitor-metric-tile">
                <Statistic
                  title={item.title}
                  value={typeof value === "number" ? value : Number(value) || 0}
                  suffix={item.suffix}
                  styles={{
                    content: {
                      color: item.color || chartColorAt(index),
                    },
                  }}
                  formatter={(val) =>
                    formatNumber(Number(val), { precision: item.precision })
                  }
                />
                {item.description ? (
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2, tooltip: item.description }}
                    className="monitor-metric-desc"
                  >
                    {item.description}
                  </Typography.Paragraph>
                ) : null}
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
  );
}
