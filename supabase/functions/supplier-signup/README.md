Supplier Registration validation setup
======================================

Deploy `supplier-signup` and the updated `upload-registration-files` together with
the frontend. `supplier-signup` uses normal Supabase Auth signup, preserving email
confirmation, duplicate-email handling, sessions, and Supabase password hashing.
No tables, columns, roles, contracts, or approval rules are changed.

Hosted Supabase requires one Auth configuration step to enforce the checks even
when a caller bypasses the frontend:

1. In Authentication → Hooks, enable **Before User Created** with the HTTPS URL
   `https://<project-ref>.supabase.co/functions/v1/supplier-signup`.
2. Generate the hook signing secret there and set the same value as the Edge
   Function secret `SUPPLIER_SIGNUP_HOOK_SECRET` (`v1,whsec_<base64-secret>`).
3. Deploy with `supabase functions deploy supplier-signup --no-verify-jwt` and
   `supabase functions deploy upload-registration-files`.

For local development, put that signing secret in the environment used by the
CLI (or root `.env`) and in the Edge Function environment passed to
`supabase functions serve --env-file <local-secrets-file>`. Restart the local
stack to apply `config.toml`. Do not commit secrets. The hook authenticates its
requests through Standard Webhooks, then checks a short-lived server-signed
validation proof for Supplier signups. Other roles keep their existing checks.

If CLI commands (including `supabase db dump`) report
`auth.hook.before_user_created.secrets must be formatted as ...`, the CLI
environment is missing a valid `SUPPLIER_SIGNUP_HOOK_SECRET`. The frontend's
`.env` and hosted Edge Function secrets do not populate the local CLI environment.
For local development, generate a 32-byte signing secret in PowerShell:

```powershell
$hookBytes = New-Object byte[] 32
$hookRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $hookRng.GetBytes($hookBytes) } finally { $hookRng.Dispose() }
$env:SUPPLIER_SIGNUP_HOOK_SECRET = 'v1,whsec_' + [Convert]::ToBase64String($hookBytes)
```

Persist that value as `SUPPLIER_SIGNUP_HOOK_SECRET=...` in the repository-root
`.env` (already Git-ignored) to use it in later terminals. Use the same local
value for Auth and the function, for example
`supabase functions serve --env-file .env` from the repository root. Keep it
local; the hosted Auth hook and hosted Edge Function must share the signing
secret generated in the hosted dashboard instead.

Until the hook is enabled in the hosted project, direct calls to Supabase Auth
can bypass the new credential gateway. Deploy the function before enabling it.

The existing eight-character minimum is retained, with common weak passwords
and repeated/sequential digit passwords rejected. There is no new global Auth
password policy, so staff creation and password reset keep their existing rules.
Email is trimmed and must have one `@`, no whitespace, a dot-separated domain
with valid labels, and an alphabetic ending of at least two characters.
ID/signature images require `.jpg`, `.jpeg`, `.png`, `.heic`, or `.heif`, a matching
MIME type when provided, matching JPEG/PNG/HEIC file signatures, and the existing
10 MB limit. HEIC/HEIF with an empty browser MIME type is accepted by its extension
and HEVC image signature, then stored with `image/heic`. The selfie and bank QR
upload policies are unchanged. This page has no file drop or paste handlers.

Run the regression tests from the repository root:

    node --test tests/supplier-registration.test.mjs

The tests execute the real validators, JSX handlers, and API handlers with
network/Auth/Storage boundaries mocked. They create no real accounts or files
in Supabase. A deployed smoke test remains necessary after configuring the hook.

Auth hook reference: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
