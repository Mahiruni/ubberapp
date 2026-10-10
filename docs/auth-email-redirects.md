# Production email redirects

NexRide production builds use `https://ubberapp.vercel.app` for auth emails,
regardless of browser origin or `NEXT_PUBLIC_APP_URL`. Local browser redirects
are available only in development builds.

In Supabase project `eyyvvwecpyctttiueban`, Authentication → URL Configuration
must have Site URL `https://ubberapp.vercel.app` and these exact Redirect URLs:

- `https://ubberapp.vercel.app/rider/sign-in?confirmed=1`
- `https://ubberapp.vercel.app/driver/auth?confirmed=1`
- `https://ubberapp.vercel.app/rider/reset-password`

Remove localhost entries from the production project's redirect allowlist so
Supabase cannot accept local destinations. Use a separate project for local
email confirmation testing. Keep email confirmation enabled.

Confirmation and password recovery email templates should use Supabase's
`{{ .ConfirmationURL }}` verification link, with no hardcoded localhost URL.
The existing client routes consume the resulting Supabase session from the URL;
they do not require an `/auth/callback` route.

Vercel's Production `NEXT_PUBLIC_APP_URL` should also be
`https://ubberapp.vercel.app`. Environment changes require a new deployment.
Request a fresh confirmation/reset email after correcting Supabase settings;
previously issued links may still contain their original redirect destination.
