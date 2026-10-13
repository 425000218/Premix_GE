import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PositionsPage } from './pages/PositionsPage';
import { DeliveryPlanPage } from './pages/DeliveryPlanPage';
import { PurchaseRequestsPage } from './pages/PurchaseRequestsPage';
import { BlocksPage } from './pages/BlocksPage';
import { CatalogPage } from './pages/CatalogPage';
import { ImportPage } from './pages/ImportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="positions" element={<PositionsPage />} />
              <Route path="delivery-plan" element={<DeliveryPlanPage />} />
              <Route path="purchase-requests" element={<PurchaseRequestsPage />} />
              <Route path="blocks" element={<BlocksPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="import" element={<ImportPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
