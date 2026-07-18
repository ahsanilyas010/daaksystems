import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { notifyStatusChange } from "../notifications/service.js";

export const shipmentsRouter = Router();
shipmentsRouter.use(requireAuth);

const SHIPMENT_STATUSES = [
  "BOOKED", "PICKUP_ASSIGNED", "PICKED", "HANDED_TO_CARRIER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RETURNED", "LOST",
  "DAMAGED", "CANCELLED",
] as const;

const shipmentDetailQuery = `
  SELECT s.*, c.name AS customer_name, ci.name AS city_name, ci.code AS city_code,
         car.name AS carrier_name, r.name AS rider_name
  FROM shipments s
  JOIN customers c ON c.id = s.customer_id
  LEFT JOIN cities ci ON ci.id = s.city_id
  LEFT JOIN carriers car ON car.id = s.carrier_id
  LEFT JOIN riders r ON r.id = s.pickup_rider_id
`;

// Booking desk: create a shipment. daak_tracking_no is generated here, not
// client-supplied — DAAK-YYMMDD-XXXXX per plan.md section 3, assigned before
// any carrier is chosen (plan.md section 4.1: dual tracking numbers).
const bookingSchema = z.object({
  customer_id: z.number().int(),
  consignee_name: z.string().min(1),
  consignee_phone: z.string().optional().nullable(),
  consignee_address: z.string().optional().nullable(),
  city_id: z.number().int().optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  pieces: z.number().int().positive().default(1),
  declared_value: z.number().nonnegative().optional().nullable(),
  cod_amount: z.number().nonnegative().default(0),
  dc_amount: z.number().nonnegative().default(0),
  service_type: z.enum(["standard", "overnight"]).default("standard"),
  carrier_id: z.number().int().optional().nullable(),
});

shipmentsRouter.post(
  "/",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = bookingSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO shipments (
           id, daak_tracking_no, customer_id, consignee_name, consignee_phone, consignee_address,
           city_id, weight_kg, pieces, declared_value, cod_amount, dc_amount, service_type,
           carrier_id, booked_by
         )
         SELECT nextval(pg_get_serial_sequence('shipments','id')),
                'DAAK-' || to_char(now(), 'YYMMDD') || '-' || lpad(currval(pg_get_serial_sequence('shipments','id'))::text, 5, '0'),
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
         RETURNING id`,
        [
          body.customer_id, body.consignee_name, body.consignee_phone ?? null,
          body.consignee_address ?? null, body.city_id ?? null, body.weight_kg ?? null,
          body.pieces, body.declared_value ?? null, body.cod_amount, body.dc_amount,
          body.service_type, body.carrier_id ?? null, req.user!.id,
        ]
      );
      const shipmentId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO shipment_events (shipment_id, status, source, actor) VALUES ($1, 'BOOKED', 'manual', $2)`,
        [shipmentId, req.user!.name]
      );
      await client.query("COMMIT");
      void notifyStatusChange(shipmentId, "BOOKED");

      const { rows } = await pool.query(`${shipmentDetailQuery} WHERE s.id = $1`, [shipmentId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// Shipment board: filter by status, carrier, customer, city, date (plan.md section 2).
shipmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, carrier_id, customer_id, city_id, from, to, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 25);

    const conditions: string[] = [];
    const values: unknown[] = [];
    const addCond = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace("?", `$${values.length}`));
    };

    if (typeof status === "string") addCond("s.status = ?", status);
    if (typeof carrier_id === "string") addCond("s.carrier_id = ?", Number(carrier_id));
    if (typeof customer_id === "string") addCond("s.customer_id = ?", Number(customer_id));
    if (typeof city_id === "string") addCond("s.city_id = ?", Number(city_id));
    if (typeof from === "string") addCond("s.booked_at >= ?", from);
    if (typeof to === "string") addCond("s.booked_at <= ?", to);
    if (typeof search === "string" && search.trim()) {
      values.push(`%${search}%`);
      const p = `$${values.length}`;
      conditions.push(`(s.daak_tracking_no ILIKE ${p} OR s.carrier_tracking_no ILIKE ${p} OR s.consignee_name ILIKE ${p})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(pageSize, (page - 1) * pageSize);

    const { rows } = await pool.query(
      `${shipmentDetailQuery} ${where} ORDER BY s.booked_at DESC, s.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    const { rows: countRows } = await pool.query(
      `SELECT count(*) FROM shipments s ${where}`,
      values.slice(0, -2)
    );
    res.json({ data: rows, total: Number(countRows[0].count), page, pageSize });
  })
);

shipmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${shipmentDetailQuery} WHERE s.id = $1`, [req.params.id]);
    if (!rows[0]) {
      res.status(404).json({ error: "shipment not found" });
      return;
    }
    const events = await pool.query(
      "SELECT * FROM shipment_events WHERE shipment_id = $1 ORDER BY created_at, id",
      [req.params.id]
    );
    res.json({ ...rows[0], events: events.rows });
  })
);

const eventSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  return_reason: z.string().optional().nullable(),
});

// Manual status update. Never writes shipments.status directly — inserts a
// shipment_events row and lets the DB trigger derive current status, matching
// the append-only audit trail in plan.md section 4.3.
shipmentsRouter.post(
  "/:id/events",
  requireRole("admin", "ops", "cs"),
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    const shipmentId = Number(req.params.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO shipment_events (shipment_id, status, source, location, note, actor)
         VALUES ($1,$2,'manual',$3,$4,$5) RETURNING *`,
        [shipmentId, body.status, body.location ?? null, body.note ?? null, req.user!.name]
      );
      if (inserted.rowCount === 0) {
        throw new Error("failed to insert shipment event");
      }
      if (body.return_reason && (body.status === "RETURN_INITIATED" || body.status === "RETURNED")) {
        await client.query("UPDATE shipments SET return_reason = $1 WHERE id = $2", [
          body.return_reason, shipmentId,
        ]);
      }
      await client.query("COMMIT");
      void notifyStatusChange(shipmentId, body.status);
      const { rows } = await pool.query(`${shipmentDetailQuery} WHERE s.id = $1`, [shipmentId]);
      if (!rows[0]) {
        res.status(404).json({ error: "shipment not found" });
        return;
      }
      res.status(201).json(rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

const assignRiderSchema = z.object({ rider_id: z.number().int() });

// Ops assigns a rider for pickup (plan.md App 1: "Rider management:
// pickup runs"). This is what makes a shipment show up in that rider's
// Rider PWA pickup list.
shipmentsRouter.post(
  "/:id/assign-rider",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = assignRiderSchema.parse(req.body);
    const shipmentId = Number(req.params.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE shipments SET pickup_rider_id = $1 WHERE id = $2", [body.rider_id, shipmentId]);
      await client.query(
        `INSERT INTO shipment_events (shipment_id, status, source, actor) VALUES ($1, 'PICKUP_ASSIGNED', 'manual', $2)`,
        [shipmentId, req.user!.name]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    const { rows } = await pool.query(`${shipmentDetailQuery} WHERE s.id = $1`, [shipmentId]);
    if (!rows[0]) {
      res.status(404).json({ error: "shipment not found" });
      return;
    }
    res.json(rows[0]);
  })
);
