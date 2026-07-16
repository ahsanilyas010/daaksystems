import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Shipment } from "../lib/types";

export function Returns() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [requested, setRequested] = useState<Set<number>>(new Set());

  function load() {
    api.get<Shipment[]>("/customer-app/returns").then(setShipments);
  }
  useEffect(load, []);

  async function requestReattempt(id: number) {
    await api.post(`/customer-app/shipments/${id}/request-reattempt`);
    setRequested((prev) => new Set(prev).add(id));
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Returns</h1>
      {shipments.length === 0 ? (
        <p className="text-slate-400">No returned or return-initiated shipments.</p>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-slate-500">{s.daak_tracking_no}</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{s.status}</span>
              </div>
              <p className="mt-1 font-medium text-slate-900">{s.consignee_name}</p>
              {s.return_reason && <p className="text-sm text-slate-500">Reason: {s.return_reason}</p>}
              <button
                onClick={() => requestReattempt(s.id)}
                disabled={requested.has(s.id)}
                className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {requested.has(s.id) ? "Re-attempt requested" : "Request re-attempt"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
