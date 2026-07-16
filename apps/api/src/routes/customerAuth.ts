import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { signCustomerToken } from "../middleware/customerAuth.js";

export const customerAuthRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

customerAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { rows } = await pool.query(
      "SELECT id, name, password_hash FROM customers WHERE email = $1",
      [email]
    );
    const row = rows[0];
    if (!row || !row.password_hash || !(await bcrypt.compare(password, row.password_hash))) {
      res.status(401).json({ error: "invalid email or password" });
      return;
    }
    const customer = { id: row.id, name: row.name };
    res.json({ token: signCustomerToken(customer), customer });
  })
);
