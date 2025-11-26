-- Broaden select access for dealer_fee_configs so fee engine can read defaults client-side.

alter table dealer_fee_configs enable row level security;

-- Drop prior selective policy to avoid conflicts
drop policy if exists "Public read default dealer config" on dealer_fee_configs;
drop policy if exists "Anon read dealer configs" on dealer_fee_configs;

-- Allow anon/authenticated to read all rows (safe if table only contains non-sensitive dealer fee configs)
create policy "Public read dealer fee configs"
on dealer_fee_configs for select
to public
using (true);

grant select on dealer_fee_configs to anon, authenticated;
