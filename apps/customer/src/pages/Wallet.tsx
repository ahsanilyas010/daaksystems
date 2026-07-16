import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { StatementEntry, Wallet as WalletType } from "../lib/types";

export function Wallet() {
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [statement, setStatement] = useState<StatementEntry[]>([]);
  const [showStatement, setShowStatement] = useState(false);

  useEffect(() => {
    api.get<WalletType>("/customer-app/wallet").then(setWallet);
  }, []);

  function loadStatement() {
    api.get<StatementEntry[]>("/customer-app/wallet/statement").then((s) => {
      setStatement(s);
      setShowStatement(true);
    });
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900">COD Wallet</h1>
      {wallet && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-slate-500">Pending (carrier hasn't remitted yet)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">PKR {wallet.pending.total.toLocaleString()}</p>
            <p className="text-xs text-slate-400">{wallet.pending.count} shipment(s)</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-slate-500">Cleared (ready for payout)</p>
            <p className="mt-1 text-2xl font-semibold text-green-700">PKR {wallet.cleared.total.toLocaleString()}</p>
            <p className="text-xs text-slate-400">{wallet.cleared.count} shipment(s)</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-slate-500">Paid out</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">PKR {wallet.paid_out.total.toLocaleString()}</p>
            <p className="text-xs text-slate-400">{wallet.paid_out.count} payout(s)</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 print:border-0">
        <div className="mb-2 flex items-center justify-between print:hidden">
          <h2 className="font-medium text-slate-900">Statement</h2>
          <div className="flex gap-2">
            {!showStatement && (
              <button onClick={loadStatement} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
                Load statement
              </button>
            )}
            {showStatement && (
              <button onClick={() => window.print()} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
                Download / Print
              </button>
            )}
          </div>
        </div>
        {showStatement && (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Date</th>
                <th className="py-1">Tracking #</th>
                <th className="py-1">Direction</th>
                <th className="py-1">Amount</th>
                <th className="py-1">Method</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((s, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="py-1 font-mono text-xs">{s.daak_tracking_no}</td>
                  <td className="py-1">{s.direction === "carrier_in" ? "Received from carrier" : "Paid to you"}</td>
                  <td className="py-1">{s.amount}</td>
                  <td className="py-1">{s.method ?? "-"}</td>
                  <td className="py-1">{s.status}</td>
                </tr>
              ))}
              {statement.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-slate-400">No ledger entries yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
