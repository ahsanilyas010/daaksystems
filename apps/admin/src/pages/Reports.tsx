import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ProfitReportRow } from "../lib/types";

export function Reports() {
  const [groupBy, setGroupBy] = useState<"carrier" | "customer" | "city">("carrier");
  const [rows, setRows] = useState<ProfitReportRow[]>([]);

  useEffect(() => {
    api.get<{ rows: ProfitReportRow[] }>(`/reports/profit?groupBy=${groupBy}`).then((r) => setRows(r.rows));
  }, [groupBy]);

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total_profit), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Profit per Parcel</h1>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="rounded border border-gray-300 px-3 py-2 text-sm">
          <option value="carrier">By carrier</option>
          <option value="customer">By customer</option>
          <option value="city">By city</option>
        </select>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-slate-500">Total profit (shipments with known carrier cost)</p>
        <p className="text-2xl font-semibold text-slate-900">PKR {grandTotal.toLocaleString()}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{groupBy}</th>
              <th className="px-3 py-2">Shipments</th>
              <th className="px-3 py-2">Total COD</th>
              <th className="px-3 py-2">Total DC</th>
              <th className="px-3 py-2">Total profit</th>
              <th className="px-3 py-2">Avg profit / parcel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.group_label} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium">{r.group_label}</td>
                <td className="px-3 py-2">{r.shipment_count}</td>
                <td className="px-3 py-2">{r.total_cod}</td>
                <td className="px-3 py-2">{r.total_dc}</td>
                <td className="px-3 py-2 font-medium">{r.total_profit}</td>
                <td className="px-3 py-2">{Number(r.avg_profit_per_parcel).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No shipments with a known carrier cost yet for this grouping.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
