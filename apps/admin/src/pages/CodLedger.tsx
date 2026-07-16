import { useCallback, useEffect, useState } from "react";
import { SearchSelect, type SearchSelectOption } from "../components/SearchSelect";
import { ApiError, api } from "../lib/api";
import type { CodDispute, CodLedgerEntry, Customer, PayoutPreview, Shipment } from "../lib/types";

export function CodLedger() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">COD Ledger</h1>
      <CarrierInForm onRecorded={bump} />
      <Disputes refreshKey={refreshKey} />
      <PayoutBatch onBatchCreated={bump} />
      <PendingPayouts refreshKey={refreshKey} />
    </div>
  );
}

function PendingPayouts({ refreshKey }: { refreshKey: number }) {
  const [entries, setEntries] = useState<CodLedgerEntry[]>([]);

  function load() {
    api.get<CodLedgerEntry[]>("/cod-ledger?direction=sender_out&status=pending").then(setEntries);
  }
  useEffect(load, [refreshKey]);

  async function markPaid(id: number) {
    await api.post(`/cod-ledger/${id}/mark-paid`);
    load();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Pending sender payouts</h2>
        <button onClick={load} className="text-xs text-slate-500 hover:underline">Refresh</button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">No pending payouts.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Tracking #</th>
              <th className="py-1">Customer</th>
              <th className="py-1">Amount</th>
              <th className="py-1">Reference</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-gray-100">
                <td className="py-1 font-mono text-xs">{e.daak_tracking_no}</td>
                <td className="py-1">{e.customer_name}</td>
                <td className="py-1">{e.amount}</td>
                <td className="py-1">{e.reference_no ?? "-"}</td>
                <td className="py-1 text-right">
                  <button onClick={() => markPaid(e.id)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                    Mark paid
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CarrierInForm({ onRecorded }: { onRecorded: () => void }) {
  const [tracking, setTracking] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const found = await api.get<{ data: Shipment[] }>(
        `/shipments?search=${encodeURIComponent(tracking)}&pageSize=1`
      );
      const shipment = found.data[0];
      if (!shipment) throw new ApiError("no shipment found for that tracking number", 404);
      await api.post("/cod-ledger/carrier-in", {
        shipment_id: shipment.id,
        amount: Number(amount),
        method,
        reference_no: reference || null,
      });
      setSuccess(`Recorded carrier remittance for ${shipment.daak_tracking_no}`);
      setTracking("");
      setAmount("");
      setReference("");
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to record remittance");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Record carrier remittance (carrier → DAAK)</h2>
      <div className="grid grid-cols-4 gap-3">
        <input required placeholder="Tracking #" value={tracking} onChange={(e) => setTracking(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <input required type="number" min="0" placeholder="Amount received" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="bank">Bank</option>
          <option value="jazzcash">JazzCash</option>
          <option value="easypaisa">Easypaisa</option>
          <option value="cash">Cash</option>
        </select>
        <input placeholder="Reference #" value={reference} onChange={(e) => setReference(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
      <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
        {busy ? "Recording..." : "Record remittance"}
      </button>
    </form>
  );
}

function Disputes({ refreshKey }: { refreshKey: number }) {
  const [disputes, setDisputes] = useState<CodDispute[]>([]);

  function load() {
    api.get<CodDispute[]>("/cod-ledger/disputes").then(setDisputes);
  }
  useEffect(load, [refreshKey]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium text-slate-900">Dispute queue (remittance ≠ declared COD)</h2>
        <button onClick={load} className="text-xs text-slate-500 hover:underline">Refresh</button>
      </div>
      {disputes.length === 0 ? (
        <p className="text-sm text-slate-400">No variances — every carrier remittance matches its shipment's declared COD.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Tracking #</th>
              <th className="py-1">Customer</th>
              <th className="py-1">Declared COD</th>
              <th className="py-1">Received</th>
              <th className="py-1">Variance</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id} className="border-b border-gray-100">
                <td className="py-1 font-mono text-xs">{d.daak_tracking_no}</td>
                <td className="py-1">{d.customer_name}</td>
                <td className="py-1">{d.shipment_cod_amount}</td>
                <td className="py-1">{d.amount}</td>
                <td className={`py-1 font-medium ${Number(d.variance) > 0 ? "text-green-600" : "text-red-600"}`}>
                  {d.variance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PayoutBatch({ onBatchCreated }: { onBatchCreated: () => void }) {
  const [customer, setCustomer] = useState<SearchSelectOption | null>(null);
  const [preview, setPreview] = useState<PayoutPreview | null>(null);
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchCustomers = useCallback(async (query: string) => {
    const customers = await api.get<Customer[]>(`/customers?search=${encodeURIComponent(query)}`);
    return customers.map((c) => ({ id: c.id, label: c.name }));
  }, []);

  useEffect(() => {
    setPreview(null);
    if (customer) {
      api.get<PayoutPreview>(`/cod-ledger/payout-preview/${customer.id}`).then(setPreview);
    }
  }, [customer]);

  async function createBatch() {
    if (!customer) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result = await api.post<{ entries: unknown[]; total: number }>("/cod-ledger/payout-batches", {
        customer_id: customer.id,
        method,
        reference_no: reference || null,
      });
      setSuccess(`Created payout batch: PKR ${result.total} across ${result.entries.length} shipment(s)`);
      setPreview(await api.get<PayoutPreview>(`/cod-ledger/payout-preview/${customer.id}`));
      onBatchCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create payout batch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="font-medium text-slate-900">Sender payout batch (DAAK → sender)</h2>
      <div className="grid grid-cols-3 gap-3">
        <SearchSelect value={customer} onChange={setCustomer} fetchOptions={fetchCustomers} placeholder="Search sender..." />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="bank">Bank</option>
          <option value="jazzcash">JazzCash</option>
          <option value="easypaisa">Easypaisa</option>
          <option value="cash">Cash</option>
        </select>
        <input placeholder="Reference #" value={reference} onChange={(e) => setReference(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {preview && (
        <div>
          <p className="mb-2 text-sm text-slate-600">
            {preview.count} shipment(s) eligible (DELIVERED, COD received from carrier, not yet paid out) — total{" "}
            <span className="font-semibold">PKR {preview.total.toFixed(2)}</span>
          </p>
          {preview.count > 0 && (
            <table className="mb-3 w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1">Tracking #</th>
                  <th className="py-1">COD</th>
                  <th className="py-1">DC</th>
                  <th className="py-1">Payable</th>
                </tr>
              </thead>
              <tbody>
                {preview.shipments.map((s) => (
                  <tr key={s.shipment_id} className="border-b border-gray-100">
                    <td className="py-1 font-mono text-xs">{s.daak_tracking_no}</td>
                    <td className="py-1">{s.cod_amount}</td>
                    <td className="py-1">{s.dc_amount}</td>
                    <td className="py-1 font-medium">{s.payable_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {success && <p className="mb-2 text-sm text-green-600">{success}</p>}
          <button
            onClick={createBatch}
            disabled={busy || preview.count === 0}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create payout batch"}
          </button>
        </div>
      )}
    </div>
  );
}
