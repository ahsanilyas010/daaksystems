import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/booking", label: "Booking Desk" },
  { to: "/shipments", label: "Shipments" },
  { to: "/customers", label: "Customers" },
  { to: "/rate-cards", label: "Rate Cards" },
  { to: "/cod-ledger", label: "COD Ledger" },
  { to: "/rider-runs", label: "Rider Runs" },
  { to: "/reports", label: "Reports" },
  { to: "/carrier-ops", label: "Carrier Ops" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold tracking-tight">DAAK ERP</span>
            <nav className="flex gap-4 text-sm">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded px-2 py-1 hover:bg-slate-700 ${isActive ? "bg-slate-700 font-medium" : "text-slate-300"}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <span>
              {user?.name} <span className="text-slate-500">({user?.role})</span>
            </span>
            <button onClick={logout} className="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
