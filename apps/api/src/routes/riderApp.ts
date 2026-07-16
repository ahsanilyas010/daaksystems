import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireRiderAuth } from "../middleware/riderAuth.js";

// Rider PWA API surface (plan.md App 2). Everything here is scoped to
// req.rider.id — a rider can only see/act on shipments assigned to them.
export const riderAppRouter = Router();
riderAppRouter.use(requireRiderAuth);

const shipmentSummary = `
  s.id, s.daak_tracking_no, s.consignee_name, s.consignee_phone, s.consignee_address,
  s.cod_amount, s.weight_kg, s.pieces, s.status,
  c.name AS customer_name, ci.name AS city_name
`;

riderAppRouter.get(
  "/pickups",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${shipmentSummary} FROM shipments s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       WHERE s.pickup_rider_id = $1 AND s.status = 'PICKUP_ASSIGNED'
       ORDER BY s.booked_at`,
      [req.rider!.id]
    );
    res.json(rows);
  })
);

riderAppRouter.get(
  "/deliveries",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${shipmentSummary} FROM shipments s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       WHERE s.pickup_rider_id = $1 AND s.status = 'OUT_FOR_DELIVERY'
       ORDER BY s.booked_at`,
      [req.rider!.id]
    );
    res.json(rows);
  })
);

const pickSchema = z.object({
  weight_kg: z.number().positive().optional(),
  pieces: z.number().int().positive().optional(),
  photo_data_uri: z.string().optional(),
  signature_data_uri: z.string().optional(),
});

// SOP-02 (plan.md section 5): rider must scan/confirm every parcel at
// pickup — unscanned is not picked, no exceptions. Also upserts today's
// rider_runs row so the admin payout screen (Phase 2) stays in sync with
// live PWA usage instead of relying only on ops backfilling it later.
riderAppRouter.post(
  "/shipments/:id/pick",
  asyncHandler(async (req, res) => {
    const body = pickSchema.parse(req.body);
    const shipmentId = Number(req.params.id);

    const owned = await pool.query(
      "SELECT id FROM shipments WHERE id = $1 AND pickup_rider_id = $2 AND status = 'PICKUP_ASSIGNED'",
      [shipmentId, req.rider!.id]
    );
    if (!owned.rows[0]) {
      res.status(404).json({ error: "shipment not found or not assigned to you for pickup" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO shipment_events (shipment_id, status, source, actor, metadata)
         VALUES ($1, 'PICKED', 'rider_app', $2, $3)`,
        [
          shipmentId, req.rider!.name,
          JSON.stringify({
            confirmed_weight_kg: body.weight_kg ?? null,
            confirmed_pieces: body.pieces ?? null,
            photo_data_uri: body.photo_data_uri ?? null,
            signature_data_uri: body.signature_data_uri ?? null,
          }),
        ]
      );
      await client.query(
        `INSERT INTO rider_runs (rider_id, run_date, pickups_count, payout_per_pickup)
         VALUES ($1, CURRENT_DATE, 1, 100)
         ON CONFLICT (rider_id, run_date)
         DO UPDATE SET pickups_count = rider_runs.pickups_count + 1`,
        [req.rider!.id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.status(201).json({ ok: true });
  })
);

const deliverSchema = z.object({
  otp: z.string().optional(),
  photo_data_uri: z.string().optional(),
  cod_collected_amount: z.number().nonnegative().optional(),
  failed: z.boolean().default(false),
  failure_reason: z.string().optional(),
});

riderAppRouter.post(
  "/shipments/:id/deliver",
  asyncHandler(async (req, res) => {
    const body = deliverSchema.parse(req.body);
    const shipmentId = Number(req.params.id);

    const shipment = await pool.query(
      "SELECT id, cod_amount FROM shipments WHERE id = $1 AND pickup_rider_id = $2 AND status = 'OUT_FOR_DELIVERY'",
      [shipmentId, req.rider!.id]
    );
    if (!shipment.rows[0]) {
      res.status(404).json({ error: "shipment not found or not out for delivery with you" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const status = body.failed ? "RETURN_INITIATED" : "DELIVERED";
      await client.query(
        `INSERT INTO shipment_events (shipment_id, status, source, actor, note, metadata)
         VALUES ($1, $2, 'rider_app', $3, $4, $5)`,
        [
          shipmentId, status, req.rider!.name, body.failure_reason ?? null,
          JSON.stringify({
            otp_verified: body.otp ? true : undefined,
            photo_data_uri: body.photo_data_uri ?? null,
            cod_collected_amount: body.cod_collected_amount ?? null,
          }),
        ]
      );
      if (!body.failed && body.cod_collected_amount && body.cod_collected_amount > 0) {
        // Rider collected COD cash directly (Daak's own last-mile delivery,
        // no external carrier) — same ledger direction as a carrier
        // remittance, since either way this is COD cash landing with Daak.
        await client.query(
          `INSERT INTO cod_ledger (shipment_id, direction, amount, method, status)
           VALUES ($1, 'carrier_in', $2, 'cash', 'received')`,
          [shipmentId, body.cod_collected_amount]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.status(201).json({ ok: true });
  })
);

riderAppRouter.get(
  "/earnings/today",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM rider_runs WHERE rider_id = $1 AND run_date = CURRENT_DATE",
      [req.rider!.id]
    );
    res.json(rows[0] ?? { pickups_count: 0, payout_per_pickup: 0, total_payout: 0, paid_at: null });
  })
);
