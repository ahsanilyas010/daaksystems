import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const cashHandoversRouter = Router();
cashHandoversRouter.use(requireAuth);

// List handovers — filterable by step and status
cashHandoversRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { step, status, limit = "50", offset = "0" } = req.query;
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (typeof step === "string") {
      values.push(step);
      conditions.push(`h.step = $${values.length}`);
    }
    if (typeof status === "string") {
      values.push(status);
      conditions.push(`h.status = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(Number(limit), Number(offset));

    const { rows } = await pool.query(
      `SELECT h.*,
              r.name  AS rider_name,
              d.name  AS dispatcher_name,
              c.name  AS customer_name,
              rb.name AS received_by_name,
              COUNT(hs.shipment_id) AS shipment_count
         FROM cash_handovers h
         LEFT JOIN riders    r  ON r.id  = h.rider_id
         LEFT JOIN users     d  ON d.id  = h.dispatcher_id
         LEFT JOIN customers c  ON c.id  = h.customer_id
         LEFT JOIN users     rb ON rb.id = h.received_by
         LEFT JOIN cash_handover_shipments hs ON hs.handover_id = h.id
         ${where}
         GROUP BY h.id, r.name, d.name, c.name, rb.name
         ORDER BY h.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    res.json(rows);
  })
);

// Get single handover with its shipments
cashHandoversRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.*,
              r.name  AS rider_name,
              d.name  AS dispatcher_name,
              c.name  AS customer_name,
              rb.name AS received_by_name
         FROM cash_handovers h
         LEFT JOIN riders    r  ON r.id  = h.rider_id
         LEFT JOIN users     d  ON d.id  = h.dispatcher_id
         LEFT JOIN customers c  ON c.id  = h.customer_id
         LEFT JOIN users     rb ON rb.id = h.received_by
         WHERE h.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "not found" }); return; }

    const { rows: shipments } = await pool.query(
      `SELECT hs.shipment_id, hs.cod_amount,
              s.daak_tracking_no, s.consignee_name, s.status
         FROM cash_handover_shipments hs
         JOIN shipments s ON s.id = hs.shipment_id
         WHERE hs.handover_id = $1`,
      [req.params.id]
    );
    res.json({ ...rows[0], shipments });
  })
);

// Create a new handover record
cashHandoversRouter.post(
  "/",
  requireRole("admin", "ops", "finance", "dispatcher"),
  asyncHandler(async (req, res) => {
    const { step, amount, rider_id, dispatcher_id, customer_id, notes, shipment_ids } = req.body as {
      step: string;
      amount: number;
      rider_id?: number;
      dispatcher_id?: number;
      customer_id?: number;
      notes?: string;
      shipment_ids?: number[];
    };

    if (!step || amount == null) {
      res.status(400).json({ error: "step and amount are required" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO cash_handovers (step, amount, rider_id, dispatcher_id, customer_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [step, amount, rider_id ?? null, dispatcher_id ?? null, customer_id ?? null, notes ?? null, req.user!.id]
      );
      const handover = rows[0];

      if (shipment_ids?.length) {
        // Fetch cod_amounts for the listed shipments
        const { rows: sRows } = await client.query(
          `SELECT id, cod_amount FROM shipments WHERE id = ANY($1)`,
          [shipment_ids]
        );
        for (const s of sRows) {
          await client.query(
            `INSERT INTO cash_handover_shipments (handover_id, shipment_id, cod_amount) VALUES ($1,$2,$3)`,
            [handover.id, s.id, s.cod_amount]
          );
        }
      }

      await client.query("COMMIT");
      res.status(201).json(handover);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// Confirm receipt of a handover
cashHandoversRouter.post(
  "/:id/confirm",
  requireRole("admin", "ops", "finance"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE cash_handovers
         SET status = 'confirmed', received_by = $1, confirmed_at = now()
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
      [req.user!.id, req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "not found or already confirmed" }); return; }
    res.json(rows[0]);
  })
);

// Mark a handover as disputed
cashHandoversRouter.post(
  "/:id/dispute",
  requireRole("admin", "ops", "finance"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE cash_handovers SET status = 'disputed' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "not found" }); return; }
    res.json(rows[0]);
  })
);
