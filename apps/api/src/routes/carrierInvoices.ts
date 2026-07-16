import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const carrierInvoicesRouter = Router();
carrierInvoicesRouter.use(requireAuth);

const invoiceListQuery = `
  SELECT i.id, i.invoice_no, i.carrier_id, c.name AS carrier_name,
         lower(i.period) AS period_start, upper(i.period) - 1 AS period_end,
         i.claimed_amount, i.computed_amount, i.variance, i.status, i.file_url, i.created_at
  FROM carrier_invoices i JOIN carriers c ON c.id = i.carrier_id
`;

carrierInvoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { carrier_id, status } = req.query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (typeof carrier_id === "string") {
      values.push(Number(carrier_id));
      conditions.push(`i.carrier_id = $${values.length}`);
    }
    if (typeof status === "string") {
      values.push(status);
      conditions.push(`i.status = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`${invoiceListQuery} ${where} ORDER BY i.created_at DESC`, values);
    res.json(rows);
  })
);

const invoiceSchema = z.object({
  carrier_id: z.number().int(),
  invoice_no: z.string().min(1),
  period_start: z.string(),
  period_end: z.string(),
  claimed_amount: z.number(),
  file_url: z.string().optional().nullable(),
});

// computed_amount is derived from our own ledger (sum of carrier_cost for
// that carrier's shipments booked within the invoice period) — the carrier's
// claim is checked against what we independently expect to owe, never
// trusted at face value (plan.md Phase 3: "Carrier invoice reconciliation").
carrierInvoicesRouter.post(
  "/",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const body = invoiceSchema.parse(req.body);
    const computed = await pool.query(
      `SELECT COALESCE(SUM(carrier_cost), 0) AS total
       FROM shipments WHERE carrier_id = $1 AND booked_at::date BETWEEN $2 AND $3`,
      [body.carrier_id, body.period_start, body.period_end]
    );
    const { rows } = await pool.query(
      `INSERT INTO carrier_invoices (carrier_id, invoice_no, period, claimed_amount, computed_amount, file_url)
       VALUES ($1, $2, daterange($3, $4, '[]'), $5, $6, $7)
       RETURNING id`,
      [
        body.carrier_id, body.invoice_no, body.period_start, body.period_end,
        body.claimed_amount, computed.rows[0].total, body.file_url ?? null,
      ]
    );
    const created = await pool.query(`${invoiceListQuery} WHERE i.id = $1`, [rows[0].id]);
    res.status(201).json(created.rows[0]);
  })
);

const statusSchema = z.object({ status: z.enum(["open", "matched", "disputed", "paid"]) });

carrierInvoicesRouter.patch(
  "/:id",
  requireRole("admin", "finance"),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    await pool.query("UPDATE carrier_invoices SET status = $1 WHERE id = $2", [body.status, req.params.id]);
    const { rows } = await pool.query(`${invoiceListQuery} WHERE i.id = $1`, [req.params.id]);
    if (!rows[0]) {
      res.status(404).json({ error: "invoice not found" });
      return;
    }
    res.json(rows[0]);
  })
);
