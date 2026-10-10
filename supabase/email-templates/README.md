# NexRide authentication email collection

Six responsive branded emails, with HTML, plain-text companions, subjects,
preheaders, a reusable builder, safe browser previews and screenshots.

## Files

- `html/`: production Supabase Go HTML templates.
- `text/`: equivalent plain-text content for a custom mail sender or manual use.
- `manifest.json`: subjects, preheaders and dashboard template mappings.
- `supabase-auth-config.json`: template-only Management API payload. No secrets.
- `assets/nexride-email-mark.png`: raster conversion of NexRide's official SVG mark.
- `index.html`, `previews/`: non-delivering design previews with sample data.
- `screenshots/`: desktop and mobile visual proofs.
- `build.py`, `verify.py`: regenerate and validate the collection.

## Supabase installation

Project: `eyyvvwecpyctttiueban` (NexRide, production).

On 10 October 2026, the dashboard showed custom SMTP disabled. Template subject
and source editing were disabled with the message “Set up custom SMTP to edit
templates.” The free built-in sender currently uses Supabase's defaults.

Before installation, configure a verified sender and custom SMTP in
Authentication → Emails → SMTP Settings. Enter credentials directly in the
dashboard, never in chat or this repository. Required provider details are the
verified sender email, sender name (`NexRide`), SMTP host, TLS port, username and
password/API credential. Configure the provider's SPF/DKIM and DMARC records for
the actual owned sending domain. Do not invent a sender address. Disable provider
click tracking so verification links are not rewritten. Choose a sending limit
that matches the provider and Supabase settings.

Once SMTP is working, open each matching email template, paste its subject from
`manifest.json` and HTML from `html/`, and save. Alternatively, apply only the
keys in `supabase-auth-config.json` through an already authenticated Management
API workflow; this payload does not enable SMTP or alter any Auth security flags.

Supabase's dashboard exposes subject and HTML body fields, not a separate
plain-text body field. The `.txt` companions are supplied for a custom sender's
multipart email support; they are not claimed to be installed through the
dashboard.

The image must be publicly available at
`https://ubberapp.vercel.app/brand/nexride-email-mark.png` before activation.
The visible NexRide wordmark, headings, actions and security copy are live text
and do not depend on image loading.

## Auth behavior

Five templates retain `{{ .ConfirmationURL }}` as supplied by Supabase, including
the copyable fallback. Never replace it with an ordinary app URL. Email change
also retains `{{ .NewEmail }}`; secure email change may send confirmation to both
the old and new addresses. Reauthentication uses `{{ .Token }}` and asks the user
to enter the code in the existing app screen. It intentionally has no fabricated
verification link. No expiry duration is promised because project settings may
vary. No user-editable metadata controls authorization or template links.

The Site URL remains `https://ubberapp.vercel.app`. The existing allowlist remains
the rider confirmation, driver confirmation and rider reset-password routes.
No verification or authentication protection is disabled by this collection.

## Verification and limitations

Run `python build.py` then `python verify.py` from a Python 3 environment.
Serve this directory locally to inspect `index.html`. Preview links are inert.
Do not install `previews/` as production templates.

Browser checks cover desktop, mobile and narrow mobile widths, realistic long
verification-link wrapping, logo loading and a simulated images-blocked view.
Layout tables, inline styles, system fonts and an Outlook fixed-width wrapper
provide conservative email-client fallbacks. Rounded corners and other purely
decorative effects may vary by client.

Actual Gmail/Outlook/Apple Mail inbox rendering and delivery have not been tested.
No test email was sent. Request authorization and a recipient before sending
tests after SMTP setup. Save a copy of existing production templates before
replacing them; restore those copies to roll back.

References:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/changelog (3 June 2026 template customization change)
