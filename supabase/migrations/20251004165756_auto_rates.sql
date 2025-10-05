-- Navy Federal Credit Union auto rate storage
-- Run this script in the Supabase SQL editor or via supabase db push
-- before running scripts/fetch-nfcu-rates.mjs.

create table if not exists public.auto_rates (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text,
  loan_type text not null check (loan_type in ('new', 'used')),
  term_label text not null,
  term_range_min smallint not null,
  term_range_max smallint not null,
  credit_tier text not null,
  credit_tier_label text not null,
  credit_score_min smallint not null,
  credit_score_max smallint not null,
  base_apr_percent numeric(6,3) not null,
  apr_adjustment numeric(5,2) not null default 0,
  apr_percent numeric(6,3) not null,
  effective_at date,
  created_at timestamptz not null default now()
);

create unique index if not exists auto_rates_source_unique
  on public.auto_rates (
    source,
    loan_type,
    term_range_min,
    term_range_max,
    credit_tier,
    credit_score_min,
    credit_score_max
  );

alter table public.auto_rates enable row level security;

create policy "auto_rates_public_read"
  on public.auto_rates
  for select
  using (true);

create policy "auto_rates_authenticated_write"
  on public.auto_rates
  for all
  to authenticated
  using (true)
  with check (true);
