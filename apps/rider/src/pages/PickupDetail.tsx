import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PhotoInput } from "../components/PhotoInput";
import { SignaturePad } from "../components/SignaturePad";
import { api, submitOrQueue } from "../lib/api";
import type { RiderShipment } from "../lib/types";

export function PickupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState<RiderShipment | null>(null);
  const [weight, setWeight] = useState("");
  const [pieces, setPieces] = useState("1");
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<RiderShipment[]>("/rider-app/pickups").then((list) => {
      setShipment(list.find((s) => s.id === Number(id)) ?? null);
    });
  }, [id]);

  async function confirmPickup() {
    setBusy(true);
    try {
      const result = await submitOrQueue("pick", Number(id), {
        weight_kg: weight ? Number(weight) : undefined,
        pieces: pieces ? Number(pieces) : undefined,
        photo_data_uri: photo ?? undefined,
        signature_data_uri: signature ?? undefined,
      });
      setMessage(result.queued ? "Saved offline — will sync automatically" : "Pickup confirmed");
      setTimeout(() => navigate("/pickups"), 900);
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
        <p className="mt-1 text-lg font-semibold text-slate-900">{shipment.customer_name}</p>
        <p className="text-sm text-slate-500">{shipment.city_name ?? "-"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="weight" className="block text-sm font-medium text-slate-700">Weight (kg)</label>
          <input id="weight" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" />
        </div>
        <div>
          <label htmlFor="pieces" className="block text-sm font-medium text-slate-700">Pieces</label>
          <input id="pieces" type="number" min="1" value={pieces} onChange={(e) => setPieces(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-3 text-base" />
        </div>
      </div>

      <PhotoInput label="Photo of parcel(s)" onCapture={setPhoto} />
      <SignaturePad onCapture={setSignature} />

      {message && <p className="text-sm text-green-600">{message}</p>}
      <button
        onClick={confirmPickup}
        disabled={busy}
        className="w-full rounded-lg bg-slate-900 px-3 py-4 text-base font-medium text-white disabled:opacity-50"
      >
        {busy ? "Confirming..." : "Confirm pickup"}
      </button>
    </div>
  );
}
