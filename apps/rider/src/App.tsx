import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { Deliveries } from "./pages/Deliveries";
import { DeliveryDetail } from "./pages/DeliveryDetail";
import { Earnings } from "./pages/Earnings";
import { Login } from "./pages/Login";
import { PickupDetail } from "./pages/PickupDetail";
import { Pickups } from "./pages/Pickups";

function ProtectedLayout() {
  const { rider } = useAuth();
  if (!rider) return <Navigate to="/login" replace />;
  return <Layout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/pickups" replace />} />
        <Route path="/pickups" element={<Pickups />} />
        <Route path="/pickups/:id" element={<PickupDetail />} />
        <Route path="/deliveries" element={<Deliveries />} />
        <Route path="/deliveries/:id" element={<DeliveryDetail />} />
        <Route path="/earnings" element={<Earnings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
