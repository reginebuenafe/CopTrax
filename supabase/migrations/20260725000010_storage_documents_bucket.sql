-- ============================================================
-- Migration 010: Supabase Storage — documents bucket
-- Stores Gov ID photos, Face-with-ID selfies, and E-Signature photos
-- uploaded during Supplier self-registration.
-- ============================================================

-- Create the bucket (public = false: files are NOT publicly readable;
-- all access goes through signed URLs or the service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760,  -- 10 MB per file
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────────────────────

-- Authenticated users can upload to their own folder (path starts with their user_id)
CREATE POLICY "documents_insert_own"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can read their own files
CREATE POLICY "documents_select_own"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Business Owner can read all files in the bucket (for verification review)
CREATE POLICY "documents_select_bo"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'documents'
        AND public.get_my_role() = 'Business Owner'
    );
