# Email modes (Mailtrap)

## Overview
- **sandbox**: captured in Mailtrap Email Testing inbox (no real delivery). Uses SMTP credentials for the sandbox inbox.
- **sending**: real delivery via Mailtrap Email Sending API (requires verified domain).

## .env keys
- `MAIL_MODE` (or `MAILTRAP_MODE`): `sandbox` | `sending` (default `sandbox`)
- For sandbox:
  - `MAILTRAP_SMTP_USER` – sandbox inbox username
  - `MAILTRAP_SMTP_PASS` – sandbox inbox password
  - Optional: `MAILTRAP_SMTP_HOST` (default `sandbox.smtp.mailtrap.io`)
  - Optional: `MAILTRAP_SMTP_PORT` (default `587`)
  - `MAILTRAP_FROM_EMAIL` (fallback to `EMAIL_FROM` or `sandbox@mailtrap.io`)
- For sending:
  - `MAILTRAP_TOKEN` (or `MAILTRAP_DEMO_TOKEN`) – Mailtrap Sending API token
  - `MAILTRAP_FROM_EMAIL` – From address on a verified sending domain

## Switching modes
- Set `MAIL_MODE=sandbox` to capture emails in Mailtrap testing inbox.
- Set `MAIL_MODE=sending` (and provide a verified domain + token) for real delivery.
- Server reads env at startup; restart after changes.

## Share emails
- `/api/share/vehicle/email` uses Mailtrap (sandbox via SMTP, sending via API) based on `MAIL_MODE`.
- Errors are returned to the client with Mailtrap details for debugging.

## Supabase auth mail
- Not changed here. If you want Supabase auth emails to use Mailtrap sandbox, set Supabase SMTP settings to your sandbox SMTP creds.
