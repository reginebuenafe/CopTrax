/**
 * negotiation_pricing.ts — single source of truth for computing the
 * Business-Owner-side recommended/allowable negotiated price for a Supplier's
 * proposal.
 *
 * This is the ONLY place this calculation should live. Any caller (the
 * ai-negotiate Edge Function today, and any future BO/Supplier chat UI or
 * contract-generation code that needs an "allowable price") must import and
 * reuse `computeNegotiationPrice` instead of re-implementing the formula.
 *
 * ── FORMULA ──────────────────────────────────────────────────────────────
 *   recommendedPrice = spotPrice + ratingPremium
 *   …rounded to 2dp. Nothing else factors into the price — no volume bonus,
 *   no completed-delivery bonus, no breach penalty. The price is driven
 *   purely by the supplier's actual overall rating in the database.
 *
 * Rating premium table (per-kg) — banded by the supplier's raw overall
 * rating (NOT rounded to the nearest star, so e.g. 2.5 stays in the
 * 2–2.9 band rather than rounding up to the 3-star band):
 *   No rating / new supplier → +0.00
 *   1.0 – 1.9 stars          → +0.00
 *   2.0 – 2.9 stars          → +0.25
 *   3.0 – 3.9 stars          → +0.50
 *   4.0 – 4.9 stars          → +0.75
 *   5.0 stars                → +1.00
 */

// deno-lint-ignore no-explicit-any
type DbClient = any;

export interface NegotiationPricingFactors {
  spotPrice: number;
  rating: number | null;
  ratingStars: number | null;
  ratingPremium: number;
  recommendedPrice: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function ratingPremiumFor(rating: number | null): number {
  if (rating == null) return 0.00;   // no rating / new supplier
  if (rating >= 5)    return 1.00;   // 5 stars
  if (rating >= 4)    return 0.75;   // 4.0 – 4.9 stars
  if (rating >= 3)    return 0.50;   // 3.0 – 3.9 stars
  if (rating >= 2)    return 0.25;   // 2.0 – 2.9 stars
  return 0.00;                        // 1.0 – 1.9 stars
}

/**
 * Computes the recommended/allowable negotiated price for a supplier's
 * proposal, driven entirely by that supplier's actual overall rating in
 * the database. Never hardcodes or invents a rating for a supplier who
 * doesn't have one — a brand-new supplier gets exactly spotPrice.
 */
export async function computeNegotiationPrice(
  db: DbClient,
  supplierId: string,
  spotPrice: number,
): Promise<NegotiationPricingFactors> {
  // Latest overall supplier rating (null if the supplier has never had a
  // contract snapshot computed — i.e. a brand-new supplier).
  const { data: ratingRow } = await db
    .from("supplier_performance_snapshot")
    .select("overall_supplier_rating")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rating: number | null = ratingRow?.overall_supplier_rating != null
    ? Number(ratingRow.overall_supplier_rating)
    : null;

  // Display/explainability star tier — floored (not rounded) so it always
  // matches the band actually used for ratingPremium below (e.g. a 2.5
  // rating is reported/priced as the "2 stars" band, never rounded up).
  const ratingStars: number | null = rating == null
    ? null
    : Math.max(1, Math.min(5, Math.floor(rating)));

  const ratingPremium = ratingPremiumFor(rating);
  const recommendedPrice = round2(spotPrice + ratingPremium);

  return {
    spotPrice: round2(spotPrice),
    rating,
    ratingStars,
    ratingPremium: round2(ratingPremium),
    recommendedPrice,
  };
}
