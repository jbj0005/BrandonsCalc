-- Shared vehicles imported from share links into a user's library
-- Mirrors public.vehicles fields plus sharing metadata

create table if not exists public.shared_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  shared_from_owner_id uuid null,
  shared_from_vehicle_id uuid null,
  share_token text null,
  source_type text check (source_type in ('garage', 'saved')) default 'garage',
  vehicle text null,
  year integer null,
  make text null,
  model text null,
  asking_price numeric null,
  inserted_at timestamptz default now(),
  mileage bigint null,
  trim text null,
  dealer_name text null,
  dealer_street text null,
  dealer_city text null,
  dealer_state text null,
  dealer_zip text null,
  dealer_phone text null,
  dealer_lat double precision null,
  dealer_lng double precision null,
  listing_id text null,
  listing_source text null,
  listing_url text null,
  vin text null,
  heading text null,
  photo_url text null,
  marketcheck_payload jsonb null,
  condition text null,
  dealer_stock text null,
  imported_at timestamptz default now(),
  constraint shared_vehicles_user_fk foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists idx_shared_vehicles_user_id on public.shared_vehicles (user_id);
create index if not exists idx_shared_vehicles_vin on public.shared_vehicles (vin);
create unique index if not exists shared_vehicles_user_vehicle_unique
  on public.shared_vehicles (user_id, shared_from_vehicle_id)
  where shared_from_vehicle_id is not null;
create unique index if not exists shared_vehicles_user_vin_unique
  on public.shared_vehicles (user_id, vin)
  where vin is not null;
