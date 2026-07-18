import { useCallback, useState } from "react";
import { ShippingLabel } from "../components/ShippingLabel";
import { SearchSelect, type SearchSelectOption } from "../components/SearchSelect";
import { ApiError, api } from "../lib/api";
import type { City, Customer, Shipment } from "../lib/types";

export function BookingDesk() {
  const [customer, setCustomer] = useState<SearchSelectOption | null>(null);
  const [city, setCity] = useState<SearchSelectOption | null>(null);
  const [consigneeName, setConsigneeName] = useState("");
  const [consigneePhone, setConsigneePhone] = useState("");
  const [consigneeAddress, setConsigneeAddress] = useState("");
  const [weight, setWeight] = useState("1");
  const [pieces, setPieces] = useState("1");
  const [codAmount, setCodAmount] = useState("0");
  const [dcAmount, setDcAmount] = useState("0");
  const [serviceType, setServiceType] = useState<"standard" | "overnight">("standard");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Shipment | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const customers = await api.get<Customer[]>(`/customers?search=${encodeURIComponent(query)}`);
    return customers.map((c) => ({ id: c.id, label: c.name }));
  }, []);

  const fetchCities = useCallback(async (query: string) => {
    const cities = await api.get<City[]>(`/reference/cities?search=${encodeURIComponent(query)}`);
    return cities.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer) {
      setError("select a customer (sender)");
      return;
    }
    setBusy(true);
    try {
      const shipment = await api.post<Shipment>("/shipments", {
        customer_id: customer.id,
        consignee_name: consigneeName,
        consignee_phone: consigneePhone || null,
        consignee_address: consigneeAddress || null,
        city_id: city?.id ?? null,
        weight_kg: Number(weight),
        pieces: Number(pieces),
        cod_amount: Number(codAmount),
        dc_amount: Number(dcAmount),
        service_type: serviceType,
      });
      setCreated(shipment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "failed to create shipment");
    } finally {
      setBusy(false);
    }
  }

  function bookAnother() {
    setCreated(null);
    setCustomer(null);
    setCity(null);
    setConsigneeName("");
    setConsigneePhone("");
    setConsigneeAddress("");
    setWeight("1");
    setPieces("1");
    setCodAmount("0");
    setDcAmount("0");
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="rounded border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">
            Shipment booked: {created.daak_tracking_no}
          </p>
        </div>
        <div className="print-area">
          <ShippingLabel shipment={created} />
        </div>
        <div className="flex justify-center gap-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Print label
          </button>
          <button
            onClick={bookAnother}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Booking Desk</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">Sender (customer)</label>
          <SearchSelect value={customer} onChange={setCustomer} fetchOptions={fetchCustomers} placeholder="Search customers..." />
        </div>
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
          <label className="block text-sm font-medium text-slate-700">Consignee address</label>
          <textarea value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">City</label>
          <SearchSelect value={city} onChange={setCity} fetchOptions={fetchCities} placeholder="Search cities..." />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-slate-700">Weight (kg)</label>
            <input id="weight" type="number" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="pieces" className="block text-sm font-medium text-slate-700">Pieces</label>
            <input id="pieces" type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="cod-amount" className="block text-sm font-medium text-slate-700">COD amount</label>
            <input id="cod-amount" type="number" min="0" value={codAmount} onChange={(e) => setCodAmount(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="dc-amount" className="block text-sm font-medium text-slate-700">DC amount</label>
            <input id="dc-amount" type="number" min="0" value={dcAmount} onChange={(e) => setDcAmount(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Service type</label>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value as "standard" | "overnight")} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="standard">Standard</option>
            <option value="overnight">Overnight</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
          {busy ? "Booking..." : "Book shipment"}
        </button>
      </form>
    </div>
  );
}
