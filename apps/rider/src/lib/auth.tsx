import { createContext, useContext, useState, type ReactNode } from "react";
import type { AuthedRider } from "./types";

interface AuthContextValue {
  rider: AuthedRider | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Auth disabled — always logged in as WAL rider.
const BYPASS_RIDER: AuthedRider = { id: 1, name: "WAL", code: "WAL" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider] = useState<AuthedRider | null>(BYPASS_RIDER);

  async function login(_phone: string, _password: string) {
    // no-op
  }

  function logout() {
    // no-op
  }

  return <AuthContext.Provider value={{ rider, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
