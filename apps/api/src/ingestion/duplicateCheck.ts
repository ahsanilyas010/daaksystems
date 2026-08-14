// Duplicate/merge detection (plan-order-ingestion.md section 5). Three
// rules, in order — the same order arriving via two different PDFs is a
// failure mode already hit manually (order #1925 in the Canezo run).
import type { PoolClient } from "pg";
import type { ExtractedOrder } from "./extract.js";

export type MatchStatus = "new" | "possible_duplicate" | "duplicate";

export interface MatchResult {
  matchStatus: MatchStatus;
  matchedShipmentId: number | null;
  reason: string | null;
}

export async function checkDuplicate(
  client: PoolClient,
  customerId: number | null,
  order: ExtractedOrder
): Promise<MatchResult> {
  // Rule 1: exact source_order_ref match for the same client -> already in
  // system, never create a second row.
  if (customerId && order.source_order_ref) {
    const exact = await client.query(
      `SELECT id FROM shipments WHERE customer_id = $1 AND customer_order_ref = $2`,
      [customerId, order.source_order_ref]
    );
    if (exact.rows[0]) {
      return { matchStatus: "duplicate", matchedShipmentId: exact.rows[0].id, reason: "exact order ref match" };
    }
  }

  // Rule 2: carrier_tracking_no matches an existing shipment with a
  // *different* order ref -> the airway bill arrived separately from the
  // invoice for the same order; a merge candidate, not a duplicate — still
  // routed through review (v1 never auto-commits), never auto-merged here.
  if (order.carrier_tracking_no) {
    const trackingMatch = await client.query(
      `SELECT id, customer_order_ref FROM shipments WHERE carrier_tracking_no = $1`,
      [order.carrier_tracking_no]
    );
    const row = trackingMatch.rows[0];
    if (row && row.customer_order_ref !== order.source_order_ref) {
      return {
        matchStatus: "possible_duplicate",
        matchedShipmentId: row.id,
        reason: `carrier_tracking_no matches shipment #${row.id} (order ref ${row.customer_order_ref ?? "none"}) — likely the airway bill for that order, merge candidate`,
      };
    }
  }

  // Rule 3: fuzzy phone + address match with no order ref at all (common
  // for WhatsApp orders) -> flag for a human decision, never auto-merge on
  // this alone.
  if (!order.source_order_ref && order.consignee_phone) {
    const fuzzy = await client.query(
      `SELECT id FROM shipments
       WHERE consignee_phone = $1
         AND ($2::text IS NULL OR consignee_address ILIKE '%' || $2 || '%')
         AND booked_at > now() - interval '30 days'
       LIMIT 1`,
      [order.consignee_phone, order.consignee_address ? order.consignee_address.slice(0, 20) : null]
    );
    if (fuzzy.rows[0]) {
      return {
        matchStatus: "possible_duplicate",
        matchedShipmentId: fuzzy.rows[0].id,
        reason: `phone+address roughly match recent shipment #${fuzzy.rows[0].id}, no order ref to confirm — needs human review`,
      };
    }
  }

  return { matchStatus: "new", matchedShipmentId: null, reason: null };
}
