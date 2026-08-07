import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { notifyStatusChange } from "../notifications/service.js";
import {
  extractPdfPages,
  detectPdfKind,
  splitShopifyInvoices,
  airwayBillChunk,
} from "../ingestion/pdfExtract.js";
import { extractOrders, computeConfidence, type ExtractedOrder } from "../ingestion/extract.js";
import { checkDuplicate } from "../ingestion/duplicateCheck.js";

export const ingestionRouter = Router();
ingestionRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Upload a PDF (Shopify order-printer bundle or a carrier airway bill),
// extract every order in it, run the duplicate check, and stage the
// results for review — plan-order-ingestion.md Phase 0.5a. Nothing here
// touches `shipments` yet; that only happens on /commit.
ingestionRouter.post(
  "/batches",
  requireRole("admin", "ops", "cs"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required (multipart field 'file')" });
      return;
    }
    const customerId = req.body.customer_id ? Number(req.body.customer_id) : null;

    const batchInsert = await pool.query(
      `INSERT INTO ingestion_batches (customer_id, source, source_ref, uploaded_by, status)
       VALUES ($1, 'pdf_upload', $2, $3, 'processing') RETURNING id`,
      [customerId, req.file.originalname, req.user!.id]
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

      let errorCount = 0;
      const client = await pool.connect();
      try {
        for (const chunk of chunks) {
          let orders: ExtractedOrder[];
          try {
            orders = await extractOrders(chunk.text);
          } catch (err) {
            errorCount++;
            await client.query(
              `INSERT INTO ingestion_items (batch_id, raw_text, field_flags)
               VALUES ($1, $2, $3)`,
              [batchId, chunk.text, JSON.stringify({ extraction: err instanceof Error ? err.message : "extraction failed" })]
            );
            continue;
          }
          for (const order of orders) {
            if (order.source_order_ref === null && chunk.sourceOrderRef) {
              order.source_order_ref = chunk.sourceOrderRef;
            }
            const match = await checkDuplicate(client, customerId, order);
            const confidence = computeConfidence(order);
            await client.query(
              `INSERT INTO ingestion_items
                 (batch_id, raw_text, parsed_json, confidence_score, match_status, matched_shipment_id, field_flags)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                batchId,
                chunk.text,
                JSON.stringify(order),
                confidence,
                match.matchStatus,
                match.matchedShipmentId,
                JSON.stringify({ ...order.field_flags, ...(match.reason ? { _duplicate_check: match.reason } : {}) }),
              ]
            );
          }
        }
      } finally {
        client.release();
      }

      const itemCount = await pool.query(`SELECT count(*) FROM ingestion_items WHERE batch_id = $1`, [batchId]);
      await pool.query(
        `UPDATE ingestion_batches SET status = 'needs_review', item_count = $2, error_count = $3 WHERE id = $1`,
        [batchId, Number(itemCount.rows[0].count), errorCount]
      );

      const { rows } = await pool.query(`SELECT * FROM ingestion_batches WHERE id = $1`, [batchId]);
      res.status(201).json(rows[0]);
    } catch (err) {
      await pool.query(`UPDATE ingestion_batches SET status = 'failed' WHERE id = $1`, [batchId]);
      throw err;
    }
  })
);

ingestionRouter.get(
  "/batches",
  asyncHandler(async (req, res) => {
    const { status, customer_id } = req.query;
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (typeof status === "string") {
      values.push(status);
      conditions.push(`b.status = $${values.length}`);
    }
    if (typeof customer_id === "string") {
      values.push(Number(customer_id));
      conditions.push(`b.customer_id = $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT b.*, c.name AS customer_name
       FROM ingestion_batches b
       LEFT JOIN customers c ON c.id = b.customer_id
       ${where}
       ORDER BY b.uploaded_at DESC`,
      values
    );
    res.json(rows);
  })
);

ingestionRouter.get(
  "/batches/:id",
  asyncHandler(async (req, res) => {
    const batch = await pool.query(
      `SELECT b.*, c.name AS customer_name FROM ingestion_batches b
       LEFT JOIN customers c ON c.id = b.customer_id WHERE b.id = $1`,
      [req.params.id]
    );
    if (!batch.rows[0]) {
      res.status(404).json({ error: "batch not found" });
      return;
    }
    const items = await pool.query(
      `SELECT * FROM ingestion_items WHERE batch_id = $1 ORDER BY id`,
      [req.params.id]
    );
    res.json({ ...batch.rows[0], items: items.rows });
  })
);

const patchItemSchema = z.object({
  parsed_json: z.record(z.string(), z.unknown()),
});

// Inline edit of a staged item's parsed fields (Phase 0.5b's review screen
// calls this) — never touches shipments, purely staging-table state.
ingestionRouter.patch(
  "/items/:id",
  requireRole("admin", "ops", "cs"),
  asyncHandler(async (req, res) => {
    const body = patchItemSchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE ingestion_items SET parsed_json = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(body.parsed_json), req.params.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    res.json(rows[0]);
  })
);

interface StagedItem {
  id: number;
  customer_id: number | null;
  matched_shipment_id: number | null;
  committed_shipment_id: number | null;
  parsed_json: ExtractedOrder;
}

async function loadItem(itemId: number): Promise<StagedItem | undefined> {
  const { rows } = await pool.query(
    `SELECT i.*, b.customer_id FROM ingestion_items i
     JOIN ingestion_batches b ON b.id = i.batch_id WHERE i.id = $1`,
    [itemId]
  );
  return rows[0];
}

// Books a new shipment from a staged item's parsed fields (plan-order-
// ingestion.md section 6). The consignee is never a new customers row —
// it goes straight onto shipments.consignee_*; customer_id is the client
// (e.g. Canezo) who owns the batch. Throws on missing customer_id/name so
// callers can decide how to report the failure.
async function commitNewShipment(
  client: PoolClient,
  item: StagedItem,
  actorId: number,
  actorName: string,
  bulkNote: boolean
): Promise<number> {
  const order = item.parsed_json;
  if (!item.customer_id) {
    throw new Error("batch has no client customer_id set yet — assign the batch to a client before committing");
  }
  if (!order.consignee_name) {
    throw new Error("consignee_name is required to book a shipment — edit the item first");
  }

  let cityId: number | null = null;
  if (order.city) {
    const cityMatch = await client.query(`SELECT id FROM cities WHERE name ILIKE $1 LIMIT 1`, [order.city]);
    cityId = cityMatch.rows[0]?.id ?? null;
  }

  // No parsed weight from a Shopify/WhatsApp order — flat base_rate, same
  // as plan-order-ingestion.md's "Rs. 350/delivery flat" today.
  let dcAmount = 0;
  const rateCard = await client.query(
    `SELECT rc.* FROM customers c JOIN rate_cards rc ON rc.id = c.rate_card_id WHERE c.id = $1`,
    [item.customer_id]
  );
  if (rateCard.rows[0]) dcAmount = Number(rateCard.rows[0].base_rate);

  const inserted = await client.query(
    `INSERT INTO shipments (
       id, daak_tracking_no, customer_id, customer_order_ref, consignee_name, consignee_phone,
       consignee_address, city_id, cod_amount, dc_amount, carrier_tracking_no, booked_by
     )
     SELECT nextval(pg_get_serial_sequence('shipments','id')),
            'DAAK-' || to_char(now(), 'YYMMDD') || '-' || lpad(currval(pg_get_serial_sequence('shipments','id'))::text, 5, '0'),
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
     RETURNING id`,
    [
      item.customer_id, order.source_order_ref ?? null, order.consignee_name,
      order.consignee_phone ?? null, order.consignee_address ?? null, cityId,
      order.cod_amount ?? 0, dcAmount, order.carrier_tracking_no ?? null, actorId,
    ]
  );
  const shipmentId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO shipment_events (shipment_id, status, source, actor, note)
     VALUES ($1, 'BOOKED', 'manual', $2, $3)`,
    [shipmentId, actorName, bulkNote ? "booked via order-ingestion (bulk)" : "booked via order-ingestion"]
  );
  await client.query(
    `UPDATE ingestion_items SET committed_shipment_id = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3`,
    [shipmentId, actorId, item.id]
  );
  return shipmentId;
}

const commitSchema = z.object({
  // "new" books a fresh shipment. "merge" only valid when the item has a
  // matched_shipment_id (rule 2/3 from duplicateCheck.ts) — updates that
  // shipment's carrier fields instead of creating a second row. "skip"
  // leaves the item staged, uncommitted (used for confirmed duplicates).
  action: z.enum(["new", "merge", "skip"]).default("new"),
});

// Commit one staged item into the real shipments table.
ingestionRouter.post(
  "/items/:id/commit",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = commitSchema.parse(req.body);
    const item = await loadItem(Number(req.params.id));
    if (!item) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    if (item.committed_shipment_id) {
      res.status(400).json({ error: "already committed", shipment_id: item.committed_shipment_id });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (body.action === "skip") {
        await client.query(
          `UPDATE ingestion_items SET reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
          [req.user!.id, item.id]
        );
        await client.query("COMMIT");
        res.json({ skipped: true });
        return;
      }

      if (body.action === "merge") {
        if (!item.matched_shipment_id) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "no matched_shipment_id to merge into" });
          return;
        }
        await client.query(
          `UPDATE shipments SET carrier_tracking_no = COALESCE($1, carrier_tracking_no) WHERE id = $2`,
          [item.parsed_json.carrier_tracking_no ?? null, item.matched_shipment_id]
        );
        await client.query(
          `UPDATE ingestion_items SET committed_shipment_id = $1, reviewed_by = $2, reviewed_at = now() WHERE id = $3`,
          [item.matched_shipment_id, req.user!.id, item.id]
        );
        await client.query("COMMIT");
        const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [item.matched_shipment_id]);
        res.json({ merged: true, shipment: rows[0] });
        return;
      }

      const shipmentId = await commitNewShipment(client, item, req.user!.id, req.user!.name, false);
      await client.query("COMMIT");
      void notifyStatusChange(shipmentId, "BOOKED");

      const { rows } = await pool.query(`SELECT * FROM shipments WHERE id = $1`, [shipmentId]);
      res.status(201).json({ committed: true, shipment: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof Error && !("code" in err)) {
        // A plain Error thrown by commitNewShipment (missing customer_id /
        // consignee_name) is a 400, not a 500 — real DB errors (which have
        // a pg error `code`) still fall through to the error middleware.
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

// Bulk commit: every "new"-status item above a confidence threshold in one
// call — plan-order-ingestion.md section 6's "commit all high-confidence,
// review flagged only", since re-approving 20 clean rows to catch 2 flagged
// ones is how this feature gets ignored.
const bulkCommitSchema = z.object({
  min_confidence: z.number().min(0).max(1).default(0.8),
});

ingestionRouter.post(
  "/batches/:id/commit-high-confidence",
  requireRole("admin", "ops"),
  asyncHandler(async (req, res) => {
    const body = bulkCommitSchema.parse(req.body);
    const eligible = await pool.query(
      `SELECT id FROM ingestion_items
       WHERE batch_id = $1 AND match_status = 'new' AND confidence_score >= $2 AND committed_shipment_id IS NULL`,
      [req.params.id, body.min_confidence]
    );

    const results: { item_id: number; ok: boolean; error?: string }[] = [];
    for (const row of eligible.rows) {
      const item = await loadItem(row.id);
      if (!item) {
        results.push({ item_id: row.id, ok: false, error: "item vanished mid-run" });
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const shipmentId = await commitNewShipment(client, item, req.user!.id, req.user!.name, true);
        await client.query("COMMIT");
        void notifyStatusChange(shipmentId, "BOOKED");
        results.push({ item_id: row.id, ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        results.push({ item_id: row.id, ok: false, error: err instanceof Error ? err.message : "unknown error" });
      } finally {
        client.release();
      }
    }

    const remaining = await pool.query(
      `SELECT count(*) FROM ingestion_items WHERE batch_id = $1 AND committed_shipment_id IS NULL AND match_status != 'duplicate'`,
      [req.params.id]
    );
    if (Number(remaining.rows[0].count) === 0) {
      await pool.query(`UPDATE ingestion_batches SET status = 'committed' WHERE id = $1`, [req.params.id]);
    }

    res.json({ results });
  })
);
