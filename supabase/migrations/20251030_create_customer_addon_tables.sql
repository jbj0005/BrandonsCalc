-- Create customer_addon_sets table (similar to dealer_fee_sets and gov_fee_sets)
create table if not exists customer_addon_sets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table customer_addon_sets enable row level security;

-- Allow public read access to customer addons
create policy "allow_public_read_customer_addons"
on customer_addon_sets
for select
using (true);

-- Only service role can modify
create policy "service_role_only_modify"
on customer_addon_sets
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

comment on table customer_addon_sets is 'Customer add-on fee sets (Extended Warranty, GAP Coverage, Tire Package, etc.)';

-- Create customer_addon_items_v view (similar to dealer_fee_items_v and gov_fee_items_v)
create or replace view customer_addon_items_v as
select
  s.id as set_id,
  s.label as set_label,
  (item->>'name')::text as name,
  (item->>'amount')::numeric as amount,
  (item->>'sort_order')::integer as sort_order
from
  customer_addon_sets s,
  jsonb_array_elements(s.items) as item
where
  s.active = true
order by
  s.id,
  (item->>'sort_order')::integer nulls last,
  (item->>'name')::text;

comment on view customer_addon_items_v is 'Flattened view of customer addon items from active sets';

-- Insert default customer addon set with common items
insert into customer_addon_sets (label, items, active)
values (
  'Default Customer Add-ons',
  '[
    {"name": "Extended Warranty", "amount": 2500, "sort_order": 1},
    {"name": "Tire Package", "amount": 1200, "sort_order": 2},
    {"name": "GAP Coverage", "amount": 895, "sort_order": 3},
    {"name": "Paint Protection", "amount": 695, "sort_order": 4},
    {"name": "Fabric Protection", "amount": 495, "sort_order": 5},
    {"name": "Window Tint", "amount": 450, "sort_order": 6},
    {"name": "Wheel & Tire Protection", "amount": 850, "sort_order": 7},
    {"name": "Maintenance Package", "amount": 1500, "sort_order": 8}
  ]'::jsonb,
  true
)
on conflict (id) do nothing;
