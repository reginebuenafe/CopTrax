import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

export function useSensitiveSessionTimeout(enabled = true) {
  const { beginSensitiveContext, endSensitiveContext } = useAuth();

  useEffect(() => {
    if (!enabled) return undefined;
    beginSensitiveContext();
    return endSensitiveContext;
  }, [enabled, beginSensitiveContext, endSensitiveContext]);
}
