import { Navigate, Route, Routes } from 'react-router-dom';
import { StabilityDashboard } from '@/components/dashboards/StabilityDashboard';
import { PerformanceDashboard } from '@/components/dashboards/PerformanceDashboard';
import { BehaviorDashboard } from '@/components/dashboards/BehaviorDashboard';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/stability" replace />} />
      <Route path="/stability" element={<StabilityDashboard />} />
      <Route path="/performance" element={<PerformanceDashboard />} />
      <Route path="/behavior" element={<BehaviorDashboard />} />
      <Route path="*" element={<Navigate to="/stability" replace />} />
    </Routes>
  );
}
