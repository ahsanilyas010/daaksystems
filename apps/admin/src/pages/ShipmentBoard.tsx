import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { SHIPMENT_STATUSES, type Shipment } from "../lib/types";

interface ShipmentPage {
  data: Shipment[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_COLORS: Record<string, string> = {
  BOOKED: "bg-gray-100 text-gray-700",
  DELIVERED: "bg-green-100 text-green-700",
  RETURNED: "bg-amber-100 text-amber-700",
  RETURN_INITIATED: "bg-amber-100 text-amber-700",
  LOST: "bg-red-100 text-red-700",
  DAMAGED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function ShipmentBoard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ShipmentPage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(page));
    params.set("pageSize", "20");

    const handle = setTimeout(() => {
      api
        .get<ShipmentPage>(`/shipments?${params.toString()}`)
        .then(setResult)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [status, search, from, to, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Shipment Board</h1>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-500">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {SHIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="flex-1">
          <label htmlFor="shipment-search" className="block text-xs font-medium text-slate-500">Search (tracking #, consignee)</label>
          <input id="shipment-search" placeholder="Search tracking # or consignee..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Tracking #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Consignee</th>
              <th className="px-3 py-2">City</th>
              <th className="px-3 py-2">Carrier</th>
              <th className="px-3 py-2">COD</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Booked</th>
            </tr>
          </thead>
          <tbody>
            {result?.data.map((s) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/shipments/${s.id}`)}
                className="cursor-pointer border-b border-gray-100 hover:bg-slate-50"
              >
                <td className="px-3 py-2 font-mono text-xs">{s.daak_tracking_no}</td>
                <td className="px-3 py-2">{s.customer_name}</td>
                <td className="px-3 py-2">{s.consignee_name}</td>
                <td className="px-3 py-2">{s.city_name ?? "-"}</td>
                <td className="px-3 py-2">{s.carrier_name ?? "-"}</td>
                <td className="px-3 py-2">{s.cod_amount}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-blue-100 text-blue-700"}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(s.booked_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && result?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No shipments match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>{result.total} shipments</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40">
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
