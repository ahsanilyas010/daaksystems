import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider, useAuth } from "./lib/auth";
import { BulkUpload } from "./pages/BulkUpload";
import { Login } from "./pages/Login";
import { NewShipment } from "./pages/NewShipment";
import { RateCalculator } from "./pages/RateCalculator";
import { Returns } from "./pages/Returns";
import { Shipments } from "./pages/Shipments";
import { Wallet } from "./pages/Wallet";

function ProtectedLayout() {
  const { customer } = useAuth();
  if (!customer) return <Navigate to="/login" replace />;
  return <Layout />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/shipments" replace />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/new" element={<NewShipment />} />
        <Route path="/bulk" element={<BulkUpload />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/rate-calculator" element={<RateCalculator />} />
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
