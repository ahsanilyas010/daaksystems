const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export interface TrackingEvent {
  status: string;
  location: string | null;
  created_at: string;
}

export interface TrackingResult {
  daak_tracking_no: string;
  status: string;
  status_updated_at: string;
  consignee_name: string | null;
  booked_at: string;
  delivered_at: string | null;
  return_reason: string | null;
  city_name: string | null;
  carrier_name: string | null;
  events: TrackingEvent[];
}

export async function fetchTracking(trackingNo: string): Promise<TrackingResult> {
  const res = await fetch(`${API_BASE}/track/${encodeURIComponent(trackingNo)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "not found" }));
    throw new Error(body.error ?? "not found");
  }
  return res.json();
}
