import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth.js";
import { carrierInvoicesRouter } from "./routes/carrierInvoices.js";
import { carrierStatusMapRouter } from "./routes/carrierStatusMap.js";
import { carrierWebhooksRouter } from "./routes/carrierWebhooks.js";
import { claimsRouter } from "./routes/claims.js";
import { codLedgerRouter } from "./routes/codLedger.js";
import { customerAppRouter } from "./routes/customerApp.js";
import { customerAuthRouter } from "./routes/customerAuth.js";
import { customersRouter } from "./routes/customers.js";
import { exceptionsRouter } from "./routes/exceptions.js";
import { rateCardsRouter } from "./routes/rateCards.js";
import { referenceRouter } from "./routes/reference.js";
import { reportsRouter } from "./routes/reports.js";
import { riderAppRouter } from "./routes/riderApp.js";
import { riderAuthRouter } from "./routes/riderAuth.js";
import { riderRunsRouter } from "./routes/riderRuns.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { trackingRouter } from "./routes/tracking.js";

export const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
// Rider PWA uploads photo/signature as base64 data URIs — default 100kb is too small.
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/customers", customersRouter);
app.use("/rate-cards", rateCardsRouter);
app.use("/reference", referenceRouter);
app.use("/shipments", shipmentsRouter);
app.use("/cod-ledger", codLedgerRouter);
app.use("/rider-runs", riderRunsRouter);
app.use("/reports", reportsRouter);
app.use("/exceptions", exceptionsRouter);
app.use("/claims", claimsRouter);
app.use("/carrier-status-map", carrierStatusMapRouter);
app.use("/carrier-invoices", carrierInvoicesRouter);
app.use("/rider-auth", riderAuthRouter);
app.use("/rider-app", riderAppRouter);
app.use("/customer-auth", customerAuthRouter);
app.use("/customer-app", customerAppRouter);
app.use("/track", trackingRouter); // public, no auth
app.use("/webhooks/carriers", carrierWebhooksRouter); // public, shared-secret auth

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation failed", issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
};
app.use(errorHandler);
