import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { TodayEarnings } from "../lib/types";

export function Earnings() {
  const { rider, logout } = useAuth();
  const [earnings, setEarnings] = useState<TodayEarnings | null>(null);

  useEffect(() => {
    api.get<TodayEarnings>("/rider-app/earnings/today").then(setEarnings);
  }, []);

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-lg font-bold text-slate-900">Today's Earnings</h1>
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-slate-500">{rider?.name} ({rider?.code})</p>
        <p className="mt-2 text-4xl font-bold text-slate-900">PKR {earnings?.total_payout ?? "0"}</p>
        <p className="mt-1 text-sm text-slate-500">{earnings?.pickups_count ?? 0} pickups today</p>
        {earnings?.paid_at && <p className="mt-2 text-xs text-green-600">Paid</p>}
      </div>
      <button onClick={logout} className="mt-6 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-medium text-slate-600">
        Log out
      </button>
    </div>
  );
}
