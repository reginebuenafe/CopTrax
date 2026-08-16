// _shared/contract_hash.ts
// -----------------------------------------------------------------------------
// Canonical hashing helpers for CopTrax contracts. The same function must be
// callable from both generate-contract (writes the hash) and sign-contract
// (verifies the hash).
//
// Design notes:
//   • The hash is a SHA-256 of a **canonical JSON** — object keys are sorted
//     alphabetically so serialization order can never sneak in and change the
//     hash without an actual value change.
//   • Every value that legally belongs on the contract is included. If a value
//     is ever added/removed here, existing contracts continue to verify because
//     their hash was computed against the terms that existed when they were
//     generated (that snapshot is stored in contracts.contract_terms_snapshot).
// -----------------------------------------------------------------------------

export interface ContractTerms {
  contract_number:          string;
  supplier_id:              string;
  supplier_name:            string;
  supplier_address:         string;
  business_owner_id:        string;
  business_owner_name:      string;
  contracted_tons:          string;   // stored as string for exactness
  negotiated_price_per_kg:  string;   // stored as string for exactness
  delivery_location:        string;
  special_notes:            string;
  created_at:               string;   // ISO timestamp when the terms were locked
}

/** Deterministically stringify an object with alphabetically sorted keys. */
export function canonicalJSON(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/** SHA-256 hex digest of an arbitrary string, via the Web Crypto API. */
export async function sha256Hex(str: string): Promise<string> {
  const buf     = new TextEncoder().encode(str);
  const digest  = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute the canonical SHA-256 hash for a ContractTerms object. */
export async function computeContractHash(terms: ContractTerms): Promise<string> {
  return sha256Hex(canonicalJSON(terms as unknown as Record<string, unknown>));
}
