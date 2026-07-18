import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const { rows } = await pool.query(
      `SELECT c.*, rc.name AS rate_card_name
       FROM customers c
       LEFT JOIN rate_cards rc ON rc.id = c.rate_card_id
       WHERE $1::text IS NULL OR c.name ILIKE $1
       ORDER BY c.name
       LIMIT 200`,
      [search]
    );
    res.json(rows);
  })
);

customersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
    if (!rows[0]) {
      res.status(404).json({ error: "customer not found" });
      return;
    }
    res.json(rows[0]);
  })
);

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  cnic: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  rate_card_id: z.number().int().optional().nullable(),
  cod_payout_method: z.enum(["bank", "jazzcash", "easypaisa", "cash"]).optional().nullable(),
  credit_limit: z.number().nonnegative().optional(),
});

customersRouter.post(
  "/",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = customerSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, email, cnic, address, rate_card_id, cod_payout_method, credit_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,0))
       RETURNING *`,
      [
        body.name, body.phone ?? null, body.email ?? null, body.cnic ?? null, body.address ?? null,
        body.rate_card_id ?? null, body.cod_payout_method ?? null, body.credit_limit ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

customersRouter.patch(
  "/:id",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = customerSchema.partial().parse(req.body);
    const fields = Object.keys(body);
    if (fields.length === 0) {
      res.status(400).json({ error: "no fields to update" });
      return;
    }
    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map((f) => (body as Record<string, unknown>)[f]);
    const { rows } = await pool.query(
      `UPDATE customers SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "customer not found" });
      return;
    }
    res.json(rows[0]);
  })
);
