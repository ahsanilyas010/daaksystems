import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import type { IngestionBatchDetail as BatchDetail, IngestionItem } from "../lib/types";

const MATCH_BADGE: Record<IngestionItem["match_status"], string> = {
  new: "bg-blue-100 text-blue-800",
  possible_duplicate: "bg-amber-100 text-amber-800",
  duplicate: "bg-gray-200 text-gray-600",
};

function confidenceColor(score: string | null): string {
  const n = score ? Number(score) : 0;
  if (n >= 0.8) return "text-green-700";
  if (n >= 0.5) return "text-amber-700";
  return "text-red-700";
}

// Inline-editable fields for one staged item. Kept intentionally simple
// (plain inputs, no rich form library) since this is a review/correction
// step, not a full booking form — most rows need zero edits.
function ItemEditor({ item, onSave }: { item: IngestionItem; onSave: (fields: Record<string, unknown>) => void }) {
  const order = item.parsed_json;
  const [name, setName] = useState(order?.consignee_name ?? "");
  const [phone, setPhone] = useState(order?.consignee_phone ?? "");
  const [address, setAddress] = useState(order?.consignee_address ?? "");
  const [city, setCity] = useState(order?.city ?? "");
  const [cod, setCod] = useState(String(order?.cod_amount ?? 0));

  const flags = item.field_flags ?? {};
  const flagged = (field: string) => field in flags;
  const inputClass = (field: string) =>
    `w-full rounded border px-2 py-1 text-sm ${flagged(field) ? "border-amber-400 bg-amber-50" : "border-gray-300"}`;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div>
        <label className="block text-xs text-gray-500">Consignee</label>
        <input className={inputClass("consignee_name")} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Phone</label>
        <input className={inputClass("consignee_phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">Address</label>
        <input className={inputClass("consignee_address")} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs text-gray-500">City</label>
        <input className={inputClass("city")} value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500">COD</label>
          <input className={inputClass("cod_amount")} value={cod} onChange={(e) => setCod(e.target.value)} />
        </div>
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          onClick={() =>
            onSave({
              ...order,
              consignee_name: name,
              consignee_phone: phone,
              consignee_address: address,
              city,
              cod_amount: Number(cod) || 0,
            })
          }
        >
          Save
        </button>
      </div>
      {Object.keys(flags).length > 0 && (
        <div className="col-span-full text-xs text-amber-700">
          Flagged: {Object.entries(flags).map(([f, reason]) => `${f} (${reason})`).join("; ")}
        </div>
      )}
    </div>
  );
}

export function IngestionBatchDetail() {
  const { id } = useParams();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await api.get<BatchDetail>(`/ingestion/batches/${id}`);
    setBatch(data);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveItem(itemId: number, parsed_json: Record<string, unknown>) {
    setError(null);
    try {
      await api.patch(`/ingestion/items/${itemId}`, { parsed_json });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "save failed");
    }
  }

  async function commitItem(itemId: number, action: "new" | "merge" | "skip") {
    setBusyId(itemId);
    setError(null);
    try {
      await api.post(`/ingestion/items/${itemId}/commit`, { action });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "commit failed");
    } finally {
      setBusyId(null);
    }
  }

  async function commitHighConfidence() {
    setBulkBusy(true);
    setError(null);
    try {
      await api.post(`/ingestion/batches/${id}/commit-high-confidence`, { min_confidence: 0.8 });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "bulk commit failed");
    } finally {
      setBulkBusy(false);
    }
  }

  if (!batch) return <div>Loading...</div>;

  const pending = batch.items.filter((i) => !i.committed_shipment_id && i.match_status !== "duplicate");
  const highConfidencePendingCount = pending.filter(
    (i) => i.match_status === "new" && Number(i.confidence_score ?? 0) >= 0.8
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/ingestion" className="text-sm text-blue-600 hover:underline">&larr; All batches</Link>
          <h1 className="text-xl font-semibold">
            Batch #{batch.id} — {batch.customer_name ?? "unassigned client"}
          </h1>
        </div>
        {highConfidencePendingCount > 0 && (
          <button
            type="button"
            onClick={commitHighConfidence}
            disabled={bulkBusy}
            className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {bulkBusy ? "Committing..." : `Commit all high-confidence (${highConfidencePendingCount})`}
          </button>
        )}
      </div>
      {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {batch.items.map((item) => (
          <div key={item.id} className="rounded border bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 font-medium ${MATCH_BADGE[item.match_status]}`}>
                  {item.match_status.replace("_", " ")}
                </span>
                <span className={confidenceColor(item.confidence_score)}>
                  confidence {item.confidence_score ?? "n/a"}
                </span>
                {item.matched_shipment_id && (
                  <span className="text-gray-500">matches shipment #{item.matched_shipment_id}</span>
                )}
              </div>
              <div className="flex gap-2">
                {item.committed_shipment_id ? (
                  <span className="text-xs font-medium text-green-700">
                    committed &rarr; shipment #{item.committed_shipment_id}
                  </span>
                ) : item.match_status === "duplicate" ? (
                  <span className="text-xs text-gray-500">already in system — skipped automatically</span>
                ) : (
                  <>
                    {item.matched_shipment_id && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => commitItem(item.id, "merge")}
                        className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        Merge into #{item.matched_shipment_id}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => commitItem(item.id, "new")}
                      className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Book new shipment
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => commitItem(item.id, "skip")}
                      className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </>
                )}
              </div>
            </div>
            {item.parsed_json ? (
              <ItemEditor item={item} onSave={(fields) => saveItem(item.id, fields)} />
            ) : (
              <div className="text-sm text-red-600">Extraction failed for this chunk — see field_flags.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
