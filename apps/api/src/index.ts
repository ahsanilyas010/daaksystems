import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth.js";
import { customersRouter } from "./routes/customers.js";
import { rateCardsRouter } from "./routes/rateCards.js";
import { referenceRouter } from "./routes/reference.js";
import { shipmentsRouter } from "./routes/shipments.js";
import { trackingRouter } from "./routes/tracking.js";

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/customers", customersRouter);
app.use("/rate-cards", rateCardsRouter);
app.use("/reference", referenceRouter);
app.use("/shipments", shipmentsRouter);
app.use("/track", trackingRouter); // public, no auth

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation failed", issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
};
app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`daak api listening on :${port}`);
});
