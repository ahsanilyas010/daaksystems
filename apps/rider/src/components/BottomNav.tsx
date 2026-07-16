import { NavLink } from "react-router-dom";
import { useQueueSync } from "../lib/useQueueSync";

const items = [
  { to: "/pickups", label: "Pickups", icon: "📦" },
  { to: "/deliveries", label: "Deliveries", icon: "🚚" },
  { to: "/earnings", label: "Earnings", icon: "💰" },
];

export function BottomNav() {
  const { online, pendingCount } = useQueueSync();

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {(!online || pendingCount > 0) && (
        <div className={`px-3 py-1 text-center text-xs ${online ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
          {online ? `Syncing ${pendingCount} pending action(s)...` : `Offline — ${pendingCount} action(s) queued, will sync when back online`}
        </div>
      )}
      <nav className="flex">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? "text-slate-900 font-medium" : "text-slate-400"}`
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
