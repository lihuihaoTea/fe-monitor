import monitor, { getSharedMonitor } from './monitor';

export default monitor;
export { monitor, getSharedMonitor };
export type {
  MonitorConfig,
  MonitorEvent,
  UserTag,
  AssetGuardConfig,
  AssetFailContext,
  AssetFailSubType,
  AssetAction,
  AssetSeverity,
} from './types';
