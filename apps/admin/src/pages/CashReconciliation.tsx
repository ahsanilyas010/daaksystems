import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CashHandover, CashHandoverDetail, HandoverStep } from "../lib/types";

const STEP_LABELS: Record<HandoverStep, string> = {
  rider_to_dispatcher: "Rider → Dispatcher",
  dispatcher_to_company: "Dispatcher → Company",
  company_to_client: "Company → Client",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-700",
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CashReconciliation() {
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepFilter, setStepFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [detail, setDetail] = useState<CashHandoverDetail | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New handover form state
  const [form, setForm] = useState({
    step: "rider_to_dispatcher" as HandoverStep,
    amount: "",
    rider_id: "",
    dispatcher_id: "",
    customer_id: "",
    notes: "",
    shipment_ids: "",
  });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stepFilter) params.set("step", stepFilter);
      if (statusFilter) params.set("status", statusFilter);
      const rows = await api.get<CashHandover[]>(`/cash-handovers?${params}`);
      setHandovers(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stepFilter, statusFilter]);

  async function openDetail(id: number) {
    const d = await api.get<CashHandoverDetail>(`/cash-handovers/${id}`);
    setDetail(d);
  }

  async function confirm(id: number) {
    try {
      await api.post(`/cash-handovers/${id}/confirm`);
      await load();
      if (detail?.id === id) {
        const d = await api.get<CashHandoverDetail>(`/cash-handovers/${id}`);
        setDetail(d);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "failed");
    }
  }

  async function dispute(id: number) {
    try {
      await api.post(`/cash-handovers/${id}/dispute`);
      await load();
      if (detail?.id === id) {
        const d = await api.get<CashHandoverDetail>(`/cash-handovers/${id}`);
        setDetail(d);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "failed");
    }
  }

  async function createHandover() {
    setError(null);
    if (!form.amount || isNaN(Number(form.amount))) {
      setError("Amount is required");
      return;
    }
    setSaving(true);
    try {
      const shipment_ids = form.shipment_ids
        ? form.shipment_ids.split(",").map((s) => Number(s.trim())).filter(Boolean)
        : undefined;
      await api.post("/cash-handovers", {
        step: form.step,
        amount: Number(form.amount),
        rider_id: form.rider_id ? Number(form.rider_id) : undefined,
        dispatcher_id: form.dispatcher_id ? Number(form.dispatcher_id) : undefined,
        customer_id: form.customer_id ? Number(form.customer_id) : undefined,
        notes: form.notes || undefined,
        shipment_ids,
      });
      setShowForm(false);
      setForm({ step: "rider_to_dispatcher", amount: "", rider_id: "", dispatcher_id: "", customer_id: "", notes: "", shipment_ids: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Cash Reconciliation</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Record Handover
        </button>
      </div>

      {/* Pipeline summary */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {(["rider_to_dispatcher", "dispatcher_to_company", "company_to_client"] as HandoverStep[]).map((step) => {
          const pending = handovers.filter((h) => h.step === step && h.status === "pending");
          const total = pending.reduce((s, h) => s + Number(h.amount), 0);
          return (
            <div key={step} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-1 text-xs font-medium text-slate-500">{STEP_LABELS[step]}</div>
              <div className="text-lg font-semibold text-slate-900">Rs {fmt(total)}</div>
              <div className="text-xs text-slate-500">{pending.length} pending handover{pending.length !== 1 ? "s" : ""}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={stepFilter}
          onChange={(e) => setStepFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">All steps</option>
          {(Object.entries(STEP_LABELS) as [HandoverStep, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      {/* Handover list */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : handovers.length === 0 ? (
        <p className="text-sm text-slate-500">No handovers recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-4">ID</th>
                <th className="pr-4">Step</th>
                <th className="pr-4">Status</th>
                <th className="pr-4">Amount</th>
                <th className="pr-4">Rider</th>
                <th className="pr-4">Dispatcher</th>
                <th className="pr-4">Client</th>
                <th className="pr-4">Shipments</th>
                <th className="pr-4">Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {handovers.map((h) => (
                <tr key={h.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500">#{h.id}</td>
                  <td className="pr-4 text-slate-700">{STEP_LABELS[h.step]}</td>
                  <td className="pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[h.status]}`}>
                      {h.status}
                    </span>
                  </td>
                  <td className="pr-4 font-medium">Rs {fmt(h.amount)}</td>
                  <td className="pr-4 text-slate-600">{h.rider_name ?? "-"}</td>
                  <td className="pr-4 text-slate-600">{h.dispatcher_name ?? "-"}</td>
                  <td className="pr-4 text-slate-600">{h.customer_name ?? "-"}</td>
                  <td className="pr-4 text-center text-slate-500">{h.shipment_count}</td>
                  <td className="pr-4 text-slate-400">{new Date(h.created_at).toLocaleDateString()}</td>
                  <td className="space-x-2 text-right">
                    <button onClick={() => openDetail(h.id)} className="text-slate-700 underline hover:text-slate-900">
                      View
                    </button>
                    {h.status === "pending" && (
                      <>
                        <button onClick={() => confirm(h.id)} className="text-green-700 underline hover:text-green-900">
                          Confirm
                        </button>
                        <button onClick={() => dispute(h.id)} className="text-red-600 underline hover:text-red-800">
                          Dispute
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Handover #{detail.id} — {STEP_LABELS[detail.step]}
              </h3>
              <button onClick={() => setDetail(null)} className="text-slate-500 hover:text-slate-900">Close</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Status</span><br />
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>
              </div>
              <div><span className="text-slate-500">Amount</span><br /><span className="font-semibold">Rs {fmt(detail.amount)}</span></div>
              {detail.rider_name && <div><span className="text-slate-500">Rider</span><br />{detail.rider_name}</div>}
              {detail.dispatcher_name && <div><span className="text-slate-500">Dispatcher</span><br />{detail.dispatcher_name}</div>}
              {detail.customer_name && <div><span className="text-slate-500">Client</span><br />{detail.customer_name}</div>}
              {detail.received_by_name && <div><span className="text-slate-500">Received by</span><br />{detail.received_by_name}</div>}
              {detail.confirmed_at && <div><span className="text-slate-500">Confirmed at</span><br />{new Date(detail.confirmed_at).toLocaleString()}</div>}
              {detail.notes && <div className="col-span-2"><span className="text-slate-500">Notes</span><br />{detail.notes}</div>}
            </div>

            {detail.shipments.length > 0 && (
              <>
                <h4 className="mb-2 font-medium text-slate-700">Linked Shipments</h4>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="py-1 pr-3">Tracking</th>
                      <th className="pr-3">Consignee</th>
                      <th className="pr-3">Status</th>
                      <th>COD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.shipments.map((s) => (
                      <tr key={s.shipment_id} className="border-b">
                        <td className="py-1 pr-3 font-mono text-xs">{s.daak_tracking_no}</td>
                        <td className="pr-3">{s.consignee_name}</td>
                        <td className="pr-3 text-slate-500">{s.status}</td>
                        <td>Rs {fmt(s.cod_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {detail.status === "pending" && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => confirm(detail.id)}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Confirm Receipt
                </button>
                <button
                  onClick={() => dispute(detail.id)}
                  className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Mark Disputed
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New handover form modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Record Cash Handover</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-900">Close</button>
            </div>

            {error && <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Step *</span>
                <select
                  value={form.step}
                  onChange={(e) => setForm({ ...form, step: e.target.value as HandoverStep })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {(Object.entries(STEP_LABELS) as [HandoverStep, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Amount (Rs) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="0.00"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Rider ID</span>
                <input
                  type="number"
                  value={form.rider_id}
                  onChange={(e) => setForm({ ...form, rider_id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="optional"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Dispatcher / Staff ID</span>
                <input
                  type="number"
                  value={form.dispatcher_id}
                  onChange={(e) => setForm({ ...form, dispatcher_id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="optional"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Client ID</span>
                <input
                  type="number"
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="optional"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Shipment IDs (comma-separated)</span>
                <input
                  type="text"
                  value={form.shipment_ids}
                  onChange={(e) => setForm({ ...form, shipment_ids: e.target.value })}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="e.g. 101, 102, 103"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>

              <button
                onClick={createHandover}
                disabled={saving}
                className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Record Handover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
