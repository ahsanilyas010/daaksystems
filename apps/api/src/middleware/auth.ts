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

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export function signToken(user: AuthedUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthedUser;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}

// CS is read-only + ticket actions per plan.md section 2 — this MVP doesn't
// have a ticket system yet, so CS is treated as read-only everywhere a role
// check is applied. Broaden this once tickets exist.
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "insufficient role" });
      return;
    }
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
