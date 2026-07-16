import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { Carrier, CarrierInvoice, CarrierStatusMapEntry, ShipmentStatus } from "../lib/types";
import { SHIPMENT_STATUSES } from "../lib/types";

export function CarrierOps() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Carrier Operations</h1>
      <InvoiceReconciliation />
      <StatusMap />
    </div>
  );
}

function InvoiceReconciliation() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [invoices, setInvoices] = useState<CarrierInvoice[]>([]);
  const [carrierId, setCarrierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadInvoices() {
    api.get<CarrierInvoice[]>("/carrier-invoices").then(setInvoices);
  }

  useEffect(() => {
    api.get<Carrier[]>("/reference/carriers").then((cs) => {
      setCarriers(cs);
      if (cs[0]) setCarrierId(String(cs[0].id));
    });
    loadInvoices();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/carrier-invoices", {
        carrier_id: Number(carrierId),
        invoice_no: invoiceNo,
        period_start: periodStart,
        period_end: periodEnd,
        claimed_amount: Number(claimedAmount),
      });
      setInvoiceNo("");
      setClaimedAmount("");
      loadInvoices();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create invoice");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: number, status: CarrierInvoice["status"]) {
    await api.patch(`/carrier-invoices/${id}`, { status });
    loadInvoices();
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Carrier invoice reconciliation</h2>
      <p className="text-sm text-slate-500">
        Computed amount is our own sum of shipment carrier costs for that period — the carrier's claim is checked
        against it, never trusted at face value.
      </p>
      <form onSubmit={onSubmit} className="grid grid-cols-6 gap-3">
        <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input required placeholder="Invoice #" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <input required type="number" min="0" placeholder="Claimed amount" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Adding..." : "Add invoice"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1">Invoice</th>
            <th className="py-1">Carrier</th>
            <th className="py-1">Period</th>
            <th className="py-1">Claimed</th>
            <th className="py-1">Computed</th>
            <th className="py-1">Variance</th>
            <th className="py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-gray-100">
              <td className="py-1">{inv.invoice_no}</td>
              <td className="py-1">{inv.carrier_name}</td>
              <td className="py-1 text-xs">
                {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
              </td>
              <td className="py-1">{inv.claimed_amount}</td>
              <td className="py-1">{inv.computed_amount ?? "-"}</td>
              <td className={`py-1 font-medium ${Number(inv.variance) === 0 ? "text-green-600" : "text-red-600"}`}>
                {inv.variance ?? "-"}
              </td>
              <td className="py-1">
                <select
                  value={inv.status}
                  onChange={(e) => setStatus(inv.id, e.target.value as CarrierInvoice["status"])}
                  className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                >
                  <option value="open">Open</option>
                  <option value="matched">Matched</option>
                  <option value="disputed">Disputed</option>
                  <option value="paid">Paid</option>
                </select>
              </td>
            </tr>
          ))}
          {invoices.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-slate-400">No invoices recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusMap() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [entries, setEntries] = useState<CarrierStatusMapEntry[]>([]);
  const [carrierId, setCarrierId] = useState("");
  const [carrierStatus, setCarrierStatus] = useState("");
  const [mappedStatus, setMappedStatus] = useState<ShipmentStatus>("IN_TRANSIT");
  const [busy, setBusy] = useState(false);

  function loadEntries() {
    api.get<CarrierStatusMapEntry[]>("/carrier-status-map").then(setEntries);
  }

  useEffect(() => {
    api.get<Carrier[]>("/reference/carriers").then((cs) => {
      setCarriers(cs);
      if (cs[0]) setCarrierId(String(cs[0].id));
    });
    loadEntries();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/carrier-status-map", {
        carrier_id: Number(carrierId),
        carrier_status: carrierStatus,
        mapped_status: mappedStatus,
      });
      setCarrierStatus("");
      loadEntries();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api.del(`/carrier-status-map/${id}`);
    loadEntries();
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Carrier status translation table</h2>
      <p className="text-sm text-slate-500">
        Maps each carrier's own status vocabulary to Daak's locked status enum. Ops can add a newly-observed raw
        status here without a code deploy — an unrecognized status is held back from webhooks/polling until mapped.
      </p>
      <form onSubmit={onSubmit} className="grid grid-cols-4 gap-3">
        <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input required placeholder="Carrier's raw status text" value={carrierStatus} onChange={(e) => setCarrierStatus(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <select value={mappedStatus} onChange={(e) => setMappedStatus(e.target.value as ShipmentStatus)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving..." : "Add mapping"}
        </button>
      </form>

      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1">Carrier</th>
            <th className="py-1">Raw status</th>
            <th className="py-1">Maps to</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-gray-100">
              <td className="py-1">{e.carrier_name}</td>
              <td className="py-1 font-mono text-xs">{e.carrier_status}</td>
              <td className="py-1">{e.mapped_status}</td>
              <td className="py-1 text-right">
                <button onClick={() => remove(e.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-400">No mappings yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
