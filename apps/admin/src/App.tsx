import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { DashboardPage } from './pages/DashboardPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { GeofencesPage } from './pages/GeofencesPage';
import { LoginPage } from './pages/LoginPage';
import { PricingPage } from './pages/PricingPage';
import { RidersPage } from './pages/RidersPage';
import { RiskPage } from './pages/RiskPage';
import { SupportPage } from './pages/SupportPage';
import { UsersPage } from './pages/UsersPage';
import { useAdminSession } from './state/adminSession';

export function App() {
  const user = useAdminSession((state) => state.user);

  if (!user) return <LoginPage />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/deliveries" element={<DeliveriesPage />} />
        <Route path="/riders" element={<RidersPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/geofences" element={<GeofencesPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
