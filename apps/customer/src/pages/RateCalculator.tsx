import { useState } from "react";
import { ApiError, api } from "../lib/api";
import type { RateEstimate } from "../lib/types";

export function RateCalculator() {
  const [weight, setWeight] = useState("1");
  const [codAmount, setCodAmount] = useState("0");
  const [estimate, setEstimate] = useState<RateEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.get<RateEstimate>(
        `/customer-app/rate-calculator?weight_kg=${weight}&cod_amount=${codAmount}`
      );
      setEstimate(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to calculate rate");
      setEstimate(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Rate Calculator</h1>
      <p className="mb-4 text-sm text-slate-500">Estimate is based on your assigned rate card and weight — city-based zone pricing isn't configured yet.</p>
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700">Weight (kg)</label>
            <input type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">COD amount</label>
            <input type="number" min="0" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={calculate} disabled={busy} className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Calculating..." : "Calculate"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {estimate && (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between"><span>Base charge</span><span>PKR {estimate.base_charge.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Fuel surcharge</span><span>PKR {estimate.fuel_surcharge.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>COD fee</span><span>PKR {estimate.cod_fee.toFixed(2)}</span></div>
            <div className="mt-2 flex justify-between border-t border-gray-300 pt-2 font-semibold">
              <span>Estimated total</span><span>PKR {estimate.estimated_total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
