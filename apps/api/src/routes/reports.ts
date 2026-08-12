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

// Per-client delivery-run export (plan-order-ingestion.md section 7): the
// city-segregated sheet ops currently builds by hand after a batch of
// orders comes in — grouped by city zone, delivery charge subtracted to
// get what's owed back to the client. "Amount to transfer" is null (the
// UI renders it as "-") for anything that isn't going to complete
// successfully, matching how the manually-built version already treats a
// cancelled order.
const NON_TRANSFERABLE_STATUSES = ["CANCELLED", "RETURNED", "RETURN_INITIATED", "LOST", "DAMAGED"];
const STATUS_LABELS: Record<string, string> = {
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  LOST: "Lost",
  DAMAGED: "Damaged",
};
const RETURN_LABELS: Record<string, string> = {
  RETURN_INITIATED: "Return requested",
  RETURNED: "Returned",
};

reportsRouter.get(
  "/delivery-run",
  asyncHandler(async (req, res) => {
    const { customer_id, from, to } = req.query;
    if (typeof customer_id !== "string") {
      res.status(400).json({ error: "customer_id is required" });
      return;
    }
    const conditions = ["s.customer_id = $1"];
    const values: unknown[] = [Number(customer_id)];
    if (typeof from === "string") {
      values.push(from);
      conditions.push(`s.booked_at >= $${values.length}`);
    }
    if (typeof to === "string") {
      values.push(to);
      conditions.push(`s.booked_at <= $${values.length}`);
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.daak_tracking_no, s.customer_order_ref, s.booked_at, s.consignee_name,
              s.consignee_phone, s.consignee_address, s.items, s.cod_amount, s.dc_amount,
              s.status, s.carrier_tracking_no, car.name AS carrier_name,
              COALESCE(ci.name, 'Unassigned') AS city_label
       FROM shipments s
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN carriers car ON car.id = s.carrier_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY city_label, s.booked_at`,
      values
    );

    const formatItems = (items: unknown) =>
      Array.isArray(items) ? items.map((i: { name: string; qty: number }) => `${i.name} x${i.qty}`).join(" + ") : "";
    const formatNotes = (trackingNo: string | null, carrierName: string | null) =>
      trackingNo ? `Shipped via ${carrierName ?? "carrier"}, Tracking ${trackingNo}` : "";

    const orderRows = rows.map((r) => {
      const transferable = !NON_TRANSFERABLE_STATUSES.includes(r.status);
      return {
        id: r.id,
        order_ref: r.customer_order_ref ?? r.daak_tracking_no,
        date: r.booked_at,
        customer_name: r.consignee_name,
        phone: r.consignee_phone,
        address: r.consignee_address,
        items: formatItems(r.items),
        order_total: Number(r.cod_amount),
        delivery_charge: Number(r.dc_amount),
        amount_to_transfer: transferable ? Number(r.cod_amount) - Number(r.dc_amount) : null,
        delivery_status: STATUS_LABELS[r.status] ?? "Pending",
        return_status: RETURN_LABELS[r.status] ?? "",
        confirmed_call: "", // Phase 0.5f (stakeholder dashboard) territory — not tracked yet
        notes: formatNotes(r.carrier_tracking_no, r.carrier_name),
        city: r.city_label,
      };
    });

    const cities = new Map<string, { orders: number; total_collected: number; delivery_charges: number; amount_to_transfer: number }>();
    for (const row of orderRows) {
      const z = cities.get(row.city) ?? { orders: 0, total_collected: 0, delivery_charges: 0, amount_to_transfer: 0 };
      z.orders += 1;
      z.total_collected += row.order_total;
      z.delivery_charges += row.delivery_charge;
      z.amount_to_transfer += row.amount_to_transfer ?? 0;
      cities.set(row.city, z);
    }
    const summary = [...cities.entries()].map(([city, totals]) => ({ city, ...totals }));

    res.json({ summary, rows: orderRows });
  })
);
