// Shared Supabase Realtime Presence channel names.
//
// These are plain string channel names, global across the whole app (not
// scoped per conversation/page) — every Business Owner tab announces itself
// on BUSINESS_OWNER_PRESENCE_CHANNEL, and every Supplier tab announces
// itself on SUPPLIER_PRESENCE_CHANNEL, so all producers/consumers of each
// channel MUST keep using the exact same string. Centralizing them here
// (instead of each file hardcoding its own literal) avoids an unrelated
// future feature accidentally reusing "online-suppliers"/
// "online-business-owners" for something else.
export const BUSINESS_OWNER_PRESENCE_CHANNEL = "coptrax:presence:business-owners";
export const SUPPLIER_PRESENCE_CHANNEL = "coptrax:presence:suppliers";
