import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PhotoInput } from "../components/PhotoInput";
import { api, submitOrQueue } from "../lib/api";
import type { RiderShipment } from "../lib/types";

const FAILURE_REASONS = [
  "Consignee not available",
  "Consignee refused",
  "Wrong address",
  "Phone unreachable",
  "Payment not ready",
  "Other",
];

export function DeliveryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState<RiderShipment | null>(null);
  const [otp, setOtp] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [codCollected, setCodCollected] = useState("");
  const [mode, setMode] = useState<"deliver" | "fail">("deliver");
  const [failureReason, setFailureReason] = useState(FAILURE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<RiderShipment[]>("/rider-app/deliveries").then((list) => {
      const s = list.find((x) => x.id === Number(id)) ?? null;
      setShipment(s);
      if (s) setCodCollected(s.cod_amount);
    });
  }, [id]);

  async function submit() {
    setBusy(true);
    try {
      const result = await submitOrQueue("deliver", Number(id), {
        otp: mode === "deliver" ? otp || undefined : undefined,
        photo_data_uri: mode === "deliver" ? photo ?? undefined : undefined,
        cod_collected_amount: mode === "deliver" && codCollected ? Number(codCollected) : undefined,
        failed: mode === "fail",
        failure_reason: mode === "fail" ? failureReason : undefined,
      });
      setMessage(result.queued ? "Saved offline — will sync automatically" : "Recorded");
      setTimeout(() => navigate("/deliveries"), 900);
    } finally {
      setBusy(false);
    }
  }

  if (!shipment) return <p className="p-4 text-slate-400">Loading...</p>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500">← Back</button>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="font-mono text-sm text-slate-500">{shipment.daak_tracking_no}</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{shipment.consignee_name}</p>
        <p className="text-sm text-slate-500">{shipment.consignee_address ?? "-"}</p>
        {shipment.consignee_phone && (
          <a href={`tel:${shipment.consignee_phone}`} className="mt-1 inline-block text-sm text-blue-600">
            📞 {shipment.consignee_phone}
          </a>
        )}
      </div>

      <div className="flex rounded-lg border border-gray-300 p-1">
        <button
          onClick={() => setMode("deliver")}
          className={`flex-1 rounded py-2 text-sm font-medium ${mode === "deliver" ? "bg-slate-900 text-white" : "text-slate-600"}`}
        >
          Delivered
        </button>
        <button
          onClick={() => setMode("fail")}
          className={`flex-1 rounded py-2 text-sm font-medium ${mode === "fail" ? "bg-red-600 text-white" : "text-slate-600"}`}
        >
          Failed attempt
        </button>
      </div>

      {mode === "deliver" ? (
        <>
          <div>
            <label htmlFor="cod-collected" className="block text-sm font-medium text-slate-700">COD collected (PKR)</label>
            <input id="cod-collected" type="number" min="0" value={codCollected} onChange={(e) => setCodCollected(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" />
          </div>
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-slate-700">OTP (if consignee has one)</label>
            <input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" />
          </div>
          <PhotoInput label="Proof of delivery photo" onCapture={setPhoto} />
        </>
      ) : (
        <div>
          <label htmlFor="failure-reason" className="block text-sm font-medium text-slate-700">Reason</label>
          <select id="failure-reason" value={failureReason} onChange={(e) => setFailureReason(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base">
            {FAILURE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      )}

      {message && <p className="text-sm text-green-600">{message}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className={`w-full rounded-lg px-3 py-4 text-base font-medium text-white disabled:opacity-50 ${mode === "fail" ? "bg-red-600" : "bg-slate-900"}`}
      >
        {busy ? "Saving..." : mode === "fail" ? "Record failed attempt" : "Confirm delivery"}
      </button>
    </div>
  );
}
