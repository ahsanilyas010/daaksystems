import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { IngestionBatch, IngestionBatchDetail } from "../lib/types";

// Self-serve order upload (plan-order-ingestion.md section 10). A sender
// drops in their order PDF (Shopify order-printer bundle, carrier airway
// bill) or pastes order text, and it lands in the same review pipeline
// ops uses for every other source. This page is read-only after upload —
// no edit/commit here, that's ops' job; the sender just watches status.
const STATUS_LABELS: Record<string, string> = {
  processing: "Processing...",
  needs_review: "In review",
  committed: "Booked",
  failed: "Failed",
};

export function OrderUpload() {
  const [batches, setBatches] = useState<IngestionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IngestionBatchDetail | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadBatches() {
    setLoading(true);
    try {
      const rows = await api.get<IngestionBatch[]>("/customer-app/ingestion/batches");
      setBatches(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBatches();
  }, []);

  async function onFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.postForm("/customer-app/ingestion/batches", formData);
      await loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onTextSubmit() {
    if (!text.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await api.post("/customer-app/ingestion/batches/text", { text });
      setText("");
      await loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function openBatch(id: number) {
    const detail = await api.get<IngestionBatchDetail>(`/customer-app/ingestion/batches/${id}`);
    setSelected(detail);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Upload Orders</h1>
      <p className="mb-4 text-sm text-slate-600">
        Upload your order PDF (Shopify order-printer bundle or airway bill) or paste an order
        message, and it'll show up here for Daak to review and book. This is a staging area — you
        won't see it move to "My Shipments" until it's been reviewed.
      </p>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-900">Upload a PDF</h2>
          <input ref={fileRef} type="file" accept=".pdf" onChange={onFileUpload} disabled={uploading} className="text-sm" />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-medium text-slate-900">Paste order text</h2>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Paste a WhatsApp order message or order details..."
            className="mb-2 w-full rounded border border-gray-300 p-2 text-sm"
          />
          <button
            onClick={onTextSubmit}
            disabled={uploading || !text.trim()}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {uploading ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>

      <h2 className="mb-2 text-lg font-medium">Your Uploads</h2>
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-slate-500">No uploads yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2">Uploaded</th>
              <th>Source</th>
              <th>File / Ref</th>
              <th>Status</th>
              <th>Orders Found</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b">
                <td className="py-2">{new Date(b.uploaded_at).toLocaleString()}</td>
                <td>{b.source === "pdf_upload" ? "PDF" : "Pasted text"}</td>
                <td>{b.source_ref ?? "-"}</td>
                <td>{STATUS_LABELS[b.status] ?? b.status}</td>
                <td>{b.item_count}</td>
                <td>
                  <button onClick={() => openBatch(b.id)} className="text-slate-700 underline hover:text-slate-900">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">Upload #{selected.id} — {STATUS_LABELS[selected.status] ?? selected.status}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-900">Close</button>
            </div>
            {selected.items.length === 0 ? (
              <p className="text-sm text-slate-500">No orders extracted from this upload yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2">Order #</th>
                    <th>Consignee</th>
                    <th>City</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2">{item.parsed_json?.source_order_ref ?? "-"}</td>
                      <td>{item.parsed_json?.consignee_name ?? "-"}</td>
                      <td>{item.parsed_json?.city ?? "-"}</td>
                      <td>{item.parsed_json?.order_total ?? "-"}</td>
                      <td>
                        {item.committed_shipment_id
                          ? "Booked"
                          : item.match_status === "duplicate"
                            ? "Duplicate — skipped"
                            : item.match_status === "possible_duplicate"
                              ? "Possible duplicate — pending review"
                              : "Pending review"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
