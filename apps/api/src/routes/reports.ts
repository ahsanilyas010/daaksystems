import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const GROUP_COLUMNS = {
  carrier: { table: "carriers car", join: "car.id = s.carrier_id", label: "car.name" },
  customer: { table: "customers c", join: "c.id = s.customer_id", label: "c.name" },
  city: { table: "cities ci", join: "ci.id = s.city_id", label: "ci.name" },
} as const;
type GroupKey = keyof typeof GROUP_COLUMNS;

reportsRouter.get(
  "/profit",
  asyncHandler(async (req, res) => {
    const groupBy = (req.query.groupBy as string) in GROUP_COLUMNS ? (req.query.groupBy as GroupKey) : "carrier";
    const { from, to } = req.query;
    const { table, join, label } = GROUP_COLUMNS[groupBy];

    const conditions = ["s.profit IS NOT NULL"];
    const values: unknown[] = [];
    if (typeof from === "string") {
      values.push(from);
      conditions.push(`s.booked_at >= $${values.length}`);
    }
    if (typeof to === "string") {
      values.push(to);
      conditions.push(`s.booked_at <= $${values.length}`);
    }

    const { rows } = await pool.query(
      `SELECT ${label} AS group_label, count(*) AS shipment_count,
              sum(s.profit) AS total_profit, avg(s.profit) AS avg_profit_per_parcel,
              sum(s.cod_amount) AS total_cod, sum(s.dc_amount) AS total_dc
       FROM shipments s JOIN ${table} ON ${join}
       WHERE ${conditions.join(" AND ")}
       GROUP BY ${label}
       ORDER BY total_profit DESC NULLS LAST`,
      values
    );
    res.json({ groupBy, rows });
  })
);
