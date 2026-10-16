import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { createSupplierPricingStore } from "../utils/supplierPricing";

const pricing = createSupplierPricingStore(supabase);

export function useIsFirstTimeSupplier(supplierId, { refreshKey } = {}) {
  const [readyFor, setReadyFor] = useState(null);
  const subscribe = useCallback(listener => pricing.subscribe(supplierId, listener), [supplierId]);
  const getSnapshot = useCallback(() => pricing.getSnapshot(supplierId), [supplierId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const refresh = useCallback(options => pricing.refresh(supplierId, options), [supplierId]);
  useEffect(() => {
    let cancelled = false;
    // Readiness belongs to this consumer. Opening a modal must not mark the
    // parent chat as loading and unmount that very modal during its check.
    if (supplierId) refresh({ silent: true }).then(() => {
      if (!cancelled) setReadyFor({ supplierId, refreshKey });
    });
    return () => { cancelled = true; };
  }, [supplierId, refreshKey, refresh]);
  const loading = !!supplierId && (snapshot.loading || readyFor?.supplierId !== supplierId || readyFor?.refreshKey !== refreshKey);
  return {
    ...snapshot, loading, refresh,
    isFirstTimeSupplier: !!supplierId && !loading && !snapshot.error && snapshot.count === 0,
    canSubmitProposal: !!supplierId && !loading && !snapshot.error && snapshot.count !== null,
    canCounter: !!supplierId && !loading && !snapshot.error && snapshot.count > 0,
  };
}
