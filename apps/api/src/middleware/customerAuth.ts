import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthedCustomer {
  kind: "customer";
  id: number;
  name: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET ?? "dev-secret";

export function signCustomerToken(customer: Omit<AuthedCustomer, "kind">): string {
  return jwt.sign({ ...customer, kind: "customer" }, JWT_SECRET, { expiresIn: "24h" });
}

// Auth disabled — all requests pass as CANEZO customer.
const BYPASS_CUSTOMER: AuthedCustomer = { kind: "customer", id: 1, name: "CANEZO" };

export function requireCustomerAuth(req: Request, _res: Response, next: NextFunction) {
  req.customer = BYPASS_CUSTOMER;
  next();
}
