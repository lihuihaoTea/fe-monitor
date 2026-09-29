import { Navigate, createBrowserRouter } from 'react-router-dom';
import { Providers } from '@/components/Providers';
import { MainLayout } from '@/layouts/MainLayout';
import { StabilityDashboard } from '@/components/dashboards/StabilityDashboard';
import { PerformanceDashboard } from '@/components/dashboards/PerformanceDashboard';
import { BehaviorDashboard } from '@/components/dashboards/BehaviorDashboard';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Providers>
        <MainLayout />
      </Providers>
    ),
    children: [
      { index: true, element: <Navigate to="/stability" replace /> },
      { path: 'stability', element: <StabilityDashboard /> },
      { path: 'performance', element: <PerformanceDashboard /> },
      { path: 'behavior', element: <BehaviorDashboard /> },
      { path: '*', element: <Navigate to="/stability" replace /> },
    ],
  },
]);
