import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthedRider {
  kind: "rider";
  id: number;
  name: string;
  code: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET ?? "dev-secret";

export function signRiderToken(rider: Omit<AuthedRider, "kind">): string {
  return jwt.sign({ ...rider, kind: "rider" }, JWT_SECRET, { expiresIn: "24h" });
}

// Auth disabled — all requests pass as the first rider.
const BYPASS_RIDER: AuthedRider = { kind: "rider", id: 1, name: "WAL", code: "WAL" };

export function requireRiderAuth(req: Request, _res: Response, next: NextFunction) {
  req.rider = BYPASS_RIDER;
  next();
}
