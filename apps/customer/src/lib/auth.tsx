import { createContext, useContext, useState, type ReactNode } from "react";
import type { AuthedCustomer } from "./types";

interface AuthContextValue {
  customer: AuthedCustomer | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Auth disabled — always logged in as CANEZO.
const BYPASS_CUSTOMER: AuthedCustomer = { id: 1, name: "CANEZO" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer] = useState<AuthedCustomer | null>(BYPASS_CUSTOMER);

  async function login(_email: string, _password: string) {
    // no-op
  }

  function logout() {
    // no-op
  }

  return <AuthContext.Provider value={{ customer, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
