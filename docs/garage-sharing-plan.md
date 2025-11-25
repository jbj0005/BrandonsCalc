# Garage Sharing Implementation Plan

## Goals
- Let a user share their garage and saved vehicles two ways: (1) view-only shareable link for people without accounts and (2) managed member access for accounts with roles (owner/manager/viewer).
- Shared viewers can run financial models with shared vehicles in their dropdown.
- Authenticated viewers can copy vehicles: `Add to My Saved Vehicles` or `Add to My Garage`.
- Owners/managers can revoke access, manage roles, and see who has access.

## Assumptions
- Use Supabase (Postgres + RLS) as the primary datastore and API surface.
- Existing `garages`, `vehicles`, and `saved_vehicles` concepts exist or will be created alongside this work.
- Frontend is React (Vite) with Supabase client already wired.

## Data Model (new/updated tables)
1) `garage_members`
   - `id` UUID PK, `garage_id` FK, `user_id` FK, `role` enum (`owner`,`manager`,`viewer`), `status` enum (`active`,`invited`), `invited_by`, `created_at`, `updated_at`.
   - Unique `(garage_id, user_id)` to prevent duplicates.
2) `garage_invites`
   - `id` UUID PK, `garage_id` FK, `email` (or phone), `role`, `token_hash`, `expires_at`, `status` enum (`pending`,`accepted`,`declined`,`revoked`), `invited_by`, `created_at`.
3) `garage_share_links`
   - `id` UUID PK, `garage_id` FK, `token_hash`, `role` (fixed `viewer`), `expires_at`, `max_views` (nullable), `current_views`, `revoked_at`, `created_by`, `created_at`.
4) `garage_link_sessions`
   - `id` UUID PK, `share_link_id` FK, `session_token_hash`, `user_agent`, `ip`, `created_at`, `expires_at`.
   - Derived ephemeral session created when a share link is opened; used to gate subsequent requests without embedding the original link token everywhere.
5) `vehicle_copies`
   - `id` UUID PK, `source_vehicle_id`, `source_garage_id`, `target_user_id`, `target_garage_id` (nullable), `copy_type` enum (`saved`,`garage`), `created_at`.
   - Add provenance columns on vehicle records if needed: `shared_from_garage_id`, `shared_from_vehicle_id`.

Indexes and RLS: index token hashes, enforce RLS so users only see garages they own or are members of; share-link access bypasses user RLS via a verified session token pathway.

## Access & Permission Rules
- Roles:
  - `owner`: full control, manage members/invites/share links, delete garage.
  - `manager`: add/remove vehicles, manage invites up to manager/viewer, create/revoke view links.
  - `viewer`: read-only, can run models, can copy vehicles.
- Shareable links map to `viewer` scope only.
- Revocation/expiry immediately invalidates link sessions and removes shared vehicles from dropdowns.

## Backend/API Work
1) Authenticated endpoints
   - `POST /garages/:id/share-link` {`expires_at`, `max_views`} → returns share URL token.
   - `POST /garages/:id/share-links/:share_link_id/revoke` → revoke link.
   - `POST /garages/:id/invite` {`email`, `role`} → create invite and send email/SMS.
   - `POST /invites/:token/accept` (auth) → creates `garage_member`, marks invite accepted.
   - `PATCH /garages/:id/members/:member_id` {`role`} → role updates (authz checked).
   - `DELETE /garages/:id/members/:member_id` → revoke access.
   - `GET /vehicles?scope=accessible` → union of user-owned vehicles + vehicles from garages where user is member; include `source` (`own`|`shared`), `garage_id`, `garage_role`.
   - `POST /vehicles/:id/copy` {`copy_type`, `target_garage_id`?} → creates copy + provenance row.
2) Anonymous/share-link endpoints
   - `GET /share/:token` → validate token (expiry/revocation/max_views), create `garage_link_session`, return lightweight view + session token.
   - `GET /shared-vehicles` header/cookie `link_session` → list vehicles for that garage (read-only).
   - `POST /models/run` accepts `vehicle_id` plus either user auth or `link_session`; validates access scope.
3) Validation + security
   - Tokens: generate random, store `token_hash` (SHA-256) with salt; signed URL includes opaque token.
   - Rate-limit link creation and invite sending.
   - Audit logs: access via share link, model runs, copies, membership changes.

## Frontend Work
1) Garage page: add Share modal with two tabs
   - Tab 1: “Invite people” → email input, role selector (`viewer`,`manager`), send invite; list current members with role pill + change/remove controls.
   - Tab 2: “Shareable link (view-only)” → generate link with expiry presets (7d default), copy button, revoke button, view count, expiry display.
2) Shared viewing experience (no account)
   - `/share/:token` route: validate, set `link_session`, render read-only garage + vehicles list.
   - Vehicle dropdown populated from `GET /shared-vehicles`; show “Shared via <Garage Name>” banner; hide edits.
3) Authenticated viewers’ dropdown
   - Use `GET /vehicles?scope=accessible`; group/label shared vehicles (`Shared: Smith Garage`).
   - Ensure model-run forms accept shared vehicles and pass access context.
4) Copy CTAs
   - On each shared vehicle: buttons `Add to My Saved Vehicles`, `Add to My Garage` (garage picker).
   - Post-copy toast + immediate dropdown refresh with new vehicle tagged “Saved from <Garage>”.
   - For anonymous viewers, clicking copy triggers login/signup and deep-links back to the vehicle.
5) Edge UX
   - Handling revoked/expired links with clear messaging and CTA to request access.
   - When user is both member and has link, prefer membership scope (allows edits if manager).

## Email/Notification
- Invite email with accept link.
- Optional: notify owner on link creation, invite acceptance, revocations.
- Templates stored with minimal PII; include expiry info.

## Migration Steps
1) Create enums and tables (`garage_members`, `garage_invites`, `garage_share_links`, `garage_link_sessions`, `vehicle_copies`) with RLS policies.
2) Backfill existing garages: set owner rows in `garage_members`.
3) Seed role defaults and test tokens.
4) Add indexes on token hashes and membership lookups.

## Testing Plan
- Unit: token generation/validation, role checks, copy logic.
- Integration (Supabase): RLS policies for each role, link expiry/revocation, invite acceptance flow.
- E2E (Playwright/Jest): share link open, dropdown shows shared vehicles, model run succeeds, revoke removes access, copy actions create vehicles and appear in dropdown.
- Security: rate-limit checks, token reuse, max_views enforcement.

## Rollout / Feature Flags
- Flag the share-link feature and member invites separately.
- Log metrics: link creations, invite accept rates, share link opens, copies, model runs on shared vehicles.
- Provide admin toggle to disable all share links if abuse detected.

## Open Questions (decide before build)
- Default link expiry (proposed 7 days) and max_views default (infinite vs. capped).
- Should copies remain after revocation? (default: copies persist; note provenance).
- What PII to hide in shared view (limit to garage + vehicles only).
