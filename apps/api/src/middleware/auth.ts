import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type UserRole = "admin" | "ops" | "finance" | "cs" | "dispatcher";

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  // Set only for role: "dispatcher" — every other role sees every city.
  // A dispatcher is scoped to exactly one (plan-order-ingestion.md
  // section 10, refined: dispatch is per-city work, not one shift
  // covering the whole operation).
  cityId: number | null;
}

const JWT_SECRET: string = process.env.JWT_SECRET ?? "dev-secret";

export function signToken(user: AuthedUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

// Auth disabled — all requests pass as admin.
const BYPASS_USER: AuthedUser = { id: 1, email: "admin@daak.pk", name: "Admin", role: "admin" };

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = BYPASS_USER;
  next();
}

export function requireRole(..._roles: UserRole[]) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next();
  };
}

// True when the request should be filtered/blocked to a single city — only
// role: "dispatcher" is city-scoped; every other role sees everything, same
// as before this role existed.
export function isCityScoped(user: AuthedUser): user is AuthedUser & { cityId: number } {
  return user.role === "dispatcher" && user.cityId !== null;
}

// City isn't known until after the row is fetched (e.g. GET /shipments/:id),
// so this is a plain check called inline from the route handler rather than
// route-registration-time middleware. A dispatcher hitting a shipment
// outside their city gets a 403, not a filtered-out 404 — it does exist,
// they just aren't allowed at it.
export function checkOwnCity(res: Response, user: AuthedUser, shipmentCityId: number | null): boolean {
  if (!isCityScoped(user) || shipmentCityId === user.cityId) return true;
  res.status(403).json({ error: "outside your assigned city" });
  return false;
}
