import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Shipment } from "../lib/types";

const STATUSES = [
  "BOOKED", "PICKUP_ASSIGNED", "PICKED", "HANDED_TO_CARRIER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RETURNED", "LOST",
  "DAMAGED", "CANCELLED",
];

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: "bg-green-100 text-green-700",
  RETURNED: "bg-amber-100 text-amber-700",
  RETURN_INITIATED: "bg-amber-100 text-amber-700",
  LOST: "bg-red-100 text-red-700",
  DAMAGED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const path = status ? `/customer-app/shipments?status=${status}` : "/customer-app/shipments";
    api.get<Shipment[]>(path).then((s) => {
      setShipments(s);
      setLoading(false);
    });
  }, [status]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">My Shipments</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Tracking #</th>
                <th className="px-3 py-2">Consignee</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">COD</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Booked</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-mono text-xs">{s.daak_tracking_no}</td>
                  <td className="px-3 py-2">{s.consignee_name}</td>
                  <td className="px-3 py-2">{s.city_name ?? "-"}</td>
                  <td className="px-3 py-2">{s.cod_amount}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-blue-100 text-blue-700"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(s.booked_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">No shipments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
