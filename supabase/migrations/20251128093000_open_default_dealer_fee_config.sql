-- Allow client-side read of the default active dealer fee config.
-- This avoids RLS checks that reference other tables (e.g., users) and fixes 403s.

-- Ensure RLS is enabled
alter table dealer_fee_configs enable row level security;

-- Drop any existing restrictive select policies that might block public reads
drop policy if exists "Public read default dealer config" on dealer_fee_configs;

-- Allow anon/authenticated to read only the default, active config
create policy "Public read default dealer config"
on dealer_fee_configs for select
to public
using (dealer_id = 'default' and is_active = true);

-- Grant select to anon/authenticated roles
grant select on dealer_fee_configs to anon, authenticated;
