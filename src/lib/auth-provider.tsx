import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AuthViewer } from "@/lib/auth";
import { getCurrentViewerAction } from "@/lib/auth-api";
import { AuthContext } from "@/lib/auth-context";

export function AuthProvider({
  children,
  viewer,
}: {
  children: ReactNode;
  viewer: AuthViewer | null;
}) {
  const [currentViewer, setCurrentViewer] = useState<AuthViewer | null>(viewer);
  const [loading, setLoading] = useState(viewer === null);

  const refreshViewer = useCallback(async () => {
    try {
      const nextViewer = await getCurrentViewerAction();
      setCurrentViewer(nextViewer);
      return nextViewer;
    } catch {
      setCurrentViewer(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCurrentViewer(viewer);

    if (viewer) {
      setLoading(false);
      return;
    }

    void refreshViewer();
  }, [refreshViewer, viewer]);

  return (
    <AuthContext.Provider value={{ viewer: currentViewer, loading, refreshViewer }}>
      {children}
    </AuthContext.Provider>
  );
}
