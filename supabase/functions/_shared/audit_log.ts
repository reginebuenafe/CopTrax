import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function writeAuditLog(
  admin: SupabaseClient,
  entry: {
    userId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
  },
) {
  const { error } = await admin.from("audit_logs").insert({
    user_id: entry.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
  });
  if (error) {
    throw new Error(`Audit log insert failed: ${error.message}`);
  }
}
