create table if not exists secure_settings (
  name text primary key,
  secret text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table secure_settings enable row level security;

create policy "service role only"
on secure_settings
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

comment on table secure_settings is 'Key-value store for server-only secrets (service role access only).';
