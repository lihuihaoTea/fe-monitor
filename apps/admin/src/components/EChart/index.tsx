import { Empty, Spin } from 'antd';
import {
  type CSSProperties,
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import echarts, {
  DEFAULT_CHART_THEME,
  type ECharts,
  type ECOption,
  type SetOptionOpts,
} from './echarts';
import styles from './index.module.css';
import { withDefaultChartOption } from './options';

export type { ECharts, ECOption, SetOptionOpts } from './echarts';

export type EChartClickParams = {
  data?: unknown;
  name?: string;
};

export type EChartRef = {
  /** 获取 ECharts 实例 */
  getInstance: () => ECharts | null;
  /** 手动触发 resize */
  resize: () => void;
};

export type EChartProps = {
  /** ECharts 配置；变化时会 setOption */
  option?: ECOption;
  /** 加载中（覆盖在图表上） */
  loading?: boolean;
  /** 空状态；为 true 时不渲染图表实例 */
  empty?: boolean;
  emptyDescription?: ReactNode;
  /** 图表高度，默认 320 */
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  /** 透传 echarts.init 的 theme */
  theme?: string | object;
  /** setOption 第三参，默认 notMerge: true */
  setOptionOpts?: SetOptionOpts;
  onChartReady?: (instance: ECharts) => void;
  onEvents?: {
    click?: (params: EChartClickParams) => void;
  };
};

const DEFAULT_SET_OPTION_OPTS: SetOptionOpts = { notMerge: true };

const EChart = forwardRef<EChartRef, EChartProps>(function EChart(
  {
    option,
    loading = false,
    empty = false,
    emptyDescription = '暂无数据',
    height = 260,
    width = '100%',
    className,
    style,
    theme = DEFAULT_CHART_THEME,
    setOptionOpts = DEFAULT_SET_OPTION_OPTS,
    onChartReady,
    onEvents,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const onChartReadyRef = useRef(onChartReady);
  const setOptionOptsRef = useRef(setOptionOpts);
  const onEventsRef = useRef(onEvents);

  onChartReadyRef.current = onChartReady;
  setOptionOptsRef.current = setOptionOpts;
  onEventsRef.current = onEvents;

  useImperativeHandle(ref, () => ({
    getInstance: () => chartRef.current,
    resize: () => {
      chartRef.current?.resize();
    },
  }));

  // init / dispose / auto resize
  useEffect(() => {
    if (empty) return;

    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, theme);
    chartRef.current = chart;
    onChartReadyRef.current?.(chart);

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(el);

    const onClick = (params: EChartClickParams) => {
      onEventsRef.current?.click?.(params);
    };
    chart.on('click', onClick);

    return () => {
      observer.disconnect();
      chart.off('click', onClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, [empty, theme]);

  // options 变化时更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || empty || !option) return;
    chart.setOption(withDefaultChartOption(option), setOptionOptsRef.current);
  }, [option, empty]);

  const rootStyle: CSSProperties = {
    height,
    width,
    minHeight: height,
    ...style,
  };

  const rootClassName = className ? `${styles.root} ${className}` : styles.root;

  if (empty) {
    return (
      <div className={rootClassName} style={rootStyle}>
        <div className={styles.placeholder}>
          {loading ? (
            <Spin description="加载中..." />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={rootClassName} style={rootStyle}>
      <Spin
        spinning={loading}
        description="加载中..."
        classNames={{
          root: styles.spinWrap,
          container: styles.spinContainer,
        }}
      >
        <div ref={containerRef} className={styles.canvas} />
      </Spin>
    </div>
  );
});

export default EChart;
