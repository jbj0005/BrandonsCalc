-- Garage sharing + invite + share-link support
-- Adds membership tables, share links, copy audit, helper functions, and expands garage_vehicles RLS to allow shared garages.

create extension if not exists "pgcrypto";

-- ============================================
-- Membership tables
-- ============================================
create table if not exists garage_members (
  id uuid primary key default gen_random_uuid(),
  garage_owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','viewer')),
  status text not null default 'active' check (status in ('active','invited','revoked')),
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (garage_owner_id, member_user_id)
);

create index if not exists idx_garage_members_owner on garage_members(garage_owner_id);
create index if not exists idx_garage_members_member on garage_members(member_user_id);

create table if not exists garage_invites (
  id uuid primary key default gen_random_uuid(),
  garage_owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','viewer')),
  token text not null unique,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked','expired')),
  invited_by uuid references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_garage_invites_owner on garage_invites(garage_owner_id);
create index if not exists idx_garage_invites_email on garage_invites(email);

create table if not exists garage_share_links (
  id uuid primary key default gen_random_uuid(),
  garage_owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  role text not null default 'viewer' check (role = 'viewer'),
  expires_at timestamptz,
  max_views integer,
  current_views integer default 0,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_garage_share_links_owner on garage_share_links(garage_owner_id);

create table if not exists vehicle_copies (
  id uuid primary key default gen_random_uuid(),
  source_vehicle_id uuid references garage_vehicles(id) on delete set null,
  source_garage_owner_id uuid references auth.users(id) on delete set null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  target_garage_owner_id uuid references auth.users(id) on delete set null,
  copy_type text not null check (copy_type in ('garage','saved')),
  created_at timestamptz default now()
);

create index if not exists idx_vehicle_copies_source on vehicle_copies(source_vehicle_id);
create index if not exists idx_vehicle_copies_target on vehicle_copies(target_user_id);

-- Provenance columns on garage_vehicles (optional, safe if already exist)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'garage_vehicles' and column_name = 'photo_storage_path'
  ) then
    alter table garage_vehicles add column photo_storage_path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'garage_vehicles' and column_name = 'shared_from_garage_owner_id'
  ) then
    alter table garage_vehicles add column shared_from_garage_owner_id uuid references auth.users(id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'garage_vehicles' and column_name = 'shared_from_vehicle_id'
  ) then
    alter table garage_vehicles add column shared_from_vehicle_id uuid references garage_vehicles(id);
  end if;
end $$;

-- ============================================
-- Triggers
-- ============================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_garage_members_updated_at on garage_members;
create trigger set_garage_members_updated_at
  before update on garage_members
  for each row execute function set_updated_at();

drop trigger if exists set_garage_invites_updated_at on garage_invites;
create trigger set_garage_invites_updated_at
  before update on garage_invites
  for each row execute function set_updated_at();

-- ============================================
-- Helper functions for permissions
-- ============================================
create or replace function has_garage_view_access(p_garage_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;

  if uid = p_garage_owner_id then
    return true;
  end if;

  return exists (
    select 1
    from garage_members gm
    where gm.garage_owner_id = p_garage_owner_id
      and gm.member_user_id = uid
      and gm.status = 'active'
  );
end;
$$;

create or replace function has_garage_management_access(p_garage_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;

  if uid = p_garage_owner_id then
    return true;
  end if;

  return exists (
    select 1
    from garage_members gm
    where gm.garage_owner_id = p_garage_owner_id
      and gm.member_user_id = uid
      and gm.status = 'active'
      and gm.role in ('owner','manager')
  );
end;
$$;

-- ============================================
-- RLS policies
-- ============================================
alter table garage_members enable row level security;
drop policy if exists "Members can view relevant memberships" on garage_members;
drop policy if exists "Owners can add members" on garage_members;
drop policy if exists "Owners can update members" on garage_members;
drop policy if exists "Owners can delete members" on garage_members;

create policy "Members can view relevant memberships"
  on garage_members for select
  to authenticated
  using (
    auth.uid() = garage_owner_id
    or auth.uid() = member_user_id
  );

create policy "Owners can add members"
  on garage_members for insert
  to authenticated
  with check (auth.uid() = garage_owner_id);

create policy "Owners can update members"
  on garage_members for update
  to authenticated
  using (auth.uid() = garage_owner_id)
  with check (auth.uid() = garage_owner_id);

create policy "Owners can delete members"
  on garage_members for delete
  to authenticated
  using (auth.uid() = garage_owner_id);

alter table garage_invites enable row level security;
drop policy if exists "Owners can manage invites" on garage_invites;
drop policy if exists "Owners can view invites" on garage_invites;

create policy "Owners can view invites"
  on garage_invites for select
  to authenticated
  using (has_garage_view_access(garage_owner_id));

create policy "Owners can manage invites"
  on garage_invites for all
  to authenticated
  using (has_garage_management_access(garage_owner_id))
  with check (has_garage_management_access(garage_owner_id));

alter table garage_share_links enable row level security;
drop policy if exists "Owners can manage share links" on garage_share_links;

create policy "Owners can manage share links"
  on garage_share_links for all
  to authenticated
  using (has_garage_management_access(garage_owner_id))
  with check (has_garage_management_access(garage_owner_id));

alter table vehicle_copies enable row level security;
drop policy if exists "Users can view own vehicle copies" on vehicle_copies;
drop policy if exists "Users can insert own vehicle copies" on vehicle_copies;

create policy "Users can view own vehicle copies"
  on vehicle_copies for select
  to authenticated
  using (auth.uid() = target_user_id);

create policy "Users can insert own vehicle copies"
  on vehicle_copies for insert
  to authenticated
  with check (auth.uid() = target_user_id);

-- garage_vehicles: widen RLS to allow shared garages
drop policy if exists "Users can view own vehicles" on garage_vehicles;
drop policy if exists "Users can insert own vehicles" on garage_vehicles;
drop policy if exists "Users can update own vehicles" on garage_vehicles;
drop policy if exists "Users can delete own vehicles" on garage_vehicles;

create policy "Owners and members can view garage vehicles"
  on garage_vehicles for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from garage_members gm
      where gm.garage_owner_id = garage_vehicles.user_id
        and gm.member_user_id = auth.uid()
        and gm.status = 'active'
    )
  );

create policy "Owners and managers can insert garage vehicles"
  on garage_vehicles for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from garage_members gm
      where gm.garage_owner_id = garage_vehicles.user_id
        and gm.member_user_id = auth.uid()
        and gm.status = 'active'
        and gm.role in ('owner','manager')
    )
  );

create policy "Owners and managers can update garage vehicles"
  on garage_vehicles for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from garage_members gm
      where gm.garage_owner_id = garage_vehicles.user_id
        and gm.member_user_id = auth.uid()
        and gm.status = 'active'
        and gm.role in ('owner','manager')
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from garage_members gm
      where gm.garage_owner_id = garage_vehicles.user_id
        and gm.member_user_id = auth.uid()
        and gm.status = 'active'
        and gm.role in ('owner','manager')
    )
  );

create policy "Owners and managers can delete garage vehicles"
  on garage_vehicles for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from garage_members gm
      where gm.garage_owner_id = garage_vehicles.user_id
        and gm.member_user_id = auth.uid()
        and gm.status = 'active'
        and gm.role in ('owner','manager')
    )
  );

-- ============================================
-- RPC helpers
-- ============================================
create or replace function get_accessible_garage_vehicles()
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  year integer,
  make text,
  model text,
  "trim" text,
  vin text,
  mileage integer,
  condition text,
  estimated_value numeric,
  payoff_amount numeric,
  photo_url text,
  photo_storage_path text,
  notes text,
  times_used integer,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  shared_from_garage_owner_id uuid,
  shared_from_vehicle_id uuid,
  garage_owner_id uuid,
  access_role text,
  source text
)
language sql
security definer
set search_path = public
as $$
  select
    gv.id,
    gv.user_id,
    gv.nickname,
    gv.year,
    gv.make,
    gv.model,
    gv.trim,
    gv.vin,
    gv.mileage,
    gv.condition,
    gv.estimated_value,
    gv.payoff_amount,
    gv.photo_url,
    gv.photo_storage_path,
    gv.notes,
    gv.times_used,
    gv.last_used_at,
    gv.created_at,
    gv.updated_at,
    gv.shared_from_garage_owner_id,
    gv.shared_from_vehicle_id,
    gv.user_id as garage_owner_id,
    case
      when gv.user_id = auth.uid() then 'owner'
      else coalesce(gm.role, 'viewer')
    end as access_role,
    case
      when gv.user_id = auth.uid() then 'own'
      else 'shared'
    end as source
  from garage_vehicles gv
  left join garage_members gm
    on gm.garage_owner_id = gv.user_id
   and gm.member_user_id = auth.uid()
   and gm.status = 'active'
  where gv.user_id = auth.uid()
     or gm.id is not null;
$$;

create or replace function create_garage_share_link(
  p_garage_owner_id uuid default auth.uid(),
  p_expires_at timestamptz default (now() + interval '7 days'),
  p_max_views integer default null
)
returns table (
  id uuid,
  token text,
  expires_at timestamptz,
  max_views integer,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text;
  _link_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_garage_owner_id is null then
    p_garage_owner_id := auth.uid();
  end if;

  if not has_garage_management_access(p_garage_owner_id) then
    raise exception 'Not authorized to create share links for this garage';
  end if;

  _token := encode(gen_random_bytes(16), 'hex');

  insert into garage_share_links (garage_owner_id, token, role, expires_at, max_views, created_by)
  values (p_garage_owner_id, _token, 'viewer', p_expires_at, p_max_views, auth.uid())
  returning id into _link_id;

  return query
  select gsl.id, gsl.token, gsl.expires_at, gsl.max_views, gsl.role, gsl.created_at
  from garage_share_links gsl
  where gsl.id = _link_id;
end;
$$;

create or replace function revoke_garage_share_link(p_link_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner uuid;
begin
  select garage_owner_id into _owner from garage_share_links where id = p_link_id;

  if _owner is null then
    return false;
  end if;

  if not has_garage_management_access(_owner) then
    raise exception 'Not authorized to revoke this link';
  end if;

  update garage_share_links
    set revoked_at = now()
  where id = p_link_id;

  return true;
end;
$$;

create or replace function get_shared_garage_vehicles(p_token text)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  year integer,
  make text,
  model text,
  "trim" text,
  vin text,
  mileage integer,
  condition text,
  estimated_value numeric,
  payoff_amount numeric,
  photo_url text,
  photo_storage_path text,
  notes text,
  times_used integer,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  garage_owner_id uuid,
  source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _link garage_share_links%rowtype;
begin
  select * into _link
  from garage_share_links
  where token = p_token
  limit 1;

  if not found then
    raise exception 'Invalid share link';
  end if;

  if _link.revoked_at is not null then
    raise exception 'Share link revoked';
  end if;

  if _link.expires_at is not null and _link.expires_at < now() then
    raise exception 'Share link expired';
  end if;

  if _link.max_views is not null and coalesce(_link.current_views, 0) >= _link.max_views then
    raise exception 'Share link view limit reached';
  end if;

  update garage_share_links
    set current_views = coalesce(current_views, 0) + 1
  where id = _link.id;

  return query
  select
    gv.id,
    gv.user_id,
    gv.nickname,
    gv.year,
    gv.make,
    gv.model,
    gv.trim,
    gv.vin,
    gv.mileage,
    gv.condition,
    gv.estimated_value,
    gv.payoff_amount,
    gv.photo_url,
    gv.photo_storage_path,
    gv.notes,
    gv.times_used,
    gv.last_used_at,
    gv.created_at,
    gv.updated_at,
    _link.garage_owner_id as garage_owner_id,
    'shared'::text as source
  from garage_vehicles gv
  where gv.user_id = _link.garage_owner_id
  order by gv.last_used_at desc nulls last, gv.created_at desc;
end;
$$;

create or replace function accept_garage_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv garage_invites%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select * into inv
  from garage_invites
  where token = p_token
  limit 1;

  if not found then
    raise exception 'Invalid invite token';
  end if;

  if inv.status <> 'pending' then
    raise exception 'Invite no longer active';
  end if;

  if inv.expires_at is not null and inv.expires_at < now() then
    update garage_invites set status = 'expired' where id = inv.id;
    raise exception 'Invite expired';
  end if;

  update garage_invites
    set status = 'accepted',
        accepted_by = uid,
        accepted_at = now()
  where id = inv.id;

  insert into garage_members (garage_owner_id, member_user_id, role, status, invited_by)
  values (inv.garage_owner_id, uid, inv.role, 'active', inv.invited_by)
  on conflict (garage_owner_id, member_user_id) do update
    set role = excluded.role,
        status = 'active',
        updated_at = now();

  return true;
end;
$$;

create or replace function copy_garage_vehicle_to_user(
  p_vehicle_id uuid,
  p_target_garage_owner_id uuid default auth.uid()
)
returns table (
  id uuid,
  user_id uuid,
  nickname text,
  year integer,
  make text,
  model text,
  "trim" text,
  vin text,
  mileage integer,
  condition text,
  estimated_value numeric,
  payoff_amount numeric,
  photo_url text,
  photo_storage_path text,
  notes text,
  times_used integer,
  last_used_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  shared_from_garage_owner_id uuid,
  shared_from_vehicle_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src garage_vehicles%rowtype;
  _id uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if p_target_garage_owner_id is null then
    p_target_garage_owner_id := uid;
  end if;

  if p_target_garage_owner_id <> uid then
    raise exception 'Cannot copy into another user''s garage';
  end if;

  select * into src from garage_vehicles where id = p_vehicle_id;

  if not found then
    raise exception 'Source vehicle not found';
  end if;

  if not has_garage_view_access(src.user_id) then
    raise exception 'Not authorized to copy this vehicle';
  end if;

  insert into garage_vehicles (
    user_id,
    nickname,
    year,
    make,
    model,
    trim,
    vin,
    mileage,
    condition,
    estimated_value,
    payoff_amount,
    photo_url,
    photo_storage_path,
    notes,
    shared_from_garage_owner_id,
    shared_from_vehicle_id,
    created_at,
    updated_at
  )
  values (
    uid,
    src.nickname,
    src.year,
    src.make,
    src.model,
    src.trim,
    src.vin,
    src.mileage,
    src.condition,
    src.estimated_value,
    src.payoff_amount,
    src.photo_url,
    src.photo_storage_path,
    src.notes,
    src.user_id,
    src.id,
    now(),
    now()
  )
  returning id into _id;

  insert into vehicle_copies (
    source_vehicle_id,
    source_garage_owner_id,
    target_user_id,
    target_garage_owner_id,
    copy_type
  ) values (
    src.id,
    src.user_id,
    uid,
    uid,
    'garage'
  );

  return query
  select
    gv.id,
    gv.user_id,
    gv.nickname,
    gv.year,
    gv.make,
    gv.model,
    gv.trim,
    gv.vin,
    gv.mileage,
    gv.condition,
    gv.estimated_value,
    gv.payoff_amount,
    gv.photo_url,
    gv.photo_storage_path,
    gv.notes,
    gv.times_used,
    gv.last_used_at,
    gv.created_at,
    gv.updated_at,
    gv.shared_from_garage_owner_id,
    gv.shared_from_vehicle_id
  from garage_vehicles gv
  where gv.id = _id;
end;
$$;

-- Allow anon to read via get_shared_garage_vehicles; authenticated for others
grant execute on function get_shared_garage_vehicles(text) to anon, authenticated;
grant execute on function create_garage_share_link(uuid, timestamptz, integer) to authenticated;
grant execute on function revoke_garage_share_link(uuid) to authenticated;
grant execute on function accept_garage_invite(text) to authenticated;
grant execute on function get_accessible_garage_vehicles() to authenticated;
grant execute on function copy_garage_vehicle_to_user(uuid, uuid) to authenticated;
