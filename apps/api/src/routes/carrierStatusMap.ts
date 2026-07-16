import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const SHIPMENT_STATUSES = [
  "BOOKED", "PICKUP_ASSIGNED", "PICKED", "HANDED_TO_CARRIER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RETURNED", "LOST",
  "DAMAGED", "CANCELLED",
] as const;

export const carrierStatusMapRouter = Router();
carrierStatusMapRouter.use(requireAuth);

carrierStatusMapRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { carrier_id } = req.query;
    if (typeof carrier_id === "string") {
      const { rows } = await pool.query(
        `SELECT m.*, c.name AS carrier_name FROM carrier_status_map m
         JOIN carriers c ON c.id = m.carrier_id WHERE m.carrier_id = $1 ORDER BY m.carrier_status`,
        [Number(carrier_id)]
      );
      res.json(rows);
      return;
    }
    const { rows } = await pool.query(
      `SELECT m.*, c.name AS carrier_name FROM carrier_status_map m
       JOIN carriers c ON c.id = m.carrier_id ORDER BY c.name, m.carrier_status`
    );
    res.json(rows);
  })
);

const mapSchema = z.object({
  carrier_id: z.number().int(),
  carrier_status: z.string().min(1),
  mapped_status: z.enum(SHIPMENT_STATUSES),
});

carrierStatusMapRouter.post(
  "/",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = mapSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO carrier_status_map (carrier_id, carrier_status, mapped_status)
       VALUES ($1,$2,$3)
       ON CONFLICT (carrier_id, carrier_status) DO UPDATE SET mapped_status = EXCLUDED.mapped_status
       RETURNING *`,
      [body.carrier_id, body.carrier_status, body.mapped_status]
    );
    res.status(201).json(rows[0]);
  })
);

carrierStatusMapRouter.delete(
  "/:id",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    await pool.query("DELETE FROM carrier_status_map WHERE id = $1", [req.params.id]);
    res.status(204).end();
  })
);
