import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type UserRole = "admin" | "ops" | "finance" | "cs";

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
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
