import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "./api";
import type { AuthedRider } from "./types";

interface AuthContextValue {
  rider: AuthedRider | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [rider, setRider] = useState<AuthedRider | null>(() => {
    const raw = localStorage.getItem("daak_rider");
    return raw ? (JSON.parse(raw) as AuthedRider) : null;
  });

  async function login(phone: string, password: string) {
    const { token, rider } = await api.post<{ token: string; rider: AuthedRider }>("/rider-auth/login", {
      phone,
      password,
    });
    localStorage.setItem("daak_rider_token", token);
    localStorage.setItem("daak_rider", JSON.stringify(rider));
    setRider(rider);
  }

  function logout() {
    localStorage.removeItem("daak_rider_token");
    localStorage.removeItem("daak_rider");
    setRider(null);
  }

  return <AuthContext.Provider value={{ rider, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
