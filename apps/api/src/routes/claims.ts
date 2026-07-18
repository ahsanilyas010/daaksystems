import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const claimsRouter = Router();
claimsRouter.use(requireAuth);

const claimListQuery = `
  SELECT cl.*, s.daak_tracking_no, s.status AS shipment_status, c.name AS customer_name
  FROM claims cl
  JOIN shipments s ON s.id = cl.shipment_id
  JOIN customers c ON c.id = s.customer_id
`;

claimsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const where = typeof status === "string" ? "WHERE cl.status = $1" : "";
    const { rows } = await pool.query(
      `${claimListQuery} ${where} ORDER BY cl.created_at DESC`,
      typeof status === "string" ? [status] : []
    );
    res.json(rows);
  })
);

const claimSchema = z.object({
  shipment_id: z.number().int(),
  claim_type: z.enum(["lost", "damaged"]),
  claimed_amount: z.number().nonnegative(),
  evidence_note: z.string().optional().nullable(),
});

// A claim can only be filed once the shipment itself is actually LOST or
// DAMAGED — this is a paper trail for a fact already established in the
// shipment_events audit trail, not a way to declare loss/damage itself.
claimsRouter.post(
  "/",
  requireRole("admin", "ops", "cs"),
  asyncHandler(async (req, res) => {
    const body = claimSchema.parse(req.body);
    const shipment = await pool.query("SELECT status FROM shipments WHERE id = $1", [body.shipment_id]);
    if (!shipment.rows[0]) {
      res.status(404).json({ error: "shipment not found" });
      return;
    }
    const expectedStatus = body.claim_type === "lost" ? "LOST" : "DAMAGED";
    if (shipment.rows[0].status !== expectedStatus) {
      res.status(400).json({
        error: `shipment status is ${shipment.rows[0].status}, expected ${expectedStatus} for a ${body.claim_type} claim`,
      });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO claims (shipment_id, claim_type, claimed_amount, evidence_note, filed_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [body.shipment_id, body.claim_type, body.claimed_amount, body.evidence_note ?? null, req.user!.name]
    );
    const created = await pool.query(`${claimListQuery} WHERE cl.id = $1`, [rows[0].id]);
    res.status(201).json(created.rows[0]);
  })
);

const statusSchema = z.object({
  status: z.enum(["open", "under_review", "approved", "rejected", "paid"]),
  resolution_note: z.string().optional().nullable(),
});
const RESOLVED_STATUSES = new Set(["approved", "rejected", "paid"]);

claimsRouter.patch(
  "/:id",
  requireRole("admin", "ops", "finance"),
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    await pool.query(
      `UPDATE claims SET status = $1, resolution_note = COALESCE($2, resolution_note),
              resolved_at = CASE WHEN $1 = ANY($3::claim_status[]) THEN now() ELSE resolved_at END
       WHERE id = $4`,
      [body.status, body.resolution_note ?? null, [...RESOLVED_STATUSES], req.params.id]
    );
    const { rows } = await pool.query(`${claimListQuery} WHERE cl.id = $1`, [req.params.id]);
    if (!rows[0]) {
      res.status(404).json({ error: "claim not found" });
      return;
    }
    res.json(rows[0]);
  })
);
