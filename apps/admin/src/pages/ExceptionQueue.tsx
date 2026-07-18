import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ExceptionRow } from "../lib/types";

function formatAge(hours: number): string {
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function ExceptionQueue() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ExceptionRow[]>("/exceptions").then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Exception Queue</h1>
      <p className="mb-4 text-sm text-slate-500">
        No status change in 48h, or 2+ failed delivery attempts, while still in flight (plan.md SOP-04).
      </p>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400">Nothing older than 48h in the queue right now.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tracking #</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Carrier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Attempts</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/shipments/${r.id}`)} className="cursor-pointer border-b border-gray-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.daak_tracking_no}</td>
                  <td className="px-3 py-2">{r.customer_name}</td>
                  <td className="px-3 py-2">{r.city_name ?? "-"}</td>
                  <td className="px-3 py-2">{r.carrier_name ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{r.status}</span>
                  </td>
                  <td className="px-3 py-2">{r.attempts_count}</td>
                  <td className="px-3 py-2 font-medium text-red-600">{formatAge(Number(r.hours_since_update))}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {[r.stale_48h && "48h no movement", r.repeated_failure && "2+ failed attempts"].filter(Boolean).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
