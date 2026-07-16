import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { BookingDesk } from "./pages/BookingDesk";
import { CodLedger } from "./pages/CodLedger";
import { Customers } from "./pages/Customers";
import { Login } from "./pages/Login";
import { RateCards } from "./pages/RateCards";
import { Reports } from "./pages/Reports";
import { RiderRuns } from "./pages/RiderRuns";
import { ShipmentBoard } from "./pages/ShipmentBoard";
import { ShipmentDetail } from "./pages/ShipmentDetail";

function ProtectedLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/booking" replace />} />
        <Route path="/booking" element={<BookingDesk />} />
        <Route path="/shipments" element={<ShipmentBoard />} />
        <Route path="/shipments/:id" element={<ShipmentDetail />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/rate-cards" element={<RateCards />} />
        <Route path="/cod-ledger" element={<CodLedger />} />
        <Route path="/rider-runs" element={<RiderRuns />} />
        <Route path="/reports" element={<Reports />} />
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
