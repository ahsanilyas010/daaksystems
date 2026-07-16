import { pool } from "../db/pool.js";
import type { CarrierStatusUpdate } from "./types.js";

export type ApplyResult =
  | { outcome: "applied"; shipmentId: number; mappedStatus: string }
  | { outcome: "unknown_shipment"; carrierTrackingNo: string }
  | { outcome: "unmapped_status"; carrierTrackingNo: string; carrierStatus: string };

// Shared by the webhook route and the polling script: look up the shipment
// by carrier + carrier_tracking_no, translate the carrier's raw status via
// carrier_status_map, and — only if a mapping exists — insert a
// shipment_events row (source='carrier_api'). An unmapped status is
// reported back rather than guessed at, so it can't corrupt the locked
// status enum; plan.md section 4.2 wants that translation table curated,
// not silently expanded.
export async function applyCarrierStatusUpdate(
  carrierId: number,
  update: CarrierStatusUpdate
): Promise<ApplyResult> {
  const shipment = await pool.query(
    "SELECT id FROM shipments WHERE carrier_id = $1 AND carrier_tracking_no = $2",
    [carrierId, update.carrierTrackingNo]
  );
  if (!shipment.rows[0]) {
    return { outcome: "unknown_shipment", carrierTrackingNo: update.carrierTrackingNo };
  }
  const shipmentId = shipment.rows[0].id as number;

  const mapping = await pool.query(
    "SELECT mapped_status FROM carrier_status_map WHERE carrier_id = $1 AND carrier_status = $2",
    [carrierId, update.carrierStatus]
  );
  if (!mapping.rows[0]) {
    return { outcome: "unmapped_status", carrierTrackingNo: update.carrierTrackingNo, carrierStatus: update.carrierStatus };
  }
  const mappedStatus = mapping.rows[0].mapped_status as string;

  await pool.query(
    `INSERT INTO shipment_events (shipment_id, status, source, location, note, created_at)
     VALUES ($1, $2, 'carrier_api', $3, $4, COALESCE($5, now()))`,
    [shipmentId, mappedStatus, update.location ?? null, update.note ?? null, update.occurredAt ?? null]
  );

  return { outcome: "applied", shipmentId, mappedStatus };
}
