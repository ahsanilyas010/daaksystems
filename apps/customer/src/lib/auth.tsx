import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AuthedCustomer } from "./types";

interface AuthContextValue {
  customer: AuthedCustomer | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<AuthedCustomer | null>(() => {
    const raw = localStorage.getItem("daak_customer");
    return raw ? (JSON.parse(raw) as AuthedCustomer) : null;
  });

  async function login(email: string, password: string) {
    const { token, customer } = await api.post<{ token: string; customer: AuthedCustomer }>(
      "/customer-auth/login",
      { email, password }
    );
    localStorage.setItem("daak_customer_token", token);
    localStorage.setItem("daak_customer", JSON.stringify(customer));
    setCustomer(customer);
  }

  function logout() {
    localStorage.removeItem("daak_customer_token");
    localStorage.removeItem("daak_customer");
    setCustomer(null);
  }

  return <AuthContext.Provider value={{ customer, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
