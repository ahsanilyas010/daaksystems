import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { Claim, Shipment } from "../lib/types";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-slate-200 text-slate-700",
};

export function Claims() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [tracking, setTracking] = useState("");
  const [claimType, setClaimType] = useState<"lost" | "damaged">("lost");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<Claim[]>("/claims").then(setClaims);
  }
  useEffect(load, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const found = await api.get<{ data: Shipment[] }>(`/shipments?search=${encodeURIComponent(tracking)}&pageSize=1`);
      const shipment = found.data[0];
      if (!shipment) throw new ApiError("no shipment found for that tracking number", 404);
      await api.post("/claims", {
        shipment_id: shipment.id,
        claim_type: claimType,
        claimed_amount: Number(claimedAmount),
        evidence_note: evidenceNote || null,
      });
      setTracking("");
      setClaimedAmount("");
      setEvidenceNote("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to file claim");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: number, status: Claim["status"]) {
    await api.patch(`/claims/${id}`, { status });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Claims</h1>

      <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">File a claim</h2>
        <p className="text-sm text-slate-500">The shipment must already be marked LOST or DAMAGED — this records the claim, it doesn't declare the loss.</p>
        <div className="grid grid-cols-4 gap-3">
          <input required placeholder="Tracking #" value={tracking} onChange={(e) => setTracking(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <select value={claimType} onChange={(e) => setClaimType(e.target.value as "lost" | "damaged")} className="rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="lost">Lost</option>
            <option value="damaged">Damaged</option>
          </select>
          <input required type="number" min="0" placeholder="Claimed amount" value={claimedAmount} onChange={(e) => setClaimedAmount(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Evidence note" value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Filing..." : "File claim"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Tracking #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Claimed</th>
              <th className="px-3 py-2">Filed</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{c.daak_tracking_no}</td>
                <td className="px-3 py-2">{c.customer_name}</td>
                <td className="px-3 py-2 capitalize">{c.claim_type}</td>
                <td className="px-3 py-2">{c.claimed_amount}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  <select
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value as Claim["status"])}
                    className={`rounded border-0 px-2 py-1 text-xs font-medium ${STATUS_COLORS[c.status]}`}
                  >
                    <option value="open">Open</option>
                    <option value="under_review">Under review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="paid">Paid</option>
                  </select>
                </td>
              </tr>
            ))}
            {claims.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No claims filed yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
