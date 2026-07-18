import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthedCustomer {
  kind: "customer";
  id: number;
  name: string;
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export function signCustomerToken(customer: Omit<AuthedCustomer, "kind">): string {
  return jwt.sign({ ...customer, kind: "customer" }, JWT_SECRET, { expiresIn: "24h" });
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthedCustomer;
    if (payload.kind !== "customer") {
      res.status(401).json({ error: "not a customer token" });
      return;
    }
    req.customer = payload;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
