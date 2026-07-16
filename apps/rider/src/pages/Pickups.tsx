import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { RiderShipment } from "../lib/types";

export function Pickups() {
  const [shipments, setShipments] = useState<RiderShipment[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get<RiderShipment[]>("/rider-app/pickups").then((s) => {
      setShipments(s);
      setLoading(false);
    });
  }
  useEffect(load, []);

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-lg font-bold text-slate-900">Assigned Pickups</h1>
      {loading && <p className="text-slate-400">Loading...</p>}
      {!loading && shipments.length === 0 && (
        <p className="text-slate-400">No pickups assigned to you right now.</p>
      )}
      <div className="space-y-3">
        {shipments.map((s) => (
          <Link
            key={s.id}
            to={`/pickups/${s.id}`}
            className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm active:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-slate-500">{s.daak_tracking_no}</span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Pickup</span>
            </div>
            <p className="mt-1 font-medium text-slate-900">{s.customer_name}</p>
            <p className="text-sm text-slate-500">{s.city_name ?? "-"}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
