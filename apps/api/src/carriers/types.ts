// Carrier adapter contract (plan.md section 4.2 / Phase 3). Each real
// carrier (BlueEx, Trax, PostEx, Leopard...) gets one implementation of
// this interface, dropped into registry.ts, once real API credentials
// exist. Nothing here calls a real network today.

export interface CarrierStatusUpdate {
  carrierTrackingNo: string;
  carrierStatus: string; // raw vocabulary from the carrier, translated via carrier_status_map
  location?: string;
  note?: string;
  occurredAt?: string; // ISO timestamp; defaults to now() if omitted
}

export interface CarrierBookingInput {
  daakTrackingNo: string;
  consigneeName: string;
  consigneePhone: string | null;
  consigneeAddress: string | null;
  cityName: string | null;
  weightKg: number | null;
  codAmount: number;
}

export interface CarrierAdapter {
  /** Must match the `carriers.name` row this adapter serves. */
  carrierName: string;

  /** Auto-booking: create a CN via the carrier's API. Optional — carriers
   *  without one are booked manually and their tracking number entered by
   *  hand, same as today. */
  bookShipment?(input: CarrierBookingInput): Promise<{ carrierTrackingNo: string }>;

  /** Cron-style polling for shipments that already have a carrier tracking
   *  number. Optional — carriers without one only get status via webhook
   *  or manual entry. */
  pollStatus?(carrierTrackingNo: string): Promise<CarrierStatusUpdate[]>;

  /** Parse an inbound webhook payload into status updates. Optional — a
   *  generic {tracking_no, status, location?} shape is assumed if absent. */
  parseWebhook?(payload: unknown): CarrierStatusUpdate[];
}
