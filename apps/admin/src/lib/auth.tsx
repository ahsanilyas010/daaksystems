import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "./api";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(() => {
    const raw = localStorage.getItem("daak_user");
    return raw ? (JSON.parse(raw) as AuthedUser) : null;
  });

  async function login(email: string, password: string) {
    const { token, user } = await api.post<{ token: string; user: AuthedUser }>("/auth/login", {
      email,
      password,
    });
    localStorage.setItem("daak_token", token);
    localStorage.setItem("daak_user", JSON.stringify(user));
    setUser(user);
  }

  function logout() {
    localStorage.removeItem("daak_token");
    localStorage.removeItem("daak_user");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
