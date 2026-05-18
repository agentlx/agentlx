import { createContext } from "react";
import type { AuthViewer } from "@/lib/auth";

export type AuthContextValue = {
  viewer: AuthViewer | null;
  loading: boolean;
  refreshViewer: () => Promise<AuthViewer | null>;
};

export const AuthContext = createContext<AuthContextValue>({
  viewer: null,
  loading: true,
  refreshViewer: async () => null,
});
