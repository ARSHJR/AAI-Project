import { createContext, useContext, useState } from "react";
import { login as apiLogin } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("staff") || "null");
    } catch {
      return null;
    }
  });

  async function login(email, password) {
    const data = await apiLogin(email, password);
    const staffData = { full_name: data.full_name, role: data.role, email: data.email };
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("staff", JSON.stringify(staffData));
    setStaff(staffData);
    return staffData;
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("staff");
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ staff, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
