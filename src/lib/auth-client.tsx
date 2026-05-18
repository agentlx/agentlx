import { useContext } from "react";
import { AuthContext } from "@/lib/auth-context";

export function useAuthViewer() {
  return useContext(AuthContext).viewer;
}

export function useAuthState() {
  return useContext(AuthContext);
}
