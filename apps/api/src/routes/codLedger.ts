import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

// SOP-06 (plan.md section 5): carrier remittance reconciled shipment-by-shipment,
// never lump-sum accepted. Sender payouts only for DELIVERED + carrier_in received.
export const codLedgerRouter = Router();
codLedgerRouter.use(requireAuth);

codLedgerRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { shipment_id, customer_id, direction, status } = req.query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const addCond = (clause: string, value: unknown) => {
      values.push(value);
      conditions.push(clause.replace("?", `$${values.length}`));
    };
    if (typeof shipment_id === "string") addCond("l.shipment_id = ?", Number(shipment_id));
    if (typeof customer_id === "string") addCond("s.customer_id = ?", Number(customer_id));
    if (typeof direction === "string") addCond("l.direction = ?", direction);
    if (typeof status === "string") addCond("l.status = ?", status);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT l.*, s.daak_tracking_no, s.cod_amount AS shipment_cod_amount, s.customer_id, c.name AS customer_name
       FROM cod_ledger l
       JOIN shipments s ON s.id = l.shipment_id
       JOIN customers c ON c.id = s.customer_id
       ${where}
       ORDER BY l.created_at DESC LIMIT 200`,
      values
    );
    res.json(rows);
  })
);

// Carrier-in: record that DAAK actually received COD cash from a carrier for
// a delivered shipment. Variance vs. the shipment's declared cod_amount is
// computed here, not stored as a separate status, so the schema stays simple.
codLedgerRouter.get(
  "/disputes",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT l.*, s.daak_tracking_no, s.cod_amount AS shipment_cod_amount,
              (l.amount - s.cod_amount) AS variance, c.name AS customer_name
       FROM cod_ledger l
       JOIN shipments s ON s.id = l.shipment_id
       JOIN customers c ON c.id = s.customer_id
       WHERE l.direction = 'carrier_in' AND l.amount <> s.cod_amount
       ORDER BY l.created_at DESC`
    );
    res.json(rows);
  })
);

const carrierInSchema = z.object({
  shipment_id: z.number().int(),
  amount: z.number(),
  method: z.string().optional().nullable(),
  reference_no: z.string().optional().nullable(),
});

codLedgerRouter.post(
  "/carrier-in",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const body = carrierInSchema.parse(req.body);
    const shipment = await pool.query("SELECT status, cod_amount FROM shipments WHERE id = $1", [
      body.shipment_id,
    ]);
    if (!shipment.rows[0]) {
      res.status(404).json({ error: "shipment not found" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO cod_ledger (shipment_id, direction, amount, method, reference_no, status)
       VALUES ($1, 'carrier_in', $2, $3, $4, 'received') RETURNING *`,
      [body.shipment_id, body.amount, body.method ?? null, body.reference_no ?? null]
    );
    res.status(201).json(rows[0]);
  })
);

// Compute which of a customer's DELIVERED shipments are eligible for payout:
// carrier_in received with NO variance (SOP-06: a disputed remittance must
// be resolved before payout, never silently passed through), and no
// sender_out entry created yet.
async function eligibleForPayout(customerId: number) {
  const { rows } = await pool.query(
    `SELECT s.id AS shipment_id, s.daak_tracking_no, s.cod_amount, s.dc_amount,
            (s.cod_amount - s.dc_amount) AS payable_amount, ci.amount AS carrier_in_amount, ci.id AS carrier_in_id
     FROM shipments s
     JOIN cod_ledger ci ON ci.shipment_id = s.id AND ci.direction = 'carrier_in' AND ci.status = 'received'
     WHERE s.customer_id = $1
       AND s.status = 'DELIVERED'
       AND ci.amount = s.cod_amount
       AND NOT EXISTS (
         SELECT 1 FROM cod_ledger so WHERE so.shipment_id = s.id AND so.direction = 'sender_out'
       )
     ORDER BY s.delivered_at`,
    [customerId]
  );
  return rows;
}

codLedgerRouter.get(
  "/payout-preview/:customerId",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const rows = await eligibleForPayout(Number(req.params.customerId));
    const total = rows.reduce((sum, r) => sum + Number(r.payable_amount), 0);
    res.json({ shipments: rows, total, count: rows.length });
  })
);

const payoutSchema = z.object({
  customer_id: z.number().int(),
  method: z.string().optional().nullable(),
  reference_no: z.string().optional().nullable(),
});

codLedgerRouter.post(
  "/payout-batches",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const body = payoutSchema.parse(req.body);
    const eligible = await eligibleForPayout(body.customer_id);
    if (eligible.length === 0) {
      res.status(400).json({ error: "no eligible shipments for payout" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = [];
      for (const row of eligible) {
        const { rows } = await client.query(
          `INSERT INTO cod_ledger (shipment_id, direction, amount, method, reference_no, reconciled_against, status)
           VALUES ($1, 'sender_out', $2, $3, $4, $5, 'pending') RETURNING *`,
          [row.shipment_id, row.payable_amount, body.method ?? null, body.reference_no ?? null, row.carrier_in_id]
        );
        created.push(rows[0]);
      }
      await client.query("COMMIT");
      res.status(201).json({ entries: created, total: eligible.reduce((s, r) => s + Number(r.payable_amount), 0) });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

codLedgerRouter.post(
  "/:id/mark-paid",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "UPDATE cod_ledger SET status = 'paid' WHERE id = $1 AND direction = 'sender_out' RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "sender_out ledger entry not found" });
      return;
    }
    res.json(rows[0]);
  })
);
