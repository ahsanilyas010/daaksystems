import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SearchSelect, type SearchSelectOption } from "../components/SearchSelect";
import { ApiError, api } from "../lib/api";
import type { Customer, IngestionBatch } from "../lib/types";

const STATUS_BADGE: Record<IngestionBatch["status"], string> = {
  processing: "bg-blue-100 text-blue-800",
  needs_review: "bg-amber-100 text-amber-800",
  committed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

type Mode = "pdf" | "text" | "screenshot";

export function Ingestion() {
  const [batches, setBatches] = useState<IngestionBatch[]>([]);
  const [customer, setCustomer] = useState<SearchSelectOption | null>(null);
  const [mode, setMode] = useState<Mode>("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const customers = await api.get<Customer[]>(`/customers?search=${encodeURIComponent(query)}`);
    return customers.map((c) => ({ id: c.id, label: c.name }));
  }, []);

  async function refresh() {
    const rows = await api.get<IngestionBatch[]>("/ingestion/batches");
    setBatches(rows);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "text") {
        if (!pastedText.trim()) {
          setError("paste some text first");
          return;
        }
        await api.post("/ingestion/batches/text", { text: pastedText, customer_id: customer?.id });
        setPastedText("");
      } else {
        if (!file) {
          setError(mode === "pdf" ? "choose a PDF first" : "choose a screenshot first");
          return;
        }
        const form = new FormData();
        form.append("file", file);
        if (customer) form.append("customer_id", String(customer.id));
        await api.upload(mode === "pdf" ? "/ingestion/batches" : "/ingestion/batches/screenshot", form);
        setFile(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Order Ingestion</h1>
      <p className="text-sm text-gray-600">
        Upload a Shopify order-printer PDF bundle, a carrier airway bill, a pasted WhatsApp message, or a
        forwarded screenshot. Every order gets extracted and staged here for review before anything lands
        in the shipment board.
      </p>

      <div className="flex gap-2 text-sm">
        {(["pdf", "text", "screenshot"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1.5 ${mode === m ? "bg-slate-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {m === "pdf" ? "PDF upload" : m === "text" ? "Paste WhatsApp text" : "Forward screenshot"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded border bg-white p-4">
        <div className="min-w-64">
          <label htmlFor="ingestion-customer" className="block text-sm font-medium text-gray-700">
            Client (optional — can assign later)
          </label>
          <SearchSelect value={customer} onChange={setCustomer} fetchOptions={fetchCustomers} placeholder="Search clients..." />
        </div>

        {mode === "text" ? (
          <div>
            <label htmlFor="ingestion-text" className="block text-sm font-medium text-gray-700">
              Pasted message
            </label>
            <textarea
              id="ingestion-text"
              rows={5}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Paste the forwarded WhatsApp order text here..."
            />
          </div>
        ) : (
          <div>
            <label htmlFor="ingestion-file" className="block text-sm font-medium text-gray-700">
              {mode === "pdf" ? "PDF file" : "Screenshot image"}
            </label>
            <input
              id="ingestion-file"
              type="file"
              accept={mode === "pdf" ? "application/pdf" : "image/*"}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block text-sm"
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Extracting..." : "Upload & extract"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Batch</th>
            <th>Client</th>
            <th>Source</th>
            <th>Uploaded</th>
            <th>Items</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-b hover:bg-gray-50">
              <td className="py-2">#{b.id}</td>
              <td>{b.customer_name ?? <span className="text-gray-400">unassigned</span>}</td>
              <td>{b.source_ref ?? b.source}</td>
              <td>{new Date(b.uploaded_at).toLocaleString()}</td>
              <td>
                {b.item_count}
                {b.error_count > 0 && <span className="ml-1 text-red-600">({b.error_count} failed)</span>}
              </td>
              <td>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[b.status]}`}>{b.status}</span>
              </td>
              <td>
                <Link to={`/ingestion/${b.id}`} className="text-blue-600 hover:underline">
                  Review
                </Link>
              </td>
            </tr>
          ))}
          {batches.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-gray-500">
                No batches uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
