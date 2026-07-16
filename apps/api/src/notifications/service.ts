import { pool } from "../db/pool.js";
import { consoleProvider } from "./consoleProvider.js";
import { renderTemplate } from "./templates.js";
import type { NotificationProvider } from "./types.js";

// Swap this for a real WhatsApp/SMS provider once credentials exist —
// every call site below goes through here, not the provider directly.
const provider: NotificationProvider = consoleProvider;

// Statuses where the sender (not just the consignee) needs to know —
// these are the ones with money or action attached for them.
const NOTIFY_SENDER_TOO = new Set(["RETURN_INITIATED", "RETURNED", "LOST", "DAMAGED"]);

/**
 * Fire notifications for a shipment status change. Best-effort: never
 * throws — a notification failure must never fail the booking/status
 * update it's attached to. Call this AFTER the triggering transaction
 * commits, not from inside it.
 */
export async function notifyStatusChange(shipmentId: number, status: string): Promise<void> {
  try {
    const template = renderTemplate(status, "");
    if (!template) return; // no copy for this status — nothing to send

    const { rows } = await pool.query(
      `SELECT s.daak_tracking_no, s.consignee_phone, c.phone AS sender_phone
       FROM shipments s JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1`,
      [shipmentId]
    );
    const shipment = rows[0];
    if (!shipment) return;

    const rendered = renderTemplate(status, shipment.daak_tracking_no);
    if (!rendered) return;
    const message = `${rendered.en}\n${rendered.ur}`;

    if (shipment.consignee_phone) {
      await provider.send(shipment.consignee_phone, message);
    }
    if (NOTIFY_SENDER_TOO.has(status) && shipment.sender_phone) {
      await provider.send(shipment.sender_phone, message);
    }
  } catch (err) {
    console.error(`[notify] failed for shipment ${shipmentId} status ${status}:`, err);
  }
}
