import { createContext, useContext, useState, type ReactNode } from "react";

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "ops" | "finance" | "cs";
}

interface AuthContextValue {
  user: AuthedUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Auth disabled — always logged in as admin.
const BYPASS_USER: AuthedUser = { id: 1, email: "admin@daak.pk", name: "Admin", role: "admin" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<AuthedUser | null>(BYPASS_USER);

  async function login(_email: string, _password: string) {
    // no-op
  }

  function logout() {
    // no-op
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
