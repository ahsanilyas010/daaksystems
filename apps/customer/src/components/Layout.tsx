import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/shipments", label: "My Shipments" },
  { to: "/new", label: "Book a Shipment" },
  { to: "/bulk", label: "Bulk Upload" },
  { to: "/wallet", label: "COD Wallet" },
  { to: "/returns", label: "Returns" },
  { to: "/rate-calculator", label: "Rate Calculator" },
];

export function Layout() {
  const { customer, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-lg font-semibold tracking-tight">DAAK Seller Portal</span>
            <nav className="flex flex-wrap gap-3 text-sm">
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
            <span>{customer?.name}</span>
            <button onClick={logout} className="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
