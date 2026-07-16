import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const riderRunsRouter = Router();
riderRunsRouter.use(requireAuth);

riderRunsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rider_id, from, to } = req.query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const addCond = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace("?", `$${values.length}`));
    };
    if (typeof rider_id === "string") addCond("rr.rider_id = ?", Number(rider_id));
    if (typeof from === "string") addCond("rr.run_date >= ?", from);
    if (typeof to === "string") addCond("rr.run_date <= ?", to);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT rr.*, r.name AS rider_name, r.code AS rider_code
       FROM rider_runs rr JOIN riders r ON r.id = rr.rider_id
       ${where} ORDER BY rr.run_date DESC LIMIT 200`,
      values
    );
    res.json(rows);
  })
);

const runSchema = z.object({
  rider_id: z.number().int(),
  run_date: z.string(),
  pickups_count: z.number().int().nonnegative(),
  payout_per_pickup: z.number().nonnegative().default(100),
});

riderRunsRouter.post(
  "/",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = runSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO rider_runs (rider_id, run_date, pickups_count, payout_per_pickup)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (rider_id, run_date)
       DO UPDATE SET pickups_count = EXCLUDED.pickups_count, payout_per_pickup = EXCLUDED.payout_per_pickup
       RETURNING *`,
      [body.rider_id, body.run_date, body.pickups_count, body.payout_per_pickup]
    );
    res.status(201).json(rows[0]);
  })
);

riderRunsRouter.post(
  "/:id/pay",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE rider_runs SET paid_at = now() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "rider run not found" });
      return;
    }
    res.json(rows[0]);
  })
);
