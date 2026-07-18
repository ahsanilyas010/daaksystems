import type { CarrierAdapter } from "./types.js";
import { mockAdapter } from "./mockAdapter.js";

// Real carriers (bluex, rocket, call_courier, ...) have no adapter yet —
// they're tracked exactly as they are today: manual status entry in the
// admin ERP. Add an entry here once real API credentials exist for one.
const ADAPTERS: Record<string, CarrierAdapter> = {
  mock: mockAdapter,
};

export function getCarrierAdapter(carrierName: string): CarrierAdapter | undefined {
  return ADAPTERS[carrierName];
}

export function listCarriersWithAdapters(): string[] {
  return Object.keys(ADAPTERS);
}
