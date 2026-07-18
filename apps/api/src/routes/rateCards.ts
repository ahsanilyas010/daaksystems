import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const rateCardsRouter = Router();
rateCardsRouter.use(requireAuth);

rateCardsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query("SELECT * FROM rate_cards ORDER BY name");
    res.json(rows);
  })
);

const rateCardSchema = z.object({
  name: z.string().min(1),
  base_weight_kg: z.number().positive().default(1),
  base_rate: z.number().nonnegative(),
  per_kg_increment: z.number().nonnegative(),
  cod_fee_pct: z.number().min(0).max(100).default(0),
  fuel_surcharge_pct: z.number().min(0).max(100).default(0),
  city_zone_overrides: z.record(z.unknown()).default({}),
});

rateCardsRouter.post(
  "/",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = rateCardSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO rate_cards (name, base_weight_kg, base_rate, per_kg_increment, cod_fee_pct, fuel_surcharge_pct, city_zone_overrides)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        body.name, body.base_weight_kg, body.base_rate, body.per_kg_increment,
        body.cod_fee_pct, body.fuel_surcharge_pct, JSON.stringify(body.city_zone_overrides),
      ]
    );
    res.status(201).json(rows[0]);
  })
);
