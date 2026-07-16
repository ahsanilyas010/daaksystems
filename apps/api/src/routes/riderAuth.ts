import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { signRiderToken } from "../middleware/riderAuth.js";

export const riderAuthRouter = Router();

const loginSchema = z.object({ phone: z.string().min(1), password: z.string().min(1) });

riderAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { phone, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query(
      "SELECT id, name, code, password_hash FROM riders WHERE phone = $1 AND active",
      [phone]
    );
    const row = rows[0];
    if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      res.status(401).json({ error: "invalid phone or password" });
      return;
    }
    const rider = { id: row.id, name: row.name, code: row.code };
    res.json({ token: signRiderToken(rider), rider });
  })
);
