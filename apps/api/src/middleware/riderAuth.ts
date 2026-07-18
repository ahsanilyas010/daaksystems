import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRider {
  kind: "rider";
  id: number;
  name: string;
  code: string;
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export function signRiderToken(rider: Omit<AuthedRider, "kind">): string {
  return jwt.sign({ ...rider, kind: "rider" }, JWT_SECRET, { expiresIn: "24h" });
}

export function requireRiderAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthedRider;
    // A staff JWT (middleware/auth.ts) has no `kind` field — reject it here
    // so a staff login can't be replayed against rider-only endpoints.
    if (payload.kind !== "rider") {
      res.status(401).json({ error: "not a rider token" });
      return;
    }
    req.rider = payload;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
