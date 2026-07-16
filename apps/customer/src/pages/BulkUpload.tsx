import { useRef, useState } from "react";
import { api } from "../lib/api";
import { BULK_TEMPLATE_CSV, parseCsv } from "../lib/csv";
import type { City } from "../lib/types";

interface PreviewRow {
  consignee_name: string;
  consignee_phone: string | null;
  consignee_address: string | null;
  city_id: number | null;
  city_label: string;
  weight_kg: number | null;
  cod_amount: number;
  issue: string | null;
}

function downloadTemplate() {
  const blob = new Blob([BULK_TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "daak-bulk-booking-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkUpload() {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ succeeded: number; failed: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);

    const preview: PreviewRow[] = [];
    for (const raw of parsed) {
      const cityText = raw.city ?? "";
      let cityId: number | null = null;
      let cityLabel = cityText;
      if (cityText) {
        const matches = await api.get<City[]>(`/customer-app/cities?search=${encodeURIComponent(cityText)}`);
        if (matches[0]) {
          cityId = matches[0].id;
          cityLabel = `${matches[0].name} (${matches[0].code})`;
        }
      }
      const weight = Number(raw.weight_kg);
      const cod = Number(raw.cod_amount || "0");
      let issue: string | null = null;
      if (!raw.consignee_name) issue = "missing consignee name";
      else if (cityText && !cityId) issue = "city not recognized — will book without a city";

      preview.push({
        consignee_name: raw.consignee_name ?? "",
        consignee_phone: raw.consignee_phone || null,
        consignee_address: raw.consignee_address || null,
        city_id: cityId,
        city_label: cityLabel,
        weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
        cod_amount: Number.isFinite(cod) ? cod : 0,
        issue,
      });
    }
    setRows(preview);
    setResults(null);
  }

  async function submitAll() {
    setBusy(true);
    try {
      const bookable = rows.filter((r) => r.consignee_name);
      const result = await api.post<{ succeeded: number; failed: number }>("/customer-app/shipments/bulk", {
        rows: bookable.map((r) => ({
          consignee_name: r.consignee_name,
          consignee_phone: r.consignee_phone,
          consignee_address: r.consignee_address,
          city_id: r.city_id,
          weight_kg: r.weight_kg,
          cod_amount: r.cod_amount,
        })),
      });
      setResults(result);
      setRows([]);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Bulk Upload</h1>
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <button onClick={downloadTemplate} className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
          Download CSV template
        </button>
        <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="text-sm" />
      </div>

      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-600">{rows.length} row(s) parsed — review before booking.</p>
          <table className="mb-4 w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Consignee</th>
                <th className="py-1">Phone</th>
                <th className="py-1">City</th>
                <th className="py-1">Weight</th>
                <th className="py-1">COD</th>
                <th className="py-1">Issue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-gray-100 ${r.issue?.startsWith("missing") ? "bg-red-50" : ""}`}>
                  <td className="py-1">{r.consignee_name || "-"}</td>
                  <td className="py-1">{r.consignee_phone ?? "-"}</td>
                  <td className="py-1">{r.city_label || "-"}</td>
                  <td className="py-1">{r.weight_kg ?? "-"}</td>
                  <td className="py-1">{r.cod_amount}</td>
                  <td className="py-1 text-xs text-amber-600">{r.issue ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={submitAll} disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Booking..." : `Book ${rows.filter((r) => r.consignee_name).length} shipment(s)`}
          </button>
        </div>
      )}

      {results && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Booked {results.succeeded} shipment(s){results.failed > 0 ? `, ${results.failed} failed` : ""}.
        </div>
      )}
    </div>
  );
}
