import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { RateCard } from "../lib/types";

export function RateCards() {
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [baseRate, setBaseRate] = useState("250");
  const [perKgIncrement, setPerKgIncrement] = useState("50");
  const [codFeePct, setCodFeePct] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<RateCard[]>("/rate-cards").then(setRateCards);
  }

  useEffect(load, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/rate-cards", {
        name,
        base_rate: Number(baseRate),
        per_kg_increment: Number(perKgIncrement),
        cod_fee_pct: Number(codFeePct),
      });
      setName("");
      setBaseRate("250");
      setPerKgIncrement("50");
      setCodFeePct("0");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create rate card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Rate Cards</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Cancel" : "New rate card"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm" />
          <label className="text-sm text-slate-600">
            Base rate
            <input type="number" min="0" value={baseRate} onChange={(e) => setBaseRate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-slate-600">
            Per-kg increment
            <input type="number" min="0" value={perKgIncrement} onChange={(e) => setPerKgIncrement(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm text-slate-600">
            COD fee %
            <input type="number" min="0" max="100" value={codFeePct} onChange={(e) => setCodFeePct(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="col-span-2">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Base weight</th>
              <th className="px-3 py-2">Base rate</th>
              <th className="px-3 py-2">Per-kg increment</th>
              <th className="px-3 py-2">COD fee %</th>
            </tr>
          </thead>
          <tbody>
            {rateCards.map((rc) => (
              <tr key={rc.id} className="border-b border-gray-100">
                <td className="px-3 py-2">{rc.name}</td>
                <td className="px-3 py-2">{rc.base_weight_kg} kg</td>
                <td className="px-3 py-2">{rc.base_rate}</td>
                <td className="px-3 py-2">{rc.per_kg_increment}</td>
                <td className="px-3 py-2">{rc.cod_fee_pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
