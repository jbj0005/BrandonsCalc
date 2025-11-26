/**
 * End-to-end invite flow test (API-only, no UI).
 *
 * Steps:
 * 1) Sign in as owner with email/password.
 * 2) Insert an invite for the invitee (viewer role) with a random token.
 * 3) Sign in as invitee, accept the invite via RPC.
 * 4) Fetch accessible garage vehicles for invitee and report counts.
 *
 * Requirements (env):
 *  - SUPABASE_URL
 *  - SUPABASE_ANON_KEY
 *  - OWNER_EMAIL
 *  - OWNER_PASSWORD
 *  - INVITEE_EMAIL
 *  - INVITEE_PASSWORD
 *
 * Run:
 *  npx ts-node scripts/test-garage-invite.ts
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  INVITEE_EMAIL,
  INVITEE_PASSWORD,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in env');
}
if (!OWNER_EMAIL || !OWNER_PASSWORD || !INVITEE_EMAIL || !INVITEE_PASSWORD) {
  throw new Error('OWNER_* and INVITEE_* credentials must be set in env');
}

// Helper to create an authed client without session persistence
const createAuthedClient = () =>
  createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

async function main() {
  const ownerClient = createAuthedClient();
  const inviteeClient = createAuthedClient();

  console.log('Signing in owner...');
  const { data: ownerAuth, error: ownerAuthError } =
    await ownerClient.auth.signInWithPassword({
      email: OWNER_EMAIL!,
      password: OWNER_PASSWORD!,
    });
  if (ownerAuthError || !ownerAuth?.user) {
    throw new Error(`Owner sign-in failed: ${ownerAuthError?.message}`);
  }
  const ownerId = ownerAuth.user.id;
  console.log('Owner signed in:', ownerId);

  // Generate token
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = null; // optional expiry
  console.log('Creating invite with token:', token);

  // Insert invite row as owner (RLS should permit when auth.uid = garage_owner_id)
  const { data: invite, error: inviteError } = await ownerClient
    .from('garage_invites')
    .insert({
      garage_owner_id: ownerId,
      email: INVITEE_EMAIL,
      role: 'viewer',
      token,
      expires_at: expiresAt,
      status: 'pending',
      invited_by: ownerId,
    })
    .select()
    .single();

  if (inviteError || !invite) {
    throw new Error(`Invite insert failed: ${inviteError?.message}`);
  }
  console.log('Invite created for:', invite.email);

  // Sign in invitee
  console.log('Signing in invitee...');
  const { data: inviteeAuth, error: inviteeAuthError } =
    await inviteeClient.auth.signInWithPassword({
      email: INVITEE_EMAIL!,
      password: INVITEE_PASSWORD!,
    });
  if (inviteeAuthError || !inviteeAuth?.user) {
    throw new Error(`Invitee sign-in failed: ${inviteeAuthError?.message}`);
  }
  const inviteeId = inviteeAuth.user.id;
  console.log('Invitee signed in:', inviteeId);

  // Accept invite via RPC
  console.log('Accepting invite via RPC...');
  const { data: acceptData, error: acceptError } = await inviteeClient.rpc(
    'accept_garage_invite',
    { p_token: token }
  );
  if (acceptError) {
    throw new Error(`Accept invite failed: ${acceptError.message}`);
  }
  console.log('Invite accepted:', acceptData);

  // Fetch accessible garage vehicles for invitee
  console.log('Fetching accessible garage vehicles (invitee)...');
  const { data: accessible, error: accessError } = await inviteeClient.rpc(
    'get_accessible_garage_vehicles'
  );
  if (accessError) {
    throw new Error(`get_accessible_garage_vehicles failed: ${accessError.message}`);
  }

  const total = accessible?.length || 0;
  const fromOwner = (accessible || []).filter(
    (v: any) => v.garage_owner_id === ownerId || v.user_id === ownerId
  ).length;

  console.log('Accessible vehicles total:', total);
  console.log('Accessible vehicles from owner:', fromOwner);

  if (fromOwner === 0) {
    throw new Error(
      'No shared vehicles from the owner were found after accepting the invite.'
    );
  }

  console.log('SUCCESS: Invite flow works and vehicles are accessible.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
