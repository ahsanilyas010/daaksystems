import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Kpis } from "../lib/types";

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function pctStr(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}
function hoursStr(v: number | null): string {
  if (v === null) return "—";
  return v < 24 ? `${v.toFixed(1)}h` : `${(v / 24).toFixed(1)}d`;
}

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    api.get<Kpis>("/reports/kpis").then(setKpis);
  }, []);

  if (!kpis) return <p className="text-slate-400">Loading...</p>;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">KPI Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="On-time delivery" value={pctStr(kpis.on_time_delivery_pct)} tone="good" />
        <StatTile label="First-attempt success" value={pctStr(kpis.first_attempt_success_pct)} tone="good" />
        <StatTile label="Return rate (target < 4%)" value={pctStr(kpis.return_rate_pct)} tone={kpis.return_rate_pct && kpis.return_rate_pct > 4 ? "bad" : "good"} />
        <StatTile label="Lost rate (target < 0.05%)" value={pctStr(kpis.lost_rate_pct)} tone={kpis.lost_rate_pct && kpis.lost_rate_pct > 0.05 ? "bad" : "good"} />
        <StatTile label="Delivered / total shipments" value={`${kpis.delivered_count.toLocaleString()} / ${kpis.total_count.toLocaleString()}`} />
        <StatTile label="COD: delivered → carrier remittance" value={hoursStr(kpis.cod_cycle_hours.delivered_to_carrier_remittance)} />
        <StatTile label="COD: remittance → sender payout" value={hoursStr(kpis.cod_cycle_hours.carrier_remittance_to_sender_payout)} />
        <StatTile label="Exception queue avg age" value={hoursStr(kpis.exception_queue.avg_age_hours)} tone={kpis.exception_queue.avg_age_hours && kpis.exception_queue.avg_age_hours > 48 ? "bad" : "good"} />
      </div>
      <p className="mt-6 text-xs text-slate-400">
        On-time and first-attempt figures reflect the granularity of the source data — historical shipments migrated
        from Excel share a single booked/delivered timestamp, so these will become more meaningful as live operations
        record distinct pickup/delivery events going forward.
      </p>
    </div>
  );
}
