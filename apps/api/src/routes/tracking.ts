import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";

// Public, unauthenticated tracking lookup — plan.md App 4 (track.daak.pk/{tracking_number}).
// Deliberately returns only what a sender/consignee should see: no internal
// cost/profit/customer-account fields.
export const trackingRouter = Router();

trackingRouter.get(
  "/:trackingNo",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.daak_tracking_no, s.status, s.status_updated_at, s.consignee_name,
              s.booked_at, s.delivered_at, s.return_reason, ci.name AS city_name,
              car.name AS carrier_name
       FROM shipments s
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN carriers car ON car.id = s.carrier_id
       WHERE s.daak_tracking_no = $1`,
      [req.params.trackingNo]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "no shipment found for this tracking number" });
      return;
    }
    const events = await pool.query(
      `SELECT status, location, created_at FROM shipment_events
       WHERE shipment_id = (SELECT id FROM shipments WHERE daak_tracking_no = $1)
       ORDER BY created_at, id`,
      [req.params.trackingNo]
    );
    res.json({ ...rows[0], events: events.rows });
  })
);
