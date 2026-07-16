import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

// Read-only lookups (cities, carriers, riders) shared across booking desk,
// shipment board filters, and customer forms.
export const referenceRouter = Router();
referenceRouter.use(requireAuth);

referenceRouter.get(
  "/cities",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const { rows } = await pool.query(
      `SELECT id, name, code, zone FROM cities
       WHERE $1::text IS NULL OR name ILIKE $1 OR code ILIKE $1
       ORDER BY name LIMIT 100`,
      [search]
    );
    res.json(rows);
  })
);

referenceRouter.get(
  "/carriers",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, active FROM carriers WHERE active ORDER BY name"
    );
    res.json(rows);
  })
);

referenceRouter.get(
  "/riders",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, code FROM riders WHERE active ORDER BY name"
    );
    res.json(rows);
  })
);
