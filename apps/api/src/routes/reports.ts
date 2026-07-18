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

// KPI dashboard (plan.md section 5 "KPIs on the admin dashboard"). On-time
// is judged against a simple published target since no per-shipment SLA
// date is stored: overnight = delivered within 1 day of booking, standard
// = within 3 days. First-attempt success = delivered with attempts_count
// <= 1 (no OUT_FOR_DELIVERY retry needed).
reportsRouter.get(
  "/kpis",
  asyncHandler(async (_req, res) => {
    const delivery = await pool.query(`
      SELECT
        count(*) FILTER (WHERE status = 'DELIVERED') AS delivered_count,
        count(*) FILTER (
          WHERE status = 'DELIVERED' AND (
            (service_type = 'overnight' AND delivered_at - booked_at <= interval '1 day') OR
            (service_type != 'overnight' AND delivered_at - booked_at <= interval '3 days')
          )
        ) AS on_time_count,
        count(*) FILTER (WHERE status = 'DELIVERED' AND attempts_count <= 1) AS first_attempt_count,
        count(*) FILTER (WHERE status = 'RETURNED') AS returned_count,
        count(*) FILTER (WHERE status = 'LOST') AS lost_count,
        count(*) AS total_count
      FROM shipments
    `);

    const codCycle = await pool.query(`
      SELECT
        avg(EXTRACT(EPOCH FROM (ci.created_at - s.delivered_at)) / 3600) AS avg_hours_delivered_to_carrier_in,
        avg(EXTRACT(EPOCH FROM (so.created_at - ci.created_at)) / 3600) AS avg_hours_carrier_in_to_sender_out
      FROM shipments s
      JOIN cod_ledger ci ON ci.shipment_id = s.id AND ci.direction = 'carrier_in'
      LEFT JOIN cod_ledger so ON so.shipment_id = s.id AND so.direction = 'sender_out'
      WHERE s.delivered_at IS NOT NULL
    `);

    const exceptionAge = await pool.query(`
      SELECT avg(EXTRACT(EPOCH FROM (now() - status_updated_at)) / 3600) AS avg_hours,
             max(EXTRACT(EPOCH FROM (now() - status_updated_at)) / 3600) AS max_hours
      FROM shipments
      WHERE status != ALL($1)
        AND (now() - status_updated_at > interval '48 hours' OR attempts_count >= 2)
    `, [["DELIVERED", "RETURNED", "LOST", "DAMAGED", "CANCELLED"]]);

    const d = delivery.rows[0];
    const cod = codCycle.rows[0];
    const exc = exceptionAge.rows[0];
    const pct = (n: string, d: string) => (Number(d) > 0 ? (Number(n) / Number(d)) * 100 : null);

    res.json({
      on_time_delivery_pct: pct(d.on_time_count, d.delivered_count),
      first_attempt_success_pct: pct(d.first_attempt_count, d.delivered_count),
      return_rate_pct: pct(d.returned_count, d.total_count),
      lost_rate_pct: pct(d.lost_count, d.total_count),
      delivered_count: Number(d.delivered_count),
      total_count: Number(d.total_count),
      cod_cycle_hours: {
        delivered_to_carrier_remittance: cod.avg_hours_delivered_to_carrier_in ? Number(cod.avg_hours_delivered_to_carrier_in) : null,
        carrier_remittance_to_sender_payout: cod.avg_hours_carrier_in_to_sender_out ? Number(cod.avg_hours_carrier_in_to_sender_out) : null,
      },
      exception_queue: {
        avg_age_hours: exc.avg_hours ? Number(exc.avg_hours) : null,
        max_age_hours: exc.max_hours ? Number(exc.max_hours) : null,
      },
    });
  })
);
