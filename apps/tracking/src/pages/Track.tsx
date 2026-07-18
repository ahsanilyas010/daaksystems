import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchTracking, type TrackingResult } from "../lib/api";

// plan.md App 4: Booked → Picked → In Transit → Out for Delivery → Delivered / Returned
const TIMELINE_STAGES = [
  { key: "BOOKED", label: "Booked" },
  { key: "PICKED", label: "Picked" },
  { key: "IN_TRANSIT", label: "In Transit" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

const TERMINAL_LABELS: Record<string, string> = {
  RETURNED: "Returned",
  RETURN_INITIATED: "Return Initiated",
  LOST: "Lost",
  DAMAGED: "Damaged",
  CANCELLED: "Cancelled",
};

// Full shipment_status progression (plan.md section 3), ranked so statuses
// not shown on the simplified public timeline (e.g. HANDED_TO_CARRIER) still
// count toward "have we passed this timeline stage".
const FULL_STATUS_ORDER = [
  "BOOKED", "PICKUP_ASSIGNED", "PICKED", "HANDED_TO_CARRIER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED",
];

function reachedStage(result: TrackingResult, stageKey: string): boolean {
  const highestReachedIndex = Math.max(
    -1,
    ...result.events.map((e) => FULL_STATUS_ORDER.indexOf(e.status))
  );
  return FULL_STATUS_ORDER.indexOf(stageKey) <= highestReachedIndex;
}

export function Track() {
  const { trackingNo } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(trackingNo ?? "");
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trackingNo) return;
    setLoading(true);
    setError(null);
    fetchTracking(trackingNo)
      .then(setResult)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [trackingNo]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (input.trim()) navigate(`/${input.trim()}`);
  }

  const isTerminalException = result && TERMINAL_LABELS[result.status];

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-1 text-center text-2xl font-bold text-slate-900">DAAK Tracking</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Enter your Daak tracking number</p>

        <form onSubmit={onSearch} className="mb-6 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="DAAK-YYMMDD-XXXXX"
            className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          />
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Track
          </button>
        </form>

        {loading && <p className="text-center text-slate-500">Looking up your shipment...</p>}
        {error && <p className="text-center text-red-600">{error}</p>}

        {result && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-sm text-slate-500">{result.daak_tracking_no}</span>
              <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {isTerminalException ?? result.status}
              </span>
            </div>

            {isTerminalException ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {isTerminalException}
                {result.return_reason && <div className="mt-1">Reason: {result.return_reason}</div>}
              </div>
            ) : (
              <ol className="flex justify-between">
                {TIMELINE_STAGES.map((stage) => {
                  const done = reachedStage(result, stage.key);
                  return (
                    <li key={stage.key} className="flex flex-1 flex-col items-center text-center">
                      <div className={`mb-1 h-3 w-3 rounded-full ${done ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className={`text-xs ${done ? "font-medium text-slate-900" : "text-slate-400"}`}>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-6 space-y-2 border-t border-gray-100 pt-4 text-sm">
              {result.events.map((ev, i) => (
                <div key={i} className="flex justify-between text-slate-600">
                  <span>{ev.status.replace(/_/g, " ")}{ev.location ? ` — ${ev.location}` : ""}</span>
                  <span className="text-slate-400">{new Date(ev.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
