import type { CarrierAdapter, CarrierStatusUpdate } from "./types.js";

// DEMO/DEV ADAPTER ONLY — makes no network calls to any real carrier.
// Exists so the webhook-ingestion and polling pipeline (translate raw
// status → shipment_events insert) has something real to exercise before
// any actual carrier credentials are available. Wire a real adapter for
// bluex/rocket/etc. into registry.ts and this one stops being used for
// that carrier.
const SIMULATED_PROGRESSION = ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

export const mockAdapter: CarrierAdapter = {
  carrierName: "mock",

  async pollStatus(carrierTrackingNo: string): Promise<CarrierStatusUpdate[]> {
    const next = SIMULATED_PROGRESSION[Math.floor(Math.random() * SIMULATED_PROGRESSION.length)];
    return [{ carrierTrackingNo, carrierStatus: next, note: "simulated by mock adapter" }];
  },

  parseWebhook(payload: unknown): CarrierStatusUpdate[] {
    const body = payload as { tracking_no?: string; status?: string; location?: string };
    if (!body.tracking_no || !body.status) return [];
    return [{ carrierTrackingNo: body.tracking_no, carrierStatus: body.status, location: body.location }];
  },
};
