import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

export const exceptionsRouter = Router();
exceptionsRouter.use(requireAuth);

const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "LOST", "DAMAGED", "CANCELLED"];

// Exception queue (plan.md section 4.5): anything with no status change in
// 48h, or 2+ failed delivery attempts, while still in flight. Age is the
// SLA timer — how long it's been sitting since its last real update.
exceptionsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.daak_tracking_no, s.status, s.status_updated_at, s.attempts_count,
              c.name AS customer_name, ci.name AS city_name, car.name AS carrier_name,
              EXTRACT(EPOCH FROM (now() - s.status_updated_at)) / 3600 AS hours_since_update,
              CASE WHEN now() - s.status_updated_at > interval '48 hours' THEN true ELSE false END AS stale_48h,
              CASE WHEN s.attempts_count >= 2 THEN true ELSE false END AS repeated_failure
       FROM shipments s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN carriers car ON car.id = s.carrier_id
       WHERE s.status != ALL($1)
         AND (now() - s.status_updated_at > interval '48 hours' OR s.attempts_count >= 2)
       ORDER BY s.status_updated_at ASC`,
      [TERMINAL_STATUSES]
    );
    res.json(rows);
  })
);
