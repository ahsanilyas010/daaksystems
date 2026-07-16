import { useCallback, useState } from "react";
import { SearchSelect, type SearchSelectOption } from "../components/SearchSelect";
import { ApiError, api } from "../lib/api";
import type { City } from "../lib/types";

export function NewShipment() {
  const [city, setCity] = useState<SearchSelectOption | null>(null);
  const [consigneeName, setConsigneeName] = useState("");
  const [consigneePhone, setConsigneePhone] = useState("");
  const [consigneeAddress, setConsigneeAddress] = useState("");
  const [weight, setWeight] = useState("1");
  const [codAmount, setCodAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchCities = useCallback(async (query: string) => {
    const cities = await api.get<City[]>(`/customer-app/cities?search=${encodeURIComponent(query)}`);
    return cities.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const shipment = await api.post<{ daak_tracking_no: string }>("/customer-app/shipments", {
        consignee_name: consigneeName,
        consignee_phone: consigneePhone || null,
        consignee_address: consigneeAddress || null,
        city_id: city?.id ?? null,
        weight_kg: Number(weight),
        cod_amount: Number(codAmount),
      });
      setSuccess(`Booked: ${shipment.daak_tracking_no}`);
      setConsigneeName("");
      setConsigneePhone("");
      setConsigneeAddress("");
      setCity(null);
      setWeight("1");
      setCodAmount("0");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to book shipment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Book a Shipment</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="consignee-name" className="block text-sm font-medium text-slate-700">Consignee name</label>
            <input id="consignee-name" required value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="consignee-phone" className="block text-sm font-medium text-slate-700">Consignee phone</label>
            <input id="consignee-phone" value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label htmlFor="consignee-address" className="block text-sm font-medium text-slate-700">Consignee address</label>
          <textarea id="consignee-address" value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} rows={2} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">City</label>
          <SearchSelect value={city} onChange={setCity} fetchOptions={fetchCities} placeholder="Search cities..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-slate-700">Weight (kg)</label>
            <input id="weight" type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="cod-amount" className="block text-sm font-medium text-slate-700">COD amount</label>
            <input id="cod-amount" type="number" min="0" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}
        <button type="submit" disabled={busy} className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Booking..." : "Book shipment"}
        </button>
      </form>
    </div>
  );
}
