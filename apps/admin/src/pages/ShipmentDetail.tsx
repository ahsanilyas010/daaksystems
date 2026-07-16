import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShippingLabel } from "../components/ShippingLabel";
import { ApiError, api } from "../lib/api";
import { SHIPMENT_STATUSES, type ShipmentDetail as ShipmentDetailType, type ShipmentStatus } from "../lib/types";

export function ShipmentDetail() {
  const { id } = useParams();
  const [shipment, setShipment] = useState<ShipmentDetailType | null>(null);
  const [newStatus, setNewStatus] = useState<ShipmentStatus>("PICKED");
  const [note, setNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<ShipmentDetailType>(`/shipments/${id}`).then(setShipment);
  }

  useEffect(load, [id]);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/shipments/${id}/events`, {
        status: newStatus,
        note: note || null,
        return_reason: returnReason || null,
      });
      setNote("");
      setReturnReason("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to update status");
    } finally {
      setBusy(false);
    }
  }

  if (!shipment) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h1 className="font-mono text-lg font-semibold text-slate-900">{shipment.daak_tracking_no}</h1>
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{shipment.status}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-slate-500">Customer (sender)</dt><dd>{shipment.customer_name}</dd></div>
            <div><dt className="text-slate-500">Carrier</dt><dd>{shipment.carrier_name ?? "-"}</dd></div>
            <div><dt className="text-slate-500">Consignee</dt><dd>{shipment.consignee_name}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd>{shipment.consignee_phone ?? "-"}</dd></div>
            <div><dt className="text-slate-500">City</dt><dd>{shipment.city_name ?? "-"}</dd></div>
            <div><dt className="text-slate-500">Weight / Pieces</dt><dd>{shipment.weight_kg ?? "-"} kg / {shipment.pieces}</dd></div>
            <div><dt className="text-slate-500">COD amount</dt><dd>PKR {shipment.cod_amount}</dd></div>
            <div><dt className="text-slate-500">DC amount</dt><dd>PKR {shipment.dc_amount}</dd></div>
            <div><dt className="text-slate-500">Attempts</dt><dd>{shipment.attempts_count}</dd></div>
            <div><dt className="text-slate-500">Booked</dt><dd>{new Date(shipment.booked_at).toLocaleString()}</dd></div>
            {shipment.return_reason && (
              <div className="col-span-2"><dt className="text-slate-500">Return reason</dt><dd>{shipment.return_reason}</dd></div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 font-medium text-slate-900">Event log</h2>
          <ol className="space-y-2 text-sm">
            {shipment.events.map((ev) => (
              <li key={ev.id} className="flex items-start justify-between border-b border-gray-100 pb-2 last:border-0">
                <div>
                  <span className="font-medium">{ev.status}</span>
                  {ev.note && <span className="text-slate-500"> — {ev.note}</span>}
                  {ev.location && <span className="text-slate-400"> ({ev.location})</span>}
                  <div className="text-xs text-slate-400">
                    {ev.source} {ev.actor ? `· ${ev.actor}` : ""}
                  </div>
                </div>
                <span className="whitespace-nowrap text-xs text-slate-400">{new Date(ev.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={addEvent} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium text-slate-900">Update status</h2>
          <div className="flex gap-3">
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as ShipmentStatus)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          {(newStatus === "RETURN_INITIATED" || newStatus === "RETURNED") && (
            <input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Return reason" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Saving..." : "Add event"}
          </button>
        </form>
      </div>

      <div>
        <div className="print-area">
          <ShippingLabel shipment={shipment} />
        </div>
        <button onClick={() => window.print()} className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 print:hidden">
          Print label
        </button>
      </div>
    </div>
  );
}
