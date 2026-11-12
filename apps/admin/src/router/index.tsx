import { Navigate, createBrowserRouter } from 'react-router-dom';
import { Providers } from '@/components/Providers';
import { RequireAuth } from '@/components/RequireAuth';
import { MainLayout } from '@/layouts/MainLayout';
import { LoginPage } from '@/pages/LoginPage';
import { StabilityDashboard } from '@/components/dashboards/StabilityDashboard';
import { PerformanceDashboard } from '@/components/dashboards/PerformanceDashboard';
import { BehaviorDashboard } from '@/components/dashboards/BehaviorDashboard';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Providers>
        <LoginPage />
      </Providers>
    ),
  },
  {
    path: '/',
    element: (
      <Providers>
        <RequireAuth>
          <MainLayout />
        </RequireAuth>
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
