import { useCallback, useState } from "react";
import { SearchSelect, type SearchSelectOption } from "../components/SearchSelect";
import { downloadCsv, toCsv } from "../lib/csv";
import { api } from "../lib/api";
import type { Customer, DeliveryRunReport, DeliveryRunRow } from "../lib/types";

// City-segregated per-client delivery-run export (plan-order-ingestion.md
// section 7) — the report ops used to build by hand in a spreadsheet after
// each batch of orders. Grouped by city zone (cities.zone, e.g. "Islamabad/
// Rawalpindi" vs "Lahore"), delivery charge subtracted to get what's owed
// back to the client. "-" for amount to transfer means the order was
// cancelled/returned/lost and isn't getting paid out.
export function DeliveryRun() {
  const [customer, setCustomer] = useState<SearchSelectOption | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<DeliveryRunReport | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchCustomers = useCallback(async (query: string) => {
    const customers = await api.get<Customer[]>(`/customers?search=${encodeURIComponent(query)}`);
    return customers.map((c) => ({ id: c.id, label: c.name }));
  }, []);

  async function runReport() {
    if (!customer) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ customer_id: String(customer.id) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await api.get<DeliveryRunReport>(`/reports/delivery-run?${params}`);
      setReport(data);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const headers = [
      "Order #", "Date", "Customer Name", "Phone", "Address", "Item(s)", "Order Total (Rs.)",
      "Delivery Charge (Rs.)", "Amount to Transfer (Rs.)", "Delivery Status", "Return Status",
      "Confirmed Call", "Notes", "Zone",
    ];
    const rows = report.rows.map((r) => [
      r.order_ref, new Date(r.date).toLocaleDateString(), r.customer_name, r.phone, r.address,
      r.items, r.order_total, r.delivery_charge, r.amount_to_transfer ?? "-", r.delivery_status,
      r.return_status, r.confirmed_call, r.notes, r.zone,
    ]);
    downloadCsv(`delivery-run-${customer?.label ?? "export"}.csv`, toCsv(headers, rows));
  }

  const rowsByZone = new Map<string, DeliveryRunRow[]>();
  if (report) {
    for (const row of report.rows) {
      const list = rowsByZone.get(row.zone) ?? [];
      list.push(row);
      rowsByZone.set(row.zone, list);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Delivery Run Export</h1>
      <p className="text-sm text-gray-600">
        City-segregated delivery run for a client — orders, delivery charges, and the balance owed
        back to them. Replaces the manually-built spreadsheet with something generated on demand.
      </p>

      <div className="flex flex-wrap items-end gap-4 rounded border bg-white p-4">
        <div className="min-w-64">
          <label htmlFor="dr-customer" className="block text-sm font-medium text-gray-700">Client</label>
          <SearchSelect value={customer} onChange={setCustomer} fetchOptions={fetchCustomers} placeholder="Search clients..." />
        </div>
        <div>
          <label htmlFor="dr-from" className="block text-sm font-medium text-gray-700">From</label>
          <input id="dr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label htmlFor="dr-to" className="block text-sm font-medium text-gray-700">To</label>
          <input id="dr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <button
          type="button"
          onClick={runReport}
          disabled={!customer || busy}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Loading..." : "Run report"}
        </button>
        {report && (
          <button type="button" onClick={exportCsv} className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            Export CSV
          </button>
        )}
      </div>

      {report && (
        <>
          <div>
            <h2 className="mb-2 text-lg font-medium">Summary</h2>
            <table className="w-full border-collapse text-sm [&_td]:pr-4 [&_th]:pr-4">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">City / Group</th>
                  <th>Orders</th>
                  <th>Total Collected (Rs.)</th>
                  <th>Delivery Charges (Rs.)</th>
                  <th>Amount to Transfer (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {report.summary.map((z) => (
                  <tr key={z.zone} className="border-b">
                    <td className="py-2">{z.zone}</td>
                    <td>{z.orders}</td>
                    <td>{z.total_collected.toLocaleString()}</td>
                    <td>{z.delivery_charges.toLocaleString()}</td>
                    <td>{z.amount_to_transfer.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2">GRAND TOTAL</td>
                  <td>{report.summary.reduce((s, z) => s + z.orders, 0)}</td>
                  <td>{report.summary.reduce((s, z) => s + z.total_collected, 0).toLocaleString()}</td>
                  <td>{report.summary.reduce((s, z) => s + z.delivery_charges, 0).toLocaleString()}</td>
                  <td>{report.summary.reduce((s, z) => s + z.amount_to_transfer, 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {[...rowsByZone.entries()].map(([zone, rows]) => (
            <div key={zone}>
              <h2 className="mb-2 text-lg font-medium">{zone}</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm [&_td]:pr-4 [&_th]:pr-4">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2">Order #</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Address</th>
                      <th>Item(s)</th>
                      <th>Order Total</th>
                      <th>Delivery Charge</th>
                      <th>Amount to Transfer</th>
                      <th>Status</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2">{r.order_ref}</td>
                        <td>{new Date(r.date).toLocaleDateString()}</td>
                        <td>{r.customer_name}</td>
                        <td>{r.phone}</td>
                        <td className="max-w-64 truncate" title={r.address ?? ""}>{r.address}</td>
                        <td>{r.items}</td>
                        <td>{r.order_total.toLocaleString()}</td>
                        <td>{r.delivery_charge.toLocaleString()}</td>
                        <td>{r.amount_to_transfer !== null ? r.amount_to_transfer.toLocaleString() : "-"}</td>
                        <td>{r.delivery_status}</td>
                        <td className="max-w-48 truncate" title={r.notes}>{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
