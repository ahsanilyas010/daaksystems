import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import type { Customer, RateCard } from "../lib/types";

export function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [rateCardId, setRateCardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<Customer[]>(`/customers?search=${encodeURIComponent(search)}`).then(setCustomers);
  }

  useEffect(() => {
    const handle = setTimeout(load, 200);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    api.get<RateCard[]>("/rate-cards").then(setRateCards);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/customers", {
        name,
        phone: phone || null,
        address: address || null,
        rate_card_id: rateCardId ? Number(rateCardId) : null,
      });
      setName("");
      setPhone("");
      setAddress("");
      setRateCardId("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create customer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
          {showForm ? "Cancel" : "New customer"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4">
          <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm" />
          <select value={rateCardId} onChange={(e) => setRateCardId(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="">No rate card</option>
            {rateCards.map((rc) => (
              <option key={rc.id} value={rc.id}>{rc.name}</option>
            ))}
          </select>
          <div className="col-span-2">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      )}

      <input
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Rate card</th>
              <th className="px-3 py-2">Credit limit</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.phone ?? "-"}</td>
                <td className="px-3 py-2">{c.rate_card_name ?? "-"}</td>
                <td className="px-3 py-2">{c.credit_limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
