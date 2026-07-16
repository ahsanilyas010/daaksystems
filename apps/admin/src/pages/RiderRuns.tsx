import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { Rider, RiderRun } from "../lib/types";

export function RiderRuns() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [runs, setRuns] = useState<RiderRun[]>([]);
  const [riderId, setRiderId] = useState("");
  const [runDate, setRunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickupsCount, setPickupsCount] = useState("1");
  const [payoutPerPickup, setPayoutPerPickup] = useState("120");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadRuns() {
    api.get<RiderRun[]>("/rider-runs").then(setRuns);
  }

  useEffect(() => {
    api.get<Rider[]>("/reference/riders").then((rs) => {
      setRiders(rs);
      if (rs[0]) setRiderId(String(rs[0].id));
    });
    loadRuns();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/rider-runs", {
        rider_id: Number(riderId),
        run_date: runDate,
        pickups_count: Number(pickupsCount),
        payout_per_pickup: Number(payoutPerPickup),
      });
      loadRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to save rider run");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: number) {
    await api.post(`/rider-runs/${id}/pay`);
    loadRuns();
  }

  const totalUnpaid = runs.filter((r) => !r.paid_at).reduce((sum, r) => sum + Number(r.total_payout), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Rider Runs</h1>

      <form onSubmit={onSubmit} className="grid grid-cols-5 gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <select value={riderId} onChange={(e) => setRiderId(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          {riders.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
          ))}
        </select>
        <input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" placeholder="Pickups" value={pickupsCount} onChange={(e) => setPickupsCount(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <input type="number" min="0" placeholder="PKR / pickup" value={payoutPerPickup} onChange={(e) => setPayoutPerPickup(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
        <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Saving..." : "Save run"}
        </button>
        {error && <p className="col-span-5 text-sm text-red-600">{error}</p>}
      </form>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Runs</h2>
          <span className="text-sm text-slate-500">Unpaid total: PKR {totalUnpaid.toFixed(2)}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-1">Rider</th>
              <th className="py-1">Date</th>
              <th className="py-1">Pickups</th>
              <th className="py-1">PKR/pickup</th>
              <th className="py-1">Total</th>
              <th className="py-1">Status</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="py-1">{r.rider_name}</td>
                <td className="py-1">{new Date(r.run_date).toLocaleDateString()}</td>
                <td className="py-1">{r.pickups_count}</td>
                <td className="py-1">{r.payout_per_pickup}</td>
                <td className="py-1 font-medium">{r.total_payout}</td>
                <td className="py-1">
                  {r.paid_at ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Paid</span>
                  ) : (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Unpaid</span>
                  )}
                </td>
                <td className="py-1 text-right">
                  {!r.paid_at && (
                    <button onClick={() => markPaid(r.id)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
