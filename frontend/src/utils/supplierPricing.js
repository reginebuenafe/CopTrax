export const FIRST_TIME_PRICING_MESSAGE = "Pricing for first-time suppliers: offers are based on the current spot price. You can accept or decline each offer.";
export const FIRST_TIME_OFFER_MESSAGE = "This offer is based on the current spot price. As a first-time supplier, you can accept or decline it.";
export const FIRST_TIME_COUNTER_MESSAGE = "First-time suppliers can submit price proposals, but cannot counter an offer. You can accept or decline this offer.";

// A shared, per-supplier cache. Existing contracts subscriptions call refresh;
// this store creates no additional Realtime channels and never filters status.
export function createSupplierPricingStore(client) {
  const entries = new Map();
  const disabled = { count: null, spotPrice: null, loading: false, error: null };
  function entry(id) {
    if (!entries.has(id)) entries.set(id, {
      state: { count: null, spotPrice: null, loading: true, error: null }, listeners: new Set(), version: 0,
    });
    return entries.get(id);
  }
  function publish(record, state) {
    record.state = state;
    record.listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: id => id ? entry(id).state : disabled,
    subscribe(id, listener) {
      if (!id) return () => {};
      const record = entry(id);
      record.listeners.add(listener);
      return () => record.listeners.delete(listener);
    },
    async refresh(id, { silent = false } = {}) {
      if (!id) return disabled;
      const record = entry(id);
      const version = ++record.version;
      if (!silent) publish(record, { ...record.state, loading: true, error: null });
      let state;
      try {
        const [contracts, spot] = await Promise.all([
          client.from("contracts").select("contract_id", { count: "exact", head: true }).eq("supplier_id", id),
          client.from("spot_price").select("price_per_kg").limit(1).maybeSingle(),
        ]);
        if (contracts.error) throw contracts.error;
        if (!Number.isInteger(contracts.count) || contracts.count < 0) throw new Error("Contract history could not be verified.");
        const price = spot.error || spot.data?.price_per_kg == null ? null : Number(spot.data.price_per_kg);
        state = { count: contracts.count, spotPrice: Number.isFinite(price) ? price : null, loading: false, error: null };
      } catch (error) {
        state = { count: null, spotPrice: null, loading: false, error: error?.message || "Contract history could not be verified." };
      }
      // A late response must not overwrite a contract-created refresh.
      if (version === record.version) publish(record, state);
      return version === record.version ? state : record.state;
    },
  };
}
