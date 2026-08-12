import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireCustomerAuth } from "../middleware/customerAuth.js";
import { notifyStatusChange } from "../notifications/service.js";
import { extractPdfPages, detectPdfKind, splitShopifyInvoices, airwayBillChunk } from "../ingestion/pdfExtract.js";
import { extractOrders, extractOrdersFromText } from "../ingestion/extract.js";
import { processChunks, finalizeBatch } from "./ingestion.js";

// Customer Portal API surface (plan.md App 3), everything scoped to
// req.customer.id — a sender only ever sees their own shipments and wallet.
export const customerAppRouter = Router();
customerAppRouter.use(requireCustomerAuth);

customerAppRouter.get(
  "/cities",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? `%${req.query.search}%` : null;
    const { rows } = await pool.query(
      `SELECT id, name, code FROM cities
       WHERE $1::text IS NULL OR name ILIKE $1 OR code ILIKE $1
       ORDER BY name LIMIT 50`,
      [search]
    );
    res.json(rows);
  })
);

const shipmentSummary = `
  s.id, s.daak_tracking_no, s.consignee_name, s.consignee_phone, s.city_id,
  s.cod_amount, s.dc_amount, s.weight_kg, s.pieces, s.status, s.booked_at,
  s.return_reason, ci.name AS city_name, car.name AS carrier_name
`;

customerAppRouter.get(
  "/shipments",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const conditions = ["s.customer_id = $1"];
    const values: unknown[] = [req.customer!.id];
    if (typeof status === "string") {
      values.push(status);
      conditions.push(`s.status = $${values.length}`);
    }
    const { rows } = await pool.query(
      `SELECT ${shipmentSummary} FROM shipments s
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN carriers car ON car.id = s.carrier_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY s.booked_at DESC LIMIT 200`,
      values
    );
    res.json(rows);
  })
);

const bookingSchema = z.object({
  consignee_name: z.string().min(1),
  consignee_phone: z.string().optional().nullable(),
  consignee_address: z.string().optional().nullable(),
  city_id: z.number().int().optional().nullable(),
  weight_kg: z.number().positive().optional().nullable(),
  pieces: z.number().int().positive().default(1),
  cod_amount: z.number().nonnegative().default(0),
  dc_amount: z.number().nonnegative().default(0),
  service_type: z.enum(["standard", "overnight"]).default("standard"),
});

async function createShipment(customerId: number, body: z.infer<typeof bookingSchema>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO shipments (
         id, daak_tracking_no, customer_id, consignee_name, consignee_phone, consignee_address,
         city_id, weight_kg, pieces, cod_amount, dc_amount, service_type
       )
       SELECT nextval(pg_get_serial_sequence('shipments','id')),
              'DAAK-' || to_char(now(), 'YYMMDD') || '-' || lpad(currval(pg_get_serial_sequence('shipments','id'))::text, 5, '0'),
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       RETURNING id, daak_tracking_no`,
      [
        customerId, body.consignee_name, body.consignee_phone ?? null, body.consignee_address ?? null,
        body.city_id ?? null, body.weight_kg ?? null, body.pieces, body.cod_amount, body.dc_amount,
        body.service_type,
      ]
    );
    const shipmentId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO shipment_events (shipment_id, status, source, actor) VALUES ($1, 'BOOKED', 'manual', 'customer portal')`,
      [shipmentId]
    );
    await client.query("COMMIT");
    void notifyStatusChange(shipmentId, "BOOKED");
    return inserted.rows[0] as { id: number; daak_tracking_no: string };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

customerAppRouter.post(
  "/shipments",
  asyncHandler(async (req, res) => {
    const body = bookingSchema.parse(req.body);
    const shipment = await createShipment(req.customer!.id, body);
    res.status(201).json(shipment);
  })
);

// Bulk booking: the browser parses the sender's CSV and posts an array of
// rows here — simpler and more transparent to the sender than a server-side
// file upload, and avoids a multipart-parsing dependency for an MVP.
const bulkSchema = z.object({ rows: z.array(bookingSchema).min(1).max(500) });

customerAppRouter.post(
  "/shipments/bulk",
  asyncHandler(async (req, res) => {
    const body = bulkSchema.parse(req.body);
    const results: Array<{ ok: true; daak_tracking_no: string } | { ok: false; error: string }> = [];
    for (const row of body.rows) {
      try {
        const shipment = await createShipment(req.customer!.id, row);
        results.push({ ok: true, daak_tracking_no: shipment.daak_tracking_no });
      } catch (err) {
        results.push({ ok: false, error: err instanceof Error ? err.message : "failed to book row" });
      }
    }
    res.status(201).json({ results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  })
);

// COD wallet (plan.md App 3): pending = carrier hasn't remitted yet;
// cleared = Daak has the cash but hasn't paid the sender out yet;
// paid_out = sender_out ledger entries already paid. Mirrors the Phase 2
// cod_ledger model directly rather than tracking a separate wallet balance.
customerAppRouter.get(
  "/wallet",
  asyncHandler(async (req, res) => {
    const customerId = req.customer!.id;
    const pending = await pool.query(
      `SELECT COALESCE(SUM(s.cod_amount - s.dc_amount), 0) AS total, count(*) AS count
       FROM shipments s
       WHERE s.customer_id = $1 AND s.status = 'DELIVERED'
         AND NOT EXISTS (SELECT 1 FROM cod_ledger l WHERE l.shipment_id = s.id AND l.direction = 'carrier_in' AND l.status = 'received')`,
      [customerId]
    );
    const cleared = await pool.query(
      `SELECT COALESCE(SUM(s.cod_amount - s.dc_amount), 0) AS total, count(*) AS count
       FROM shipments s
       JOIN cod_ledger ci ON ci.shipment_id = s.id AND ci.direction = 'carrier_in' AND ci.status = 'received'
       WHERE s.customer_id = $1
         AND NOT EXISTS (SELECT 1 FROM cod_ledger so WHERE so.shipment_id = s.id AND so.direction = 'sender_out')`,
      [customerId]
    );
    const paidOut = await pool.query(
      `SELECT COALESCE(SUM(l.amount), 0) AS total, count(*) AS count
       FROM cod_ledger l JOIN shipments s ON s.id = l.shipment_id
       WHERE s.customer_id = $1 AND l.direction = 'sender_out' AND l.status = 'paid'`,
      [customerId]
    );
    res.json({
      pending: { total: Number(pending.rows[0].total), count: Number(pending.rows[0].count) },
      cleared: { total: Number(cleared.rows[0].total), count: Number(cleared.rows[0].count) },
      paid_out: { total: Number(paidOut.rows[0].total), count: Number(paidOut.rows[0].count) },
    });
  })
);

customerAppRouter.get(
  "/wallet/statement",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.direction, l.amount, l.method, l.status, l.created_at, s.daak_tracking_no
       FROM cod_ledger l JOIN shipments s ON s.id = l.shipment_id
       WHERE s.customer_id = $1
       ORDER BY l.created_at DESC LIMIT 500`,
      [req.customer!.id]
    );
    res.json(rows);
  })
);

customerAppRouter.get(
  "/returns",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${shipmentSummary} FROM shipments s
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN carriers car ON car.id = s.carrier_id
       WHERE s.customer_id = $1 AND s.status IN ('RETURN_INITIATED', 'RETURNED')
       ORDER BY s.booked_at DESC`,
      [req.customer!.id]
    );
    res.json(rows);
  })
);

customerAppRouter.post(
  "/shipments/:id/request-reattempt",
  asyncHandler(async (req, res) => {
    const shipment = await pool.query(
      "SELECT id, status FROM shipments WHERE id = $1 AND customer_id = $2",
      [req.params.id, req.customer!.id]
    );
    if (!shipment.rows[0]) {
      res.status(404).json({ error: "shipment not found" });
      return;
    }
    // Re-asserts the current status (a no-op transition) purely to log the
    // request in the event trail — re-attempt isn't a distinct state in the
    // locked shipment_status enum, it's an ops action ops sees and actions.
    await pool.query(
      `INSERT INTO shipment_events (shipment_id, status, source, actor, note)
       VALUES ($1, $2, 'manual', 'customer portal', 'Sender requested a re-delivery attempt')`,
      [shipment.rows[0].id, shipment.rows[0].status]
    );
    res.status(201).json({ ok: true });
  })
);

customerAppRouter.get(
  "/rate-calculator",
  asyncHandler(async (req, res) => {
    const weightKg = Number(req.query.weight_kg);
    if (!weightKg || weightKg <= 0) {
      res.status(400).json({ error: "weight_kg is required" });
      return;
    }
    const customer = await pool.query(
      `SELECT rc.* FROM customers c JOIN rate_cards rc ON rc.id = c.rate_card_id WHERE c.id = $1`,
      [req.customer!.id]
    );
    if (!customer.rows[0]) {
      res.status(404).json({ error: "no rate card assigned to your account yet — contact Daak" });
      return;
    }
    const rc = customer.rows[0];
    const baseWeight = Number(rc.base_weight_kg);
    const extraKg = Math.max(0, weightKg - baseWeight);
    const base = Number(rc.base_rate) + extraKg * Number(rc.per_kg_increment);
    const fuelSurcharge = base * (Number(rc.fuel_surcharge_pct) / 100);
    const codFee = req.query.cod_amount
      ? Number(req.query.cod_amount) * (Number(rc.cod_fee_pct) / 100)
      : 0;
    res.json({
      rate_card: rc.name,
      base_charge: base,
      fuel_surcharge: fuelSurcharge,
      cod_fee: codFee,
      estimated_total: base + fuelSurcharge + codFee,
    });
  })
);

// Self-serve order upload (plan-order-ingestion.md section 10: a sender
// can upload a PDF or paste order text and see it land in review — same
// extraction pipeline the ops desk uses in ingestion.ts, just always
// scoped to req.customer.id and with no edit/commit/merge surface. A
// client only ever gets to stage orders; ops still reviews and books them.
const ingestionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

customerAppRouter.post(
  "/ingestion/batches",
  ingestionUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required (multipart field 'file')" });
      return;
    }
    const customerId = req.customer!.id;

    const batchInsert = await pool.query(
      `INSERT INTO ingestion_batches (customer_id, source, source_ref, status)
       VALUES ($1, 'pdf_upload', $2, 'processing') RETURNING id`,
      [customerId, req.file.originalname]
    );
    const batchId = batchInsert.rows[0].id;

    try {
      const pages = await extractPdfPages(req.file.buffer);
      const kind = detectPdfKind(pages);
      const chunks = kind === "shopify_bundle" ? splitShopifyInvoices(pages) : airwayBillChunk(pages);

      if (chunks.length === 0) {
        await pool.query(
          `UPDATE ingestion_batches SET status = 'failed', error_count = 1 WHERE id = $1`,
          [batchId]
        );
        res.status(422).json({ error: "no orders found in this PDF", batch_id: batchId });
        return;
      }

      const errorCount = await processChunks(
        batchId,
        customerId,
        chunks.map((c) => ({ sourceOrderRef: c.sourceOrderRef, text: c.text, extract: () => extractOrders(c.text) }))
      );
      await finalizeBatch(batchId, errorCount);

      const { rows } = await pool.query(`SELECT * FROM ingestion_batches WHERE id = $1`, [batchId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      await pool.query(`UPDATE ingestion_batches SET status = 'failed' WHERE id = $1`, [batchId]);
      throw err;
    }
  })
);

const textBatchSchema = z.object({ text: z.string().min(1) });

customerAppRouter.post(
  "/ingestion/batches/text",
  asyncHandler(async (req, res) => {
    const body = textBatchSchema.parse(req.body);
    const customerId = req.customer!.id;

    const batchInsert = await pool.query(
      `INSERT INTO ingestion_batches (customer_id, source, source_ref, status)
       VALUES ($1, 'whatsapp', 'pasted text', 'processing') RETURNING id`,
      [customerId]
    );
    const batchId = batchInsert.rows[0].id;

    try {
      const errorCount = await processChunks(batchId, customerId, [
        { sourceOrderRef: "", text: body.text, extract: () => extractOrdersFromText(body.text) },
      ]);
      await finalizeBatch(batchId, errorCount);
      const { rows } = await pool.query(`SELECT * FROM ingestion_batches WHERE id = $1`, [batchId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      await pool.query(`UPDATE ingestion_batches SET status = 'failed' WHERE id = $1`, [batchId]);
      throw err;
    }
  })
);

customerAppRouter.get(
  "/ingestion/batches",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM ingestion_batches WHERE customer_id = $1 ORDER BY uploaded_at DESC`,
      [req.customer!.id]
    );
    res.json(rows);
  })
);

// Read-only detail — no parsed_json editing surface for the client, and
// items only ever show which of their own orders matched/committed.
customerAppRouter.get(
  "/ingestion/batches/:id",
  asyncHandler(async (req, res) => {
    const batch = await pool.query(
      `SELECT * FROM ingestion_batches WHERE id = $1 AND customer_id = $2`,
      [req.params.id, req.customer!.id]
    );
    if (!batch.rows[0]) {
      res.status(404).json({ error: "batch not found" });
      return;
    }
    const items = await pool.query(`SELECT * FROM ingestion_items WHERE batch_id = $1 ORDER BY id`, [req.params.id]);
    res.json({ ...batch.rows[0], items: items.rows });
  })
);
