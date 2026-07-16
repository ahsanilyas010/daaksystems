import { Router } from "express";
import { applyCarrierStatusUpdate } from "../carriers/apply.js";
import { getCarrierAdapter } from "../carriers/registry.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import type { CarrierStatusUpdate } from "../carriers/types.js";

// Public — carriers push here directly, no Daak staff session involved.
// Protected by a shared secret instead of JWT auth (set CARRIER_WEBHOOK_SECRET
// once a real carrier gives you one to configure on their end).
export const carrierWebhooksRouter = Router();

function genericParse(payload: unknown): CarrierStatusUpdate[] {
  const body = payload as { tracking_no?: string; status?: string; location?: string };
  if (!body.tracking_no || !body.status) return [];
  return [{ carrierTrackingNo: body.tracking_no, carrierStatus: body.status, location: body.location }];
}

carrierWebhooksRouter.post(
  "/:carrierName",
  asyncHandler(async (req, res) => {
    const secret = process.env.CARRIER_WEBHOOK_SECRET;
    if (secret && req.headers["x-webhook-secret"] !== secret) {
      res.status(401).json({ error: "invalid webhook secret" });
      return;
    }
    if (!secret) {
      console.warn("CARRIER_WEBHOOK_SECRET is not set — carrier webhook endpoint is unauthenticated");
    }

    const carrierName = req.params.carrierName;
    const carrier = await pool.query("SELECT id FROM carriers WHERE name = $1", [carrierName]);
    if (!carrier.rows[0]) {
      res.status(404).json({ error: `unknown carrier: ${carrierName}` });
      return;
    }
    const carrierId = carrier.rows[0].id as number;

    const adapter = getCarrierAdapter(carrierName);
    const updates = adapter?.parseWebhook ? adapter.parseWebhook(req.body) : genericParse(req.body);

    const results = [];
    for (const update of updates) {
      results.push(await applyCarrierStatusUpdate(carrierId, update));
    }
    res.json({ processed: results.length, results });
  })
);
