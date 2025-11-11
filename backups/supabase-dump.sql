--
-- PostgreSQL database dump
--

\restrict S5gC1aQKzIkuvl14BfjLOhTrzjrO8HS8qORCkFuxI8Mls7HQgzp0FajQyjViB1q

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activate_dealer_fee_set(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_dealer_fee_set(p_state text, p_set_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare v_id uuid;
begin
  if p_set_id is null then
    select id into v_id from public.dealer_fee_sets where applies_state_code = p_state and label = p_label;
  else v_id := p_set_id; end if;
  if v_id is null then raise exception 'dealer_fee_sets target not found for state=%', p_state; end if;

  update public.dealer_fee_sets
     set active = false
   where applies_state_code = p_state and active is true and id <> v_id;
  update public.dealer_fee_sets set active = true where id = v_id;
  return v_id;
end $$;


--
-- Name: activate_gov_fee_set(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_gov_fee_set(p_state text, p_set_id uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare v_id uuid;
begin
  if p_set_id is null then
    select id into v_id from public.gov_fee_sets where applies_state_code = p_state and label = p_label;
  else v_id := p_set_id; end if;
  if v_id is null then raise exception 'gov_fee_sets target not found for state=%', p_state; end if;

  update public.gov_fee_sets
     set active = false
   where applies_state_code = p_state and active is true and id <> v_id;
  update public.gov_fee_sets set active = true where id = v_id;
  return v_id;
end $$;


--
-- Name: county_surtax_on(text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.county_surtax_on(p_state text, p_county text, p_on date) RETURNS numeric
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_total numeric;
  v_sum numeric;
begin
  -- Prefer an active 'total' window on date; choose the most recent effective_date
  select w.rate_decimal into v_total
  from public.county_surtax_windows w
  where w.state_code = p_state
    and w.county_name ilike p_county
    and w.component_label = 'total'
    and w.effective_date <= p_on
    and (w.expiration_date is null or p_on <= w.expiration_date)
  order by w.effective_date desc
  limit 1;

  if v_total is not null then
    return coalesce(v_total, 0);
  end if;

  -- Otherwise sum active 'component' windows
  select coalesce(sum(w.rate_decimal), 0) into v_sum
  from public.county_surtax_windows w
  where w.state_code = p_state
    and w.county_name ilike p_county
    and w.component_label = 'component'
    and w.effective_date <= p_on
    and (w.expiration_date is null or p_on <= w.expiration_date);

  return coalesce(v_sum, 0);
end $$;


--
-- Name: dealer_fee_sets_validate_t(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dealer_fee_sets_validate_t() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin perform public.validate_dealer_fee_items(new.items); return new; end $$;


--
-- Name: gov_fee_sets_validate_t(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gov_fee_sets_validate_t() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin perform public.validate_gov_fee_items(new.items); return new; end $$;


--
-- Name: increment_garage_vehicle_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_garage_vehicle_usage(vehicle_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE garage_vehicles
  SET
    times_used = COALESCE(times_used, 0) + 1,
    last_used_at = NOW()
  WHERE id = vehicle_id;
END;
$$;


--
-- Name: increment_salesperson_usage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_salesperson_usage(salesperson_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE salesperson_contacts
  SET
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE id = salesperson_id;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;


--
-- Name: show_jwt_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.show_jwt_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$ select current_setting('request.jwt.claim.role', true) $$;


--
-- Name: update_customer_last_used(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customer_last_used(profile_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE customer_profiles
  SET last_used_at = NOW()
  WHERE id = profile_id;
END;
$$;


--
-- Name: update_garage_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_garage_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END$$;


--
-- Name: upsert_dealer_fee_set(text, text, jsonb, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_dealer_fee_set(p_state text, p_label text, p_items jsonb, p_version text DEFAULT NULL::text, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare v_id uuid;
begin
  insert into public.dealer_fee_sets (applies_state_code, label, items, version, active)
  values (p_state, p_label, p_items, p_version, coalesce(p_active, true))
  on conflict (applies_state_code, label) do update
    set items = excluded.items,
        version = coalesce(excluded.version, public.dealer_fee_sets.version),
        active  = coalesce(excluded.active,  public.dealer_fee_sets.active);
  select id into v_id from public.dealer_fee_sets where applies_state_code = p_state and label = p_label;
  return v_id;
end $$;


--
-- Name: upsert_gov_fee_set(text, text, jsonb, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_gov_fee_set(p_state text, p_label text, p_items jsonb, p_county_fips text DEFAULT NULL::text, p_version text DEFAULT NULL::text, p_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare v_id uuid;
begin
  insert into public.gov_fee_sets (applies_state_code, label, items, applies_county_fips, version, active)
  values (p_state, p_label, p_items, p_county_fips, p_version, coalesce(p_active, true))
  on conflict (applies_state_code, label) do update
    set items = excluded.items,
        applies_county_fips = coalesce(excluded.applies_county_fips, public.gov_fee_sets.applies_county_fips),
        version = coalesce(excluded.version, public.gov_fee_sets.version),
        active = coalesce(excluded.active, public.gov_fee_sets.active);
  select id into v_id from public.gov_fee_sets where applies_state_code = p_state and label = p_label;
  return v_id;
end $$;


--
-- Name: validate_dealer_fee_items(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_dealer_fee_items(p_items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare r jsonb; nm text; amt numeric; ord int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'dealer_fee_sets.items must be a JSON array';
  end if;
  for r in select elem from jsonb_array_elements(p_items) as t(elem) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'Each dealer fee item must be an object'; end if;
    nm := btrim(r->>'name'); if nm is null or nm = '' then raise exception 'Dealer fee item.name required'; end if;
    if (r ? 'amount') then
      if jsonb_typeof(r->'amount') <> 'number' then raise exception 'Dealer fee item.amount numeric'; end if;
      amt := (r->>'amount')::numeric; if amt < 0 then raise exception 'Dealer fee item.amount >= 0'; end if;
    end if;
    if (r ? 'taxable') and jsonb_typeof(r->'taxable') <> 'boolean' then raise exception 'Dealer item.taxable boolean'; end if;
    if (r ? 'category') and jsonb_typeof(r->'category') <> 'string' then raise exception 'Dealer item.category string'; end if;
    if (r ? 'order') then
      if jsonb_typeof(r->'order') <> 'number' then raise exception 'Dealer item.order numeric'; end if;
      ord := (r->>'order')::int; if ord < 0 then raise exception 'Dealer item.order >= 0'; end if;
    end if;
  end loop;
end $$;


--
-- Name: validate_gov_fee_items(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gov_fee_items(p_items jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare r jsonb; nm text; amt numeric; ord int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'gov_fee_sets.items must be a JSON array';
  end if;
  for r in select elem from jsonb_array_elements(p_items) as t(elem) loop
    if jsonb_typeof(r) <> 'object' then raise exception 'Each gov fee item must be an object'; end if;
    nm := btrim(r->>'name'); if nm is null or nm = '' then raise exception 'Gov fee item.name required'; end if;
    if not (r ? 'amount') then raise exception 'Gov fee item.amount required'; end if;
    if jsonb_typeof(r->'amount') <> 'number' then raise exception 'Gov fee item.amount must be numeric'; end if;
    amt := (r->>'amount')::numeric; if amt < 0 then raise exception 'Gov fee item.amount >= 0'; end if;
    if (r ? 'category') and jsonb_typeof(r->'category') <> 'string' then raise exception 'Gov fee item.category must be string'; end if;
    if (r ? 'order') then
      if jsonb_typeof(r->'order') <> 'number' then raise exception 'Gov fee item.order must be numeric'; end if;
      ord := (r->>'order')::int; if ord < 0 then raise exception 'Gov fee item.order >= 0'; end if;
    end if;
  end loop;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auto_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    source_url text,
    loan_type text DEFAULT 'purchase'::text NOT NULL,
    term_label text NOT NULL,
    term_range_min smallint NOT NULL,
    term_range_max smallint NOT NULL,
    credit_tier text NOT NULL,
    credit_tier_label text NOT NULL,
    credit_score_min smallint NOT NULL,
    credit_score_max smallint NOT NULL,
    base_apr_percent numeric(6,3) NOT NULL,
    apr_adjustment numeric(5,2) DEFAULT 0 NOT NULL,
    apr_percent numeric(6,3) NOT NULL,
    effective_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    vehicle_condition text,
    term_months_min integer,
    term_months_max integer,
    CONSTRAINT auto_rates_loan_type_check CHECK ((loan_type = ANY (ARRAY['purchase'::text, 'refinance'::text])))
);


--
-- Name: county_surtax_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.county_surtax_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    county_fips text,
    state_code text NOT NULL,
    county_name text NOT NULL,
    component_label text NOT NULL,
    rate_decimal numeric DEFAULT 0 NOT NULL,
    effective_date date NOT NULL,
    expiration_date date,
    source_file text,
    source_version text,
    inserted_at timestamp with time zone DEFAULT now(),
    CONSTRAINT county_surtax_windows_component_label_check CHECK ((component_label = ANY (ARRAY['total'::text, 'component'::text])))
);


--
-- Name: customer_addon_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addon_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: TABLE customer_addon_sets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_addon_sets IS 'Customer add-on fee sets (Extended Warranty, GAP Coverage, Tire Package, etc.)';


--
-- Name: customer_addon_items_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_addon_items_v WITH (security_invoker='on') AS
 SELECT s.id AS set_id,
    s.label AS set_label,
    (item.value ->> 'name'::text) AS name,
    ((item.value ->> 'amount'::text))::numeric AS amount,
    ((item.value ->> 'sort_order'::text))::integer AS sort_order
   FROM public.customer_addon_sets s,
    LATERAL jsonb_array_elements(s.items) item(value)
  WHERE (s.active = true)
  ORDER BY s.id, ((item.value ->> 'sort_order'::text))::integer, (item.value ->> 'name'::text);


--
-- Name: VIEW customer_addon_items_v; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.customer_addon_items_v IS 'Flattened view of customer addon items from active sets';


--
-- Name: customer_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_profile_id uuid NOT NULL,
    offer_name text DEFAULT 'Untitled Offer'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    vehicle_year integer,
    vehicle_make text,
    vehicle_model text,
    vehicle_trim text,
    vehicle_vin text,
    vehicle_mileage integer,
    vehicle_condition text,
    dealer_name text,
    dealer_address text,
    dealer_phone text,
    offer_price numeric(10,2),
    down_payment numeric(10,2),
    trade_in_details jsonb,
    apr numeric(5,4),
    term_months integer,
    monthly_payment numeric(10,2),
    offer_text text,
    customer_name text,
    customer_email text,
    customer_phone text,
    customer_address text,
    submitted_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    vehicle_price numeric(10,2),
    trade_value numeric(10,2),
    trade_payoff numeric(10,2),
    dealer_fees numeric(10,2),
    customer_addons numeric(10,2),
    offer_preview_html text,
    CONSTRAINT customer_offers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
);


--
-- Name: COLUMN customer_offers.offer_preview_html; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_offers.offer_preview_html IS 'Stores the HTML preview of the offer as shown in the Submit Offer modal';


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    full_name text,
    email text,
    phone text,
    street_address text,
    city text,
    state text,
    state_code text,
    zip_code text,
    county text,
    county_name text,
    google_place_id text,
    preferred_lender_id text,
    preferred_term integer DEFAULT 72,
    credit_score_range text,
    last_used_at timestamp with time zone DEFAULT now(),
    preferred_down_payment numeric(10,2),
    user_id uuid,
    first_name text,
    last_name text,
    preferred_trade_value numeric(10,2),
    preferred_trade_payoff numeric(10,2)
);


--
-- Name: TABLE customer_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_profiles IS 'Stores customer contact information for auto-population across the app';


--
-- Name: COLUMN customer_profiles.google_place_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_profiles.google_place_id IS 'Google Places API reference for address validation';


--
-- Name: COLUMN customer_profiles.preferred_down_payment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_profiles.preferred_down_payment IS 'User''s typical down payment amount';


--
-- Name: COLUMN customer_profiles.preferred_trade_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_profiles.preferred_trade_value IS 'Expected value of user''s trade-in vehicle';


--
-- Name: COLUMN customer_profiles.preferred_trade_payoff; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_profiles.preferred_trade_payoff IS 'Amount owed on user''s trade-in vehicle';


--
-- Name: dealer_fee_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dealer_fee_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    applies_state_code text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    version text,
    active boolean DEFAULT true,
    inserted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dealer_fee_sets_items_is_array CHECK ((jsonb_typeof(items) = 'array'::text))
);


--
-- Name: dealer_fee_items_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dealer_fee_items_v WITH (security_invoker='on') AS
 SELECT s.id AS set_id,
    s.label AS set_label,
    s.applies_state_code,
    COALESCE(((it.elem ->> 'order'::text))::integer, (it.ordinality)::integer) AS sort_order,
    (it.elem ->> 'name'::text) AS name,
    COALESCE(((it.elem ->> 'amount'::text))::numeric, (0)::numeric) AS amount,
        CASE
            WHEN (it.elem ? 'taxable'::text) THEN ((it.elem ->> 'taxable'::text))::boolean
            ELSE NULL::boolean
        END AS taxable,
    (it.elem ->> 'category'::text) AS category
   FROM (public.dealer_fee_sets s
     CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY it(elem, ordinality));


--
-- Name: garage_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.garage_vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    "trim" text,
    vin text,
    mileage integer,
    condition text,
    estimated_value numeric(10,2),
    payoff_amount numeric(10,2) DEFAULT 0,
    photo_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    nickname text,
    times_used integer DEFAULT 0,
    last_used_at timestamp with time zone,
    CONSTRAINT garage_vehicles_condition_check CHECK ((condition = ANY (ARRAY['excellent'::text, 'good'::text, 'fair'::text, 'poor'::text])))
);


--
-- Name: gov_fee_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gov_fee_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    applies_state_code text,
    applies_county_fips text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    version text,
    active boolean DEFAULT true,
    inserted_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gov_fee_sets_items_is_array CHECK ((jsonb_typeof(items) = 'array'::text))
);


--
-- Name: gov_fee_items_v; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.gov_fee_items_v WITH (security_invoker='on') AS
 SELECT s.id AS set_id,
    s.label AS set_label,
    s.applies_state_code,
    s.applies_county_fips,
    COALESCE(((it.elem ->> 'order'::text))::integer, (it.ordinality)::integer) AS sort_order,
    (it.elem ->> 'name'::text) AS name,
    (it.elem ->> 'category'::text) AS category,
    COALESCE(((it.elem ->> 'amount'::text))::numeric, (0)::numeric) AS amount
   FROM (public.gov_fee_sets s
     CROSS JOIN LATERAL jsonb_array_elements(s.items) WITH ORDINALITY it(elem, ordinality));


--
-- Name: marketcheck_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketcheck_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vin text NOT NULL,
    mc_response jsonb NOT NULL,
    mc_listing_id text,
    mc_search_source text,
    cached_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true,
    api_calls_saved integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: offer_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submitted_at timestamp with time zone DEFAULT now(),
    saved_offer_id uuid,
    salesperson_id uuid,
    submission_method text,
    formatted_text text,
    recipient_contact text,
    dealer_response text,
    dealer_response_at timestamp with time zone,
    notes text
);


--
-- Name: TABLE offer_submissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.offer_submissions IS 'Tracks when offers are submitted to dealers with submission details';


--
-- Name: COLUMN offer_submissions.formatted_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.offer_submissions.formatted_text IS 'The actual formatted text that was shared/sent';


--
-- Name: salesperson_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salesperson_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    full_name text NOT NULL,
    dealership_name text,
    phone text,
    email text,
    times_used integer DEFAULT 1,
    last_used_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE salesperson_contacts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.salesperson_contacts IS 'Stores salesperson/dealer contacts with usage tracking for auto-complete';


--
-- Name: saved_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_profile_id uuid,
    salesperson_id uuid,
    offer_name text,
    status text DEFAULT 'draft'::text,
    vehicle_year integer,
    vehicle_make text,
    vehicle_model text,
    vehicle_trim text,
    vehicle_vin text,
    vehicle_condition text,
    vehicle_mileage integer,
    sale_price numeric(10,2),
    down_payment numeric(10,2),
    has_tradein boolean DEFAULT false,
    tradein_year integer,
    tradein_make text,
    tradein_model text,
    tradein_vin text,
    tradein_allowance numeric(10,2),
    tradein_payoff numeric(10,2),
    tradein_net numeric(10,2),
    term integer,
    apr numeric(5,4),
    monthly_payment numeric(10,2),
    finance_charge numeric(10,2),
    amount_financed numeric(10,2),
    total_of_payments numeric(10,2),
    lender_id text,
    lender_name text,
    fees jsonb,
    state_code text,
    county_name text,
    wizard_state jsonb NOT NULL,
    customer_notes text,
    last_viewed_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE saved_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.saved_offers IS 'Stores complete offer state for recall, comparison, and submission';


--
-- Name: COLUMN saved_offers.fees; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.saved_offers.fees IS 'Flexible JSONB storage for all fee types';


--
-- Name: COLUMN saved_offers.wizard_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.saved_offers.wizard_state IS 'Complete serialized wizardData object for perfect restoration';


--
-- Name: secure_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secure_settings (
    name text NOT NULL,
    secret text NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: TABLE secure_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.secure_settings IS 'Key-value store for server-only secrets (service role access only).';


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid(),
    vehicle text,
    year integer,
    make text,
    model text,
    asking_price numeric,
    inserted_at timestamp with time zone DEFAULT now(),
    mileage bigint,
    "trim" text,
    dealer_name text,
    dealer_street text,
    dealer_city text,
    dealer_state text,
    dealer_zip text,
    dealer_phone text,
    dealer_lat double precision,
    dealer_lng double precision,
    listing_id text,
    listing_source text,
    listing_url text,
    vin text,
    heading text,
    photo_url text,
    marketcheck_payload jsonb,
    condition text
);


--
-- Name: COLUMN vehicles.condition; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vehicles.condition IS 'Vehicle condition (e.g., New, Used, Certified)';


--
-- Data for Name: auto_rates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auto_rates (id, source, source_url, loan_type, term_label, term_range_min, term_range_max, credit_tier, credit_tier_label, credit_score_min, credit_score_max, base_apr_percent, apr_adjustment, apr_percent, effective_at, created_at, vehicle_condition, term_months_min, term_months_max) FROM stdin;
2b5a6f7a-d4bd-4051-b516-75d75fd17750	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	0-36 Months	0	36	ALL_new_0_36_389	All Scores (new)	0	850	3.890	0.00	3.890	2025-11-08	2025-11-08 21:10:18.052838+00	new	0	36
3e45f313-35e8-450e-844a-d064c5198cfa	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	0-36 Months	0	36	ALL_used_0_36_479	All Scores (used)	0	850	4.790	0.00	4.790	2025-11-08	2025-11-08 21:10:18.052838+00	used	0	36
ff31b4f4-c840-49bd-b7a8-251e2ba2e840	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	37-60 Months	37	60	ALL_new_37_60_429	All Scores (new)	0	850	4.290	0.00	4.290	2025-11-08	2025-11-08 21:10:18.052838+00	new	37	60
07371143-1c41-4e73-9a6b-b2eb098f2235	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	37-60 Months	37	60	ALL_used_37_60_529	All Scores (used)	0	850	5.290	0.00	5.290	2025-11-08	2025-11-08 21:10:18.052838+00	used	37	60
f9696a4e-4941-47b6-9287-d3428650770d	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	61-72 Months	61	72	ALL_new_61_72_459	All Scores (new)	0	850	4.590	0.00	4.590	2025-11-08	2025-11-08 21:10:18.052838+00	new	61	72
2f9631c8-2a39-46f1-8829-e8171994384a	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	61-72 Months	61	72	ALL_used_61_72_539	All Scores (used)	0	850	5.390	0.00	5.390	2025-11-08	2025-11-08 21:10:18.052838+00	used	61	72
315da943-ca6d-4dfd-bdf1-4b6ea7ab8c22	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	73-84 Months	73	84	ALL_new_73_84_649	All Scores (new)	0	850	6.490	0.00	6.490	2025-11-08	2025-11-08 21:10:18.052838+00	new	73	84
235d668b-7841-417f-8ab3-90697d03b593	nfcu	https://www.navyfederal.org/loans-cards/auto-loans.html	purchase	85-96 Months	85	96	ALL_new_85_96_739	All Scores (new)	0	850	7.390	0.00	7.390	2025-11-08	2025-11-08 21:10:18.052838+00	new	85	96
7951ce4a-0bc9-4bba-b29e-8b9e2ae8db01	LAUNCH	\N	purchase	36-84 months	36	84	ALL_new_36_84_525	All Scores (new)	300	850	5.250	0.00	5.250	2025-10-30	2025-10-30 18:30:28.018652+00	new	\N	\N
792ce1c9-5344-4a8c-9fe9-2b0d534eed89	LAUNCH	\N	purchase	36-84 months	36	84	ALL_used_36_84_550	All Scores (used)	300	850	5.500	0.00	5.500	2025-10-30	2025-10-30 18:30:28.018652+00	used	\N	\N
99e5a492-ba16-4dee-bde2-522b238415ea	sccu	https://www.sccu.com/personal/consumer-rates	purchase	48 Months	48	48	ALL_new_48_48_549	All Scores (new)	0	850	5.490	0.00	5.490	2025-10-03	2025-11-10 06:20:29.73181+00	new	48	48
c53078e7-aed4-4ebc-9c71-94e91077e9de	sccu	https://www.sccu.com/personal/consumer-rates	purchase	66 Months	66	66	ALL_new_66_66_599	All Scores (new)	0	850	5.990	0.00	5.990	2025-10-03	2025-11-10 06:20:29.73181+00	new	66	66
f9473122-48c3-4ef0-9e05-a24dd5eef4aa	sccu	https://www.sccu.com/personal/consumer-rates	purchase	75 Months	75	75	ALL_new_75_75_649	All Scores (new)	0	850	6.490	0.00	6.490	2025-10-03	2025-11-10 06:20:29.73181+00	new	75	75
cb6ce4f5-2726-49e4-8f7e-47cab663c79d	sccu	https://www.sccu.com/personal/consumer-rates	purchase	84 Months	84	84	ALL_new_84_84_674	All Scores (new)	0	850	6.740	0.00	6.740	2025-10-03	2025-11-10 06:20:29.73181+00	new	84	84
a2ca8d57-7816-4d51-9136-6bd26515e187	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	36 Months	36	36	ALL_new_36_36_474	All Scores (new)	0	850	4.740	0.00	4.740	2025-11-10	2025-11-10 06:20:29.73181+00	new	36	36
e6b668b2-49bf-4383-a5e6-7108464d2134	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	36 Months	36	36	ALL_used_36_36_474	All Scores (used)	0	850	4.740	0.00	4.740	2025-11-10	2025-11-10 06:20:29.73181+00	used	36	36
f6cc4b84-a4ff-4b49-976d-64a082d2404d	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	48 Months	48	48	ALL_new_48_48_499	All Scores (new)	0	850	4.990	0.00	4.990	2025-11-10	2025-11-10 06:20:29.73181+00	new	48	48
29e96cdd-c38a-4745-9de2-6a90a93792a2	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	48 Months	48	48	ALL_used_48_48_499	All Scores (used)	0	850	4.990	0.00	4.990	2025-11-10	2025-11-10 06:20:29.73181+00	used	48	48
27394628-0c1e-4bc8-ad78-e8c9d0749c08	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	48 Months	48	48	ALL_new_48_48_529	All Scores (new)	0	850	5.290	0.00	5.290	2025-11-10	2025-11-10 06:20:29.73181+00	new	48	48
568f803b-5cdd-4ec3-9560-98f0f923a864	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	48 Months	48	48	ALL_used_48_48_529	All Scores (used)	0	850	5.290	0.00	5.290	2025-11-10	2025-11-10 06:20:29.73181+00	used	48	48
5b679363-a5f2-42e8-a196-36a95f836171	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	60 Months	60	60	ALL_new_60_60_514	All Scores (new)	0	850	5.140	0.00	5.140	2025-11-10	2025-11-10 06:20:29.73181+00	new	60	60
e77c91a4-3559-4935-a55f-ac12fc16c350	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	60 Months	60	60	ALL_used_60_60_514	All Scores (used)	0	850	5.140	0.00	5.140	2025-11-10	2025-11-10 06:20:29.73181+00	used	60	60
7e25feb3-021c-4bcf-a566-0e4675b8d5db	penfed	\N	purchase	3 Months	3	3	ALL_NEW_36MONTHS	All Scores (36 Months)	0	850	3.390	0.00	3.390	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
1587f5e0-ceb9-4b52-bdf3-a85b2c30f4a6	penfed	\N	refinance	3 Months	3	3	ALL_NEW_36MONTHS	All Scores (36 Months)	0	850	3.390	0.00	3.390	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
b7b68463-f719-47ed-86e1-2c97a4746015	penfed	\N	purchase	3 Months	3	3	ALL_USED_36MONTHS	All Scores (36 Months)	0	850	3.390	0.00	3.390	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
1f212282-a8ac-4606-8c26-164b18f76b91	penfed	\N	refinance	3 Months	3	3	ALL_USED_36MONTHS	All Scores (36 Months)	0	850	3.390	0.00	3.390	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
04bc2128-9335-466e-b391-cf76be683b84	penfed	\N	purchase	3 Months	3	3	ALL_NEW_48MONTHS	All Scores (48 Months)	0	850	3.790	0.00	3.790	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
92d4a9ef-a52e-4e99-8f54-df3a4ff49b37	penfed	\N	refinance	3 Months	3	3	ALL_NEW_48MONTHS	All Scores (48 Months)	0	850	3.790	0.00	3.790	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
f78f2526-ed71-439f-b587-1049cd889ea9	penfed	\N	purchase	3 Months	3	3	ALL_USED_48MONTHS	All Scores (48 Months)	0	850	3.790	0.00	3.790	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
d1fad95e-0f27-4737-b0cd-e1b5c81ab26f	penfed	\N	refinance	3 Months	3	3	ALL_USED_48MONTHS	All Scores (48 Months)	0	850	3.790	0.00	3.790	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
b87a23f9-a903-4fba-ab1e-a5ea9a959d99	penfed	\N	purchase	3 Months	3	3	ALL_NEW_60MONTHS	All Scores (60 Months)	0	850	3.840	0.00	3.840	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
452d1099-0383-4ac2-9333-f4b41e15f6bc	penfed	\N	refinance	3 Months	3	3	ALL_NEW_60MONTHS	All Scores (60 Months)	0	850	3.840	0.00	3.840	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
8b378a46-56e8-422d-b289-ce0de501c306	penfed	\N	purchase	3 Months	3	3	ALL_USED_60MONTHS	All Scores (60 Months)	0	850	3.840	0.00	3.840	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
8f1a86b4-a19b-4807-b867-fa6973ca988f	penfed	\N	refinance	3 Months	3	3	ALL_USED_60MONTHS	All Scores (60 Months)	0	850	3.840	0.00	3.840	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
ebac69d3-7607-46b2-b77a-b650a4da6ee1	penfed	\N	purchase	3 Months	3	3	ALL_NEW_72MONTHS	All Scores (72 Months)	0	850	4.540	0.00	4.540	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
28645889-d9a2-48bf-b379-840e864f1379	penfed	\N	refinance	3 Months	3	3	ALL_NEW_72MONTHS	All Scores (72 Months)	0	850	4.540	0.00	4.540	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
163be7a9-82c0-45ae-aead-fe3767dbc687	penfed	\N	purchase	3 Months	3	3	ALL_USED_72MONTHS	All Scores (72 Months)	0	850	4.540	0.00	4.540	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
ca4c6992-4ac1-4976-a3a5-c25c31683ec3	penfed	\N	refinance	3 Months	3	3	ALL_USED_72MONTHS	All Scores (72 Months)	0	850	4.540	0.00	4.540	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
74644295-0e9e-4951-9236-f7125bc072bf	penfed	\N	purchase	3 Months	3	3	ALL_NEW_84MONTHS	All Scores (84 Months)	0	850	5.640	0.00	5.640	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
5e9dcf35-f64f-4ce4-93a5-a8eefc518d65	penfed	\N	refinance	3 Months	3	3	ALL_NEW_84MONTHS	All Scores (84 Months)	0	850	5.640	0.00	5.640	2025-11-04	2025-11-04 03:19:26.310917+00	new	3	3
11fa01a3-5b99-461d-aa7e-9bab4bd5d588	penfed	\N	purchase	3 Months	3	3	ALL_USED_84MONTHS	All Scores (84 Months)	0	850	5.640	0.00	5.640	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
c49c1c10-2647-44f4-a3cb-22bdb257c8d9	penfed	\N	refinance	3 Months	3	3	ALL_USED_84MONTHS	All Scores (84 Months)	0	850	5.640	0.00	5.640	2025-11-04	2025-11-04 03:19:26.310917+00	used	3	3
a2c5fe5e-ba72-4453-a4f4-91724a6c7cd9	penfed	\N	purchase	4 Months	4	4	ALL_NEW_36MONTHS	All Scores (36 Months)	0	850	4.190	0.00	4.190	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
6fe9ea86-96c3-499f-8372-a5b38e718fd3	penfed	\N	refinance	4 Months	4	4	ALL_NEW_36MONTHS	All Scores (36 Months)	0	850	4.190	0.00	4.190	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
4705329b-3b7e-4cef-acc3-d33642fd8c29	penfed	\N	purchase	4 Months	4	4	ALL_USED_36MONTHS	All Scores (36 Months)	0	850	4.190	0.00	4.190	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
5e462d17-81ef-4282-b154-e67c61264fd1	penfed	\N	refinance	4 Months	4	4	ALL_USED_36MONTHS	All Scores (36 Months)	0	850	4.190	0.00	4.190	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
d6d610ee-14f1-43ea-a5eb-f7103d21cacd	penfed	\N	purchase	4 Months	4	4	ALL_NEW_48MONTHS	All Scores (48 Months)	0	850	4.390	0.00	4.390	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
2f5747bd-401c-44a1-949c-c96de885589b	penfed	\N	refinance	4 Months	4	4	ALL_NEW_48MONTHS	All Scores (48 Months)	0	850	4.390	0.00	4.390	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
af6613d0-2150-471a-b81f-a9ebceb7ca09	penfed	\N	purchase	4 Months	4	4	ALL_USED_48MONTHS	All Scores (48 Months)	0	850	4.390	0.00	4.390	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
f0eddcf5-d24e-410b-976f-4fb75f9eebfe	penfed	\N	refinance	4 Months	4	4	ALL_USED_48MONTHS	All Scores (48 Months)	0	850	4.390	0.00	4.390	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
f6912042-fa10-41de-9f23-b4700c1f188c	penfed	\N	purchase	4 Months	4	4	ALL_NEW_60MONTHS	All Scores (60 Months)	0	850	4.440	0.00	4.440	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
4a8a49af-f3b8-40fd-b1a9-ed14894b12e6	penfed	\N	refinance	4 Months	4	4	ALL_NEW_60MONTHS	All Scores (60 Months)	0	850	4.440	0.00	4.440	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
be375d0b-33c3-42cd-9e31-9b6b994e1f71	penfed	\N	purchase	4 Months	4	4	ALL_USED_60MONTHS	All Scores (60 Months)	0	850	4.440	0.00	4.440	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
e6c03ac7-00c5-442b-b584-43cafef62c63	penfed	\N	refinance	4 Months	4	4	ALL_USED_60MONTHS	All Scores (60 Months)	0	850	4.440	0.00	4.440	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
5a8244dd-88da-4b46-9028-911c72546e8a	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	60 Months	60	60	ALL_new_60_60_549	All Scores (new)	0	850	5.490	0.00	5.490	2025-11-10	2025-11-10 06:20:29.73181+00	new	60	60
e175e666-bb83-4de8-ae7b-f62740b0fbe2	penfed	\N	purchase	4 Months	4	4	ALL_NEW_72MONTHS	All Scores (72 Months)	0	850	4.790	0.00	4.790	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
a9fad6e7-edee-4020-92d2-1d2c5e33dda8	lcu	https://www.launchcu.com/rates/?utm_source=google&utm_medium=performance_max&utm_campaign=sitelink&campaignid=23077883989&adgroupid=187859243882&adid=776752204224&gad_source=1&gad_campaignid=23077883989&gbraid=0AAAAADfScKHYVEYLaatdOBhAS8VUGxWPs&gclid=CjwKCAjwxrLHBhA2EiwAu9EdM71-fhO7jLJi01y8dcDrk8If15uHjSVtZByR9PIB4BQ_DSUzL3LLExoC4VoQAvD_BwE	purchase	10 Months	10	10	ALL_NEW_BUSINESSPREMIERCHECKINGRATES	All Scores (Business Premier Checking Rates)	0	850	30.000	0.00	30.000	2025-10-13	2025-10-13 20:24:59.482973+00	new	10	10
dc239e9c-11b7-4af0-9d79-73446ba9f305	lcu	https://www.launchcu.com/rates/?utm_source=google&utm_medium=performance_max&utm_campaign=sitelink&campaignid=23077883989&adgroupid=187859243882&adid=776752204224&gad_source=1&gad_campaignid=23077883989&gbraid=0AAAAADfScKHYVEYLaatdOBhAS8VUGxWPs&gclid=CjwKCAjwxrLHBhA2EiwAu9EdM71-fhO7jLJi01y8dcDrk8If15uHjSVtZByR9PIB4BQ_DSUzL3LLExoC4VoQAvD_BwE	refinance	10 Months	10	10	ALL_NEW_BUSINESSPREMIERCHECKINGRATES	All Scores (Business Premier Checking Rates)	0	850	30.000	0.00	30.000	2025-10-13	2025-10-13 20:24:59.482973+00	new	10	10
d0d38255-92f4-4904-9b70-f22714acba97	lcu	https://www.launchcu.com/rates/?utm_source=google&utm_medium=performance_max&utm_campaign=sitelink&campaignid=23077883989&adgroupid=187859243882&adid=776752204224&gad_source=1&gad_campaignid=23077883989&gbraid=0AAAAADfScKHYVEYLaatdOBhAS8VUGxWPs&gclid=CjwKCAjwxrLHBhA2EiwAu9EdM71-fhO7jLJi01y8dcDrk8If15uHjSVtZByR9PIB4BQ_DSUzL3LLExoC4VoQAvD_BwE	purchase	10 Months	10	10	ALL_USED_BUSINESSPREMIERCHECKINGRATES	All Scores (Business Premier Checking Rates)	0	850	30.000	0.00	30.000	2025-10-13	2025-10-13 20:24:59.482973+00	used	10	10
b6e4561b-b064-4805-b922-fd57fc9e544b	lcu	https://www.launchcu.com/rates/?utm_source=google&utm_medium=performance_max&utm_campaign=sitelink&campaignid=23077883989&adgroupid=187859243882&adid=776752204224&gad_source=1&gad_campaignid=23077883989&gbraid=0AAAAADfScKHYVEYLaatdOBhAS8VUGxWPs&gclid=CjwKCAjwxrLHBhA2EiwAu9EdM71-fhO7jLJi01y8dcDrk8If15uHjSVtZByR9PIB4BQ_DSUzL3LLExoC4VoQAvD_BwE	refinance	10 Months	10	10	ALL_USED_BUSINESSPREMIERCHECKINGRATES	All Scores (Business Premier Checking Rates)	0	850	30.000	0.00	30.000	2025-10-13	2025-10-13 20:24:59.482973+00	used	10	10
43faedf2-4422-4343-9852-aaf13db7ac55	penfed	\N	refinance	4 Months	4	4	ALL_NEW_72MONTHS	All Scores (72 Months)	0	850	4.790	0.00	4.790	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
7fc313f8-e469-45e9-8476-e51cb6cce516	penfed	\N	purchase	4 Months	4	4	ALL_USED_72MONTHS	All Scores (72 Months)	0	850	4.790	0.00	4.790	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
c56d0371-7096-4eca-b9d2-4ecf28b2a917	penfed	\N	refinance	4 Months	4	4	ALL_USED_72MONTHS	All Scores (72 Months)	0	850	4.790	0.00	4.790	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
0d0ed421-dfef-41a6-b1fe-c09e1a5f9528	penfed	\N	purchase	4 Months	4	4	ALL_NEW_84MONTHS	All Scores (84 Months)	0	850	5.740	0.00	5.740	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
ebd719d5-55dc-4f17-96f1-10c74b0f35db	penfed	\N	refinance	4 Months	4	4	ALL_NEW_84MONTHS	All Scores (84 Months)	0	850	5.740	0.00	5.740	2025-11-04	2025-11-04 03:19:26.310917+00	new	4	4
e12129e5-554e-4938-aabb-fd66aa717556	penfed	\N	purchase	4 Months	4	4	ALL_USED_84MONTHS	All Scores (84 Months)	0	850	5.740	0.00	5.740	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
eac0392f-cd09-446d-9268-2eff795ae18f	penfed	\N	refinance	4 Months	4	4	ALL_USED_84MONTHS	All Scores (84 Months)	0	850	5.740	0.00	5.740	2025-11-04	2025-11-04 03:19:26.310917+00	used	4	4
03972f52-e13e-4de7-b939-6a5e2920bbd3	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	60 Months	60	60	ALL_used_60_60_549	All Scores (used)	0	850	5.490	0.00	5.490	2025-11-10	2025-11-10 06:20:29.73181+00	used	60	60
f631572b-da68-4b0f-bbb4-eb72fe889d68	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	72 Months	72	72	ALL_new_72_72_534	All Scores (new)	0	850	5.340	0.00	5.340	2025-11-10	2025-11-10 06:20:29.73181+00	new	72	72
21f8327a-beff-4eeb-abe1-974264a6750b	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	72 Months	72	72	ALL_used_72_72_534	All Scores (used)	0	850	5.340	0.00	5.340	2025-11-10	2025-11-10 06:20:29.73181+00	used	72	72
634e33ce-f9c8-4de8-bf43-5ae9357bdd2c	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	72 Months	72	72	ALL_new_72_72_559	All Scores (new)	0	850	5.590	0.00	5.590	2025-11-10	2025-11-10 06:20:29.73181+00	new	72	72
2135bb2d-b26d-486e-91d2-f039531d616a	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	72 Months	72	72	ALL_used_72_72_559	All Scores (used)	0	850	5.590	0.00	5.590	2025-11-10	2025-11-10 06:20:29.73181+00	used	72	72
02c2fb23-705b-4117-8cfd-9377d868e3a3	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	84 Months	84	84	ALL_new_84_84_574	All Scores (new)	0	850	5.740	0.00	5.740	2025-11-10	2025-11-10 06:20:29.73181+00	new	84	84
36b5466a-5ca9-44ac-af73-ee139af56afc	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	84 Months	84	84	ALL_used_84_84_574	All Scores (used)	0	850	5.740	0.00	5.740	2025-11-10	2025-11-10 06:20:29.73181+00	used	84	84
410ba07c-6227-400f-96f6-76732ca6e561	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	84 Months	84	84	ALL_new_84_84_619	All Scores (new)	0	850	6.190	0.00	6.190	2025-11-10	2025-11-10 06:20:29.73181+00	new	84	84
29d8a79b-4879-4543-8297-8cc93f6d3a15	ngfcu	https://www.ngfcu.us/rates/loans/auto	purchase	84 Months	84	84	ALL_used_84_84_619	All Scores (used)	0	850	6.190	0.00	6.190	2025-11-10	2025-11-10 06:20:29.73181+00	used	84	84
60954219-306a-4f55-aea3-00624934605c	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	36 Months	36	36	ALL_new_36_36_499	All Scores (new)	0	850	4.990	0.00	4.990	2025-10-31	2025-11-10 06:20:29.73181+00	new	36	36
fa462626-2517-4a64-a41b-0232006c4b42	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	48 Months	48	48	ALL_new_48_48_524	All Scores (new)	0	850	5.240	0.00	5.240	2025-10-31	2025-11-10 06:20:29.73181+00	new	48	48
d7e3d68a-cf1f-464c-bf0c-1a512a4a7c83	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	60 Months	60	60	ALL_new_60_60_549	All Scores (new)	0	850	5.490	0.00	5.490	2025-10-31	2025-11-10 06:20:29.73181+00	new	60	60
a931bcc6-1c44-4f3d-862c-865b289fb581	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	66 Months	66	66	ALL_new_66_66_574	All Scores (new)	0	850	5.740	0.00	5.740	2025-10-31	2025-11-10 06:20:29.73181+00	new	66	66
cd77a072-a359-4c5a-9178-b5b90f37a14f	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	75 Months	75	75	ALL_new_75_75_624	All Scores (new)	0	850	6.240	0.00	6.240	2025-10-31	2025-11-10 06:20:29.73181+00	new	75	75
4a9bb7fa-0878-4eae-b06b-68eac665ddba	ccufl	https://www.ccuflorida.org/home/rates/loan	purchase	84 Months	84	84	ALL_new_84_84_649	All Scores (new)	0	850	6.490	0.00	6.490	2025-10-31	2025-11-10 06:20:29.73181+00	new	84	84
808bc210-a303-4081-b371-626f81f431c3	launchcu	https://www.launchcu.com/rates/	purchase	36-84 Months	36	84	ALL_used_36_84_550	All Scores (used)	0	850	5.500	0.00	5.500	2025-11-10	2025-11-10 06:20:29.73181+00	used	36	84
e243bd4d-0a6d-4478-a36b-1b99883bc5c9	launchcu	https://www.launchcu.com/rates/	purchase	36-84 Months	36	84	ALL_used_36_84_625	All Scores (used)	0	850	6.250	0.00	6.250	2025-11-10	2025-11-10 06:20:29.73181+00	used	36	84
d32cd959-587a-42f4-9519-acedc76e1f9c	launchcu	https://www.launchcu.com/rates/	purchase	36-65 Months	36	65	ALL_used_36_65_749	All Scores (used)	0	850	7.490	0.00	7.490	2025-11-10	2025-11-10 06:20:29.73181+00	used	36	65
5ec44a98-cbfa-468a-bcbf-c3074f4d8dc7	ccu_mi	https://www.consumerscu.org/rates/lending-rates	purchase	0-68 Months	0	68	ALL_new_0_68_659	All Scores (new)	0	850	6.590	0.00	6.590	2025-11-04	2025-11-04 06:16:54.079593+00	new	0	68
86bf1f20-f999-40ce-b9ca-a0fda8fbfda8	ccu_mi	https://www.consumerscu.org/rates/lending-rates	purchase	69-78 Months	69	78	ALL_new_69_78_699	All Scores (new)	0	850	6.990	0.00	6.990	2025-11-04	2025-11-04 06:16:54.079593+00	new	69	78
7c293c9d-71ae-4162-ad51-959b5a3412c4	ccu_mi	https://www.consumerscu.org/rates/lending-rates	purchase	79-88 Months	79	88	ALL_new_79_88_744	All Scores (new)	0	850	7.440	0.00	7.440	2025-11-04	2025-11-04 06:16:54.079593+00	new	79	88
ea0ebfe0-694c-4b57-9308-710d3415e3bf	ccu_mi	https://www.consumerscu.org/rates/lending-rates	purchase	89-96 Months	89	96	ALL_new_89_96_839	All Scores (new)	0	850	8.390	0.00	8.390	2025-11-04	2025-11-04 06:16:54.079593+00	new	89	96
f889039e-0558-4013-bd08-81f372a23ccf	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-36 Months	0	36	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	36
7daaebc1-a6f3-4c03-8f44-165aec612487	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-36 Months	0	36	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	36
2f7a9bfd-40fb-407e-b038-de531d5eac1e	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-36 Months	0	36	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	36
4fd2500d-fd6a-4676-abcb-c5272d478aaa	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-36 Months	0	36	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	36
fa712c2d-c608-43a8-8d10-09733463fb44	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-48 Months	0	48	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	48
2f8d0613-991d-47eb-9050-ce34998db188	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-48 Months	0	48	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	48
4db16ed4-d868-46c5-9c14-8bce7c9e6700	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-48 Months	0	48	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	48
2b845a9f-5247-42f0-bd5e-8ea21f39ab5b	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-48 Months	0	48	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	48
2f22294d-3aa9-48b3-956d-a7a089bbcd84	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-65 Months	0	65	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	65
dc3c8fd5-a5ac-4f99-ac13-c616ab67d2a8	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-65 Months	0	65	ALL_NEW_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	65
a03e7f70-a994-4cbb-8587-ff0eaad33f66	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-65 Months	0	65	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	65
5964903b-b8bc-40b1-bfa1-86f7c757b4c5	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-65 Months	0	65	ALL_USED_APR	All Scores (APR¹)	0	850	4.990	0.00	4.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	65
15d3af82-cfea-47da-aa37-ba5fd0be0c84	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-72 Months	0	72	ALL_NEW_APR	All Scores (APR¹)	0	850	5.490	0.00	5.490	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	72
ff810b5c-85f0-4511-9a74-a974f737e05e	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-72 Months	0	72	ALL_NEW_APR	All Scores (APR¹)	0	850	5.490	0.00	5.490	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	72
0fad73ef-03e4-4d2b-b8e7-11128804006b	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-72 Months	0	72	ALL_USED_APR	All Scores (APR¹)	0	850	5.490	0.00	5.490	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	72
d08ceb08-1a48-4bb8-a87b-5ebb9ca5ebdc	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-72 Months	0	72	ALL_USED_APR	All Scores (APR¹)	0	850	5.490	0.00	5.490	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	72
f9ea3efe-7725-4946-9119-ee9a46f419b9	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-84 Months	0	84	ALL_NEW_APR	All Scores (APR¹)	0	850	6.990	0.00	6.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	84
105598dd-5fd6-4aa8-942b-6057ad9bd019	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-84 Months	0	84	ALL_NEW_APR	All Scores (APR¹)	0	850	6.990	0.00	6.990	2025-11-03	2025-11-04 03:12:39.772183+00	new	0	84
c473d5ac-432d-4514-91e8-41551b887e38	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	purchase	0-84 Months	0	84	ALL_USED_APR	All Scores (APR¹)	0	850	6.990	0.00	6.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	84
1ae95597-b862-4da6-9a2b-a688f1fb3432	dcu	https://www.dcu.org/borrow/vehicle-loans/auto-loans.html	refinance	0-84 Months	0	84	ALL_USED_APR	All Scores (APR¹)	0	850	6.990	0.00	6.990	2025-11-03	2025-11-04 03:12:39.772183+00	used	0	84
\.


--
-- Data for Name: county_surtax_windows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.county_surtax_windows (id, county_fips, state_code, county_name, component_label, rate_decimal, effective_date, expiration_date, source_file, source_version, inserted_at) FROM stdin;
f87e477d-eb25-44bb-8e8d-4eec4b9c1965	\N	FL	Alachua	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
b8df06bc-cfb6-4cb7-a5a9-96633f287a87	\N	FL	Baker	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
ea0ab396-0204-48f7-99d6-5d5a1e81410e	\N	FL	Bay	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
84d1bfd0-ddd7-4f5c-b1e1-d3ad3ad92dfa	\N	FL	Bradford	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
2d5ce782-50f8-458c-a6d1-9a7a07785dc6	\N	FL	Brevard	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a166c4a7-5471-4e7e-baaa-d7fb0a3bf952	\N	FL	Broward	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
8051b935-8d48-4514-8027-40cf1d694560	\N	FL	Calhoun	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
dee3e924-2e6b-4f70-9cd0-00f9abe6c064	\N	FL	Charlotte	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
4484faef-842e-4afb-a6a0-8b0410212ad7	\N	FL	Clay	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
7726b15d-797f-499c-95ba-6c99d2ac2b85	\N	FL	Columbia	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
d9c9dba5-06b0-43cb-8028-bba26853d8b5	\N	FL	DeSoto	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
32ef6348-0efd-4fe7-91f3-a6a2a797b610	\N	FL	Dixie	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
5c8bb597-a7f0-4ae2-b2e4-48d45140d0e1	\N	FL	Duval	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
77ac8221-dfaf-4e0e-b883-66f3136803bc	\N	FL	Escambia	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
0a147468-07c9-4955-8f71-65f9c878be61	\N	FL	Flagler	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
1137c854-5bb2-4601-81d4-4091fda88daa	\N	FL	Franklin	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
41368eec-19ad-4189-937d-323c054d6c5a	\N	FL	Gadsden	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
01a666ec-aa3d-4d91-94be-8614836749c5	\N	FL	Gilchrist	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
659e2910-ff85-4229-916d-6317846c6f00	\N	FL	Glades	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
9867ee03-cc81-48c1-8c98-ef7918905173	\N	FL	Gulf	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
4dd34710-971a-442d-b34b-fa816cc1f283	\N	FL	Hamilton	total	0.02	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
af8e63ce-06f6-45a5-ae00-885e6a9a12ac	\N	FL	Hardee	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
c7570fdd-e1e5-449d-ad3d-af35fc338dc7	\N	FL	Hendry	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
3ce7d298-6044-4fc0-85d5-528ede62f95d	\N	FL	Highlands	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
97966b2b-8df0-4543-8be2-3f89482bcdb3	\N	FL	Hillsborough	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
fae7f98c-279f-43a1-934c-199ef642ba2a	\N	FL	Holmes	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
5ffe5a19-aa94-416d-94d7-b5016200f45a	\N	FL	Indian River	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
430dcfc9-3094-474b-b0b1-af4ef458f2b9	\N	FL	Jackson	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
03e110e0-54a1-48f7-8049-9c720aae733e	\N	FL	Jefferson	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
cdae95f4-385b-466d-bcd3-7e909c5198ee	\N	FL	Lafayette	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
1cfd4039-73ad-4fba-9cf6-2fc8eaba74be	\N	FL	Lake	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a005f5d9-fa1e-45c0-a214-ab42a446409b	\N	FL	Leon	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a8a84274-9991-49a4-b37e-22d149427c72	\N	FL	Levy	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
66468101-d3b6-4d7d-84e2-58a3ac037275	\N	FL	Liberty	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
7358c4fa-43e4-48fb-a7ed-b608ee7b711e	\N	FL	Madison	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
18995de7-d7d2-421b-8b57-388316c0e20b	\N	FL	Manatee	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
2fdb5316-217f-465b-a284-cabcd4dc3527	\N	FL	Marion	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
3771294f-7553-4f44-9c7c-7aab0a39bb67	\N	FL	Martin	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
c65588b2-5757-4568-8438-4c3c954ad8d8	\N	FL	Miami-Dade	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a1fa8a15-d398-48d4-b0ff-6aac6d1a1bba	\N	FL	Monroe	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
f858604e-e6e6-4f67-a03b-442c57de5ce7	\N	FL	Nassau	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
690606ea-c02d-4719-acb4-b1e63cf96160	\N	FL	Okaloosa	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
084b7323-41ce-4f9d-9f52-7f7eacdd6748	\N	FL	Okeechobee	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
8b706b77-42d7-4546-bf8a-fafe31a56e29	\N	FL	Osceola	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
f5abf2d7-5289-4073-bf15-856c2bf44b2f	\N	FL	Palm Beach	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
698d8fc6-d5a0-495f-bd72-d579f4f82f87	\N	FL	Pasco	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
d9dc57a1-ab6a-43ca-8e95-970b65bca31d	\N	FL	Pinellas	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
59d743f7-88a1-4346-bef1-f27b7279b6d2	\N	FL	Polk	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
6c3689cf-31a8-4b1b-8fcb-12fcbcc3f7dd	\N	FL	Putnam	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
3babb2be-9eb3-46db-b85e-b8e66920c311	\N	FL	St. Lucie	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
5d15af5a-a87f-4232-bc44-3642b3f7aa04	\N	FL	Santa Rosa	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
d7c55405-6a82-4ac4-bb25-b39dbdb13ffa	\N	FL	Sarasota	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a14b45a1-41a0-4555-ab5a-536223f2f25b	\N	FL	Seminole	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
cd4e58fc-858e-470c-8ccf-cd30ad3517de	\N	FL	Sumter	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
082972ea-d374-4c3c-843d-acc156fdd28c	\N	FL	Suwannee	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
bb5f96b1-4c46-4250-8042-040895904e51	\N	FL	Taylor	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
53b5f81e-04ec-43e3-a9ea-8205adf28ba0	\N	FL	Union	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
e4107568-9914-4cb6-a26a-588251fd03b5	\N	FL	Wakulla	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
21d196c2-f936-4ced-8ce5-049d97dd4bd1	\N	FL	Walton	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
0c7be0a2-48e0-43a6-94cf-adc7d4b897f2	\N	FL	Washington	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
6bb6d857-cbe2-4b34-88b0-d9c53a5413e3	\N	FL	Hamilton	total	0.02	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
ed363608-1074-4afb-a166-eaa6e60f3eca	\N	FL	Marion	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
5c18bf3d-b019-42d6-8926-1a8288896653	\N	FL	Martin	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
cf2c4f10-a5af-4e94-a5aa-969d24a1ecf0	\N	FL	Seminole	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
0aa2dd7e-a943-46b2-b915-6597a8364656	\N	FL	Bay	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
c408fa27-d30b-46b8-b371-a2c4166fccad	\N	FL	Escambia	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a2adad9f-3d3f-4bf2-a707-9b1296f92866	\N	FL	Hillsborough	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
a78c00b3-bfa8-42cb-9ddf-8b8dc507fbcb	\N	FL	Holmes	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
29efa8b1-f0b4-490c-b197-7814f702f9b7	\N	FL	Jackson	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
e731d801-b0e1-4b84-bab5-56a67828b0ab	\N	FL	Monroe	total	0.015	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
bd7944e0-f6bb-45e3-817c-5af60c1c0a53	\N	FL	St Lucie	total	1	2024-01-01	\N	FL_dr15dss_6-25_Tax_Table copy.pdf	\N	2025-10-07 22:12:33.567558+00
\.


--
-- Data for Name: customer_addon_sets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_addon_sets (id, label, items, active, created_at, updated_at) FROM stdin;
a8c90735-1c54-4d30-ab7c-b622e0aa2883	Default Customer Add-ons	[{"name": "Extended Warranty", "amount": 2500, "sort_order": 1}, {"name": "Tire Package", "amount": 1200, "sort_order": 2}, {"name": "GAP Coverage", "amount": 895, "sort_order": 3}, {"name": "Paint Protection", "amount": 695, "sort_order": 4}, {"name": "Fabric Protection", "amount": 495, "sort_order": 5}, {"name": "Window Tint", "amount": 450, "sort_order": 6}, {"name": "Wheel & Tire Protection", "amount": 850, "sort_order": 7}, {"name": "Maintenance Package", "amount": 1500, "sort_order": 8}]	t	2025-10-30 18:02:21.470054+00	2025-10-30 18:02:21.470054+00
\.


--
-- Data for Name: customer_offers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_offers (id, customer_profile_id, offer_name, status, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, vehicle_vin, vehicle_mileage, vehicle_condition, dealer_name, dealer_address, dealer_phone, offer_price, down_payment, trade_in_details, apr, term_months, monthly_payment, offer_text, customer_name, customer_email, customer_phone, customer_address, submitted_at, closed_at, created_at, updated_at, user_id, vehicle_price, trade_value, trade_payoff, dealer_fees, customer_addons, offer_preview_html) FROM stdin;
a0140a38-c7a8-46fd-be9d-b0d67b9616b5	07a091eb-6719-429e-abed-5a62ea4b3b04	2026 – RAM – 1500 – Tungsten – $79,270 – 4.07% – Nov 10, 02:05 AM	active	2026	RAM	1500	Tungsten	1C6SRFKP3TN178530	13	new	\N	\N	\N	79270.00	\N	\N	0.0407	48	1901.00	╔═════════════════════════════════════════╗\n║      VEHICLE PURCHASE OFFER             ║\n╚═════════════════════════════════════════╝\n\n🚗 VEHICLE DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n2026 RAM 1500 Tungsten\nCondition: New  |  Mileage: 13 mi\nVIN: 1C6SRFKP3TN178530\n\n💵 CUSTOMER OFFER PRICE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n$79,270.00\n\n📊 FINANCING\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAPR: 4.07%\nTerm: 48 months\n\n👤 CUSTOMER CONTACT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nName: James B Johns\nEmail: james.johns83@gmail.com\nPhone: 2566555655\n\n─────────────────────────────────────────\nGenerated on November 10, 2025\nPowered by Brandon's Calculator\nhttps://github.com/jbj0005/BrandonsCalc	James B Johns	james.johns83@gmail.com	2566555655	\N	2025-11-10 07:05:03.685969+00	\N	2025-11-10 07:05:03.685969+00	2025-11-10 07:05:03.685969+00	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	79270.00	\N	\N	\N	\N	\N
\.


--
-- Data for Name: customer_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_profiles (id, created_at, updated_at, full_name, email, phone, street_address, city, state, state_code, zip_code, county, county_name, google_place_id, preferred_lender_id, preferred_term, credit_score_range, last_used_at, preferred_down_payment, user_id, first_name, last_name, preferred_trade_value, preferred_trade_payoff) FROM stdin;
07a091eb-6719-429e-abed-5a62ea4b3b04	2025-11-04 19:02:15.31737+00	2025-11-11 04:13:19.155833+00	James B Johns	james.johns83@gmail.com	2566555655	4240 Miami Ave	Melbourne	FL	FL	32904	\N	\N	\N	\N	72	excellent	2025-11-11 04:13:19.081+00	\N	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	James	B Johns	\N	\N
\.


--
-- Data for Name: dealer_fee_sets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dealer_fee_sets (id, label, applies_state_code, items, version, active, inserted_at, updated_at) FROM stdin;
03fb2c50-7f78-40a4-b89b-298b2d956584	FL Dealer Fees (Static)	FL	[{"name": "Doc Fee", "amount": 399}, {"name": "Service & Handling", "amount": 799}, {"name": "Used Tire / Battery", "amount": 6.5}, {"name": "Delivery", "amount": 1600}, {"name": "Electronic Filing", "amount": 199}]	\N	t	2025-09-13 01:28:37.553789+00	2025-10-30 18:05:13.105677+00
\.


--
-- Data for Name: garage_vehicles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.garage_vehicles (id, user_id, year, make, model, "trim", vin, mileage, condition, estimated_value, payoff_amount, photo_url, notes, created_at, updated_at, nickname, times_used, last_used_at) FROM stdin;
073d7432-7609-4092-a7e8-ccb73efee3e9	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2024	Kia	EV9	GT-Line	KNDAEFS5XR6020932	13000	excellent	64966.00	62000.00	\N	Imported from saved vehicles	2025-11-05 20:02:48.653883+00	2025-11-06 00:34:17.204763+00	\N	0	\N
a29c69d4-147a-478b-ae29-0baaf8551a76	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2025	Nissan	Armada	Platinum	JN8AY3EA9S9000825	8500	excellent	73000.00	77500.00	\N	Imported from saved vehicles	2025-11-05 20:03:01.690949+00	2025-11-06 00:34:36.616942+00	\N	0	\N
\.


--
-- Data for Name: gov_fee_sets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.gov_fee_sets (id, label, applies_state_code, applies_county_fips, items, version, active, inserted_at, updated_at) FROM stdin;
1c351d0d-12d8-422a-8a6a-30518a72d642	FL Gov Fees (Static)	FL	\N	[{"name": "Initial Registration Fee", "sort": 1, "notes": "When a customer has no existing Florida plate to transfer (first-time registration)", "amount": 225, "category": "Gov't"}, {"name": "Base Registration / License Plate / Tag Fee", "sort": 2, "notes": "Annually or for the registration cycle, based on vehicle weight or class", "amount": 14.5, "category": "Gov't", "amount_display": "14.50–32.50"}, {"name": "Title Fee (Electronic Title)", "sort": 3, "notes": "Whenever you issue or transfer a title (new or used)", "amount": 77.25, "category": "Gov't"}, {"name": "Title Transfer / Duplicate Title", "sort": 4, "notes": "Ownership transfer, when changing name, or issuing duplicate", "amount": 75.25, "category": "Gov't"}, {"name": "Lien Filing / Recording Fee", "sort": 5, "notes": "When there is a secured creditor (financing)", "amount": 2, "category": "Gov't"}, {"name": "Fast / Same-Day Title Print Fee", "sort": 6, "notes": "If the buyer requests a rush / expedited title", "amount": 10, "category": "Gov't"}, {"name": "Paper Title Print Fee / Service & Handling", "sort": 7, "notes": "If one requests a physical (paper) title instead of electronic", "amount": 2.5, "category": "Gov't"}, {"name": "New License Plate / Plate Issuance Fee", "sort": 8, "notes": "When a new plate is required instead of transferring an existing one", "amount": 28, "category": "Gov't"}, {"name": "License Plate Mailing / Decal Mailing Fee", "sort": 9, "notes": "When plates or decals must be mailed rather than issued in person", "amount": 3, "category": "Gov't", "amount_display": "0.85–5.45"}, {"name": "Replacement Plate / Decal / Duplicate Registration Fee", "sort": 10, "notes": "When the license plate, registration decal, or registration certificate is lost or damaged", "amount": 3, "category": "Gov't", "amount_display": "3.00–36.90"}, {"name": "Registration Transfer Fee", "sort": 11, "notes": "When transferring a registration from one vehicle to another (if allowed)", "amount": 4.6, "category": "Gov't"}, {"name": "Branch / Issuing Agency / Processing Fee", "sort": 12, "notes": "For administrative overhead at county or tax collector offices", "amount": 0.5, "category": "Gov't"}, {"name": "Air Pollution Control Fee", "sort": 13, "notes": "Flat environmental fee for registered vehicles", "amount": 1, "category": "Gov't"}, {"name": "Advanced / Replacement Fee", "sort": 14, "notes": "Fees imposed for replacing something (e.g., advanced replacement plates)", "amount": 2.8, "category": "Gov't"}, {"name": "Initial Additional Fee / Annual Additional Fee", "sort": 15, "notes": "Statutory extra fees as allowed under Florida law", "amount": 1.5, "category": "Gov't", "amount_display": "1.50 / 4.00"}, {"name": "Authentication / Historical Plate Fee", "sort": 16, "notes": "Special plate issuance for historic or older vehicles", "amount": 10, "category": "Gov't"}, {"name": "Decal Fee", "sort": 17, "notes": "The ownership decal (sticker) for plate", "amount": 1, "category": "Gov't"}, {"name": "Delinquent / Late Fees", "sort": 18, "notes": "For registration/title processing past legal deadline", "amount": 20, "category": "Gov't"}, {"name": "Commercial Motor Vehicle / Heavy Vehicle Surcharge", "sort": 19, "notes": "Additional taxes or surcharges for high-weight or commercial vehicles", "amount": 0, "category": "Gov't", "is_variable": true, "amount_display": "Varies"}]	\N	t	2025-09-13 01:28:37.553789+00	2025-10-30 03:32:11.170773+00
\.


--
-- Data for Name: marketcheck_cache; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.marketcheck_cache (id, vin, mc_response, mc_listing_id, mc_search_source, cached_at, expires_at, is_active, api_calls_saved, created_at) FROM stdin;
\.


--
-- Data for Name: offer_submissions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.offer_submissions (id, submitted_at, saved_offer_id, salesperson_id, submission_method, formatted_text, recipient_contact, dealer_response, dealer_response_at, notes) FROM stdin;
59f4f501-13c0-4ad0-8595-84a59911067f	2025-11-04 23:44:42.081203+00	74198b6a-920d-4f24-ab19-349395753129	\N	sms	{}	2566555655	\N	\N	\N
c34b1613-f1e4-402e-9edb-6dfbdf3be1b4	2025-11-04 23:54:05.99409+00	638414d8-9735-416a-92bb-67004609002d	\N	sms	{}	2566555655	\N	\N	\N
\.


--
-- Data for Name: salesperson_contacts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salesperson_contacts (id, created_at, updated_at, full_name, dealership_name, phone, email, times_used, last_used_at) FROM stdin;
\.


--
-- Data for Name: saved_offers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saved_offers (id, created_at, updated_at, customer_profile_id, salesperson_id, offer_name, status, vehicle_year, vehicle_make, vehicle_model, vehicle_trim, vehicle_vin, vehicle_condition, vehicle_mileage, sale_price, down_payment, has_tradein, tradein_year, tradein_make, tradein_model, tradein_vin, tradein_allowance, tradein_payoff, tradein_net, term, apr, monthly_payment, finance_charge, amount_financed, total_of_payments, lender_id, lender_name, fees, state_code, county_name, wizard_state, customer_notes, last_viewed_at) FROM stdin;
74198b6a-920d-4f24-ab19-349395753129	2025-11-04 23:44:41.828998+00	2025-11-04 23:44:41.828998+00	07a091eb-6719-429e-abed-5a62ea4b3b04	\N	2026 RAM 1500	submitted	2026	RAM	1500	Tungsten	1C6SRFKP3TN178530	new	13	0.00	0.00	t	\N	\N	\N	\N	\N	38500.00	-38500.00	\N	\N	0.00	0.00	0.00	0.00	\N	\N	\N	FL	Brevard	{"fees": {"items": {"gov": [{"amount": 225, "description": "Initial Registration Fee"}], "dealer": [{"amount": 399, "description": "Doc Fee"}], "customer": [{"amount": 695, "description": "Paint Protection"}]}, "govtFees": 225, "dealerFees": 399, "stateTaxRate": 6, "countyTaxRate": 1, "customerAddons": 695, "userCustomized": true}, "trade": {"value": 36500, "payoff": 38500, "vehicles": [{"id": "c31af421-3dab-4c7e-952e-f47083eaf966", "vin": "JN8AY3EA9S9000825", "make": "Nissan", "trim": "Platinum", "year": 2025, "model": "Armada", "notes": null, "mileage": 13000, "nickname": null, "condition": "excellent", "created_at": "2025-11-04T21:30:01.05196+00:00", "times_used": 0, "updated_at": "2025-11-04T21:30:00.584+00:00", "last_used_at": null, "payoff_amount": 38515, "estimated_value": 36500, "customer_profile_id": "07a091eb-6719-429e-abed-5a62ea4b3b04"}], "hasTradeIn": true}, "tradein": {"vehicles": [{"id": "c31af421-3dab-4c7e-952e-f47083eaf966", "vin": "JN8AY3EA9S9000825", "make": "Nissan", "trim": "Platinum", "year": 2025, "model": "Armada", "notes": null, "mileage": 13000, "nickname": null, "condition": "excellent", "created_at": "2025-11-04T21:30:01.05196+00:00", "times_used": 0, "updated_at": "2025-11-04T21:30:00.584+00:00", "last_used_at": null, "payoff_amount": 38515, "estimated_value": 36500, "customer_profile_id": "07a091eb-6719-429e-abed-5a62ea4b3b04"}], "hasTradeIn": true, "tradeValue": 36500, "tradePayoff": 38500}, "vehicle": {"id": "b49074b4-338a-49b5-b959-ad4712f41847", "vin": "1C6SRFKP3TN178530", "make": "RAM", "trim": "Tungsten", "year": 2026, "model": "1500", "heading": "New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4", "mileage": 13, "user_id": "64ac9c2e-c712-47ee-a124-9e2f0cb3310a", "condition": "new", "photo_url": null, "dealer_lat": 26.052616, "dealer_lng": -80.253156, "dealer_zip": "33328", "listing_id": "1C6SRFKP3TN178530-9844d452-43ef", "dealer_city": "Davie", "dealer_name": "University Dodge Ram", "inserted_at": "2025-10-29T15:35:40.35721+00:00", "listing_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "asking_price": 79270, "dealer_phone": "954-869-4746", "dealer_state": "FL", "dealer_street": "5455 S University Dr", "listing_source": "universitydodge.com"}, "customer": {}, "location": {"lat": 28.0757955, "lng": -80.69611239999999, "zip": "32904", "city": "Melbourne", "state": "FL", "county": null, "address": "4240 Miami Ave, Melbourne, FL 32904, USA", "stateCode": "FL", "countyName": "Brevard", "formatted_address": "4240 Miami Ave, Melbourne, FL 32904, USA"}, "financing": {"term": 72, "cashDown": 4300, "salePrice": 70000, "creditScoreRange": "excellent"}}	\N	2025-11-04 23:44:41.828998+00
638414d8-9735-416a-92bb-67004609002d	2025-11-04 23:54:05.881836+00	2025-11-04 23:54:05.881836+00	07a091eb-6719-429e-abed-5a62ea4b3b04	\N	2026 RAM 1500	submitted	2026	RAM	1500	Tungsten	1C6SRFKP3TN178530	new	13	0.00	0.00	t	\N	\N	\N	\N	\N	38500.00	-38500.00	\N	\N	0.00	0.00	0.00	0.00	\N	\N	\N	FL	Brevard	{"fees": {"items": {"gov": [{"amount": 225, "description": "Initial Registration Fee"}], "dealer": [{"amount": 399, "description": "Doc Fee"}], "customer": [{"amount": 695, "description": "Paint Protection"}]}, "govtFees": 225, "dealerFees": 399, "stateTaxRate": 6, "countyTaxRate": 1, "customerAddons": 695, "userCustomized": true}, "trade": {"value": 36500, "payoff": 38500, "vehicles": [{"id": "c31af421-3dab-4c7e-952e-f47083eaf966", "vin": "JN8AY3EA9S9000825", "make": "Nissan", "trim": "Platinum", "year": 2025, "model": "Armada", "notes": null, "mileage": 13000, "nickname": null, "condition": "excellent", "created_at": "2025-11-04T21:30:01.05196+00:00", "times_used": 0, "updated_at": "2025-11-04T21:30:00.584+00:00", "last_used_at": null, "payoff_amount": 38515, "estimated_value": 36500, "customer_profile_id": "07a091eb-6719-429e-abed-5a62ea4b3b04"}], "hasTradeIn": true}, "tradein": {"vehicles": [{"id": "c31af421-3dab-4c7e-952e-f47083eaf966", "vin": "JN8AY3EA9S9000825", "make": "Nissan", "trim": "Platinum", "year": 2025, "model": "Armada", "notes": null, "mileage": 13000, "nickname": null, "condition": "excellent", "created_at": "2025-11-04T21:30:01.05196+00:00", "times_used": 0, "updated_at": "2025-11-04T21:30:00.584+00:00", "last_used_at": null, "payoff_amount": 38515, "estimated_value": 36500, "customer_profile_id": "07a091eb-6719-429e-abed-5a62ea4b3b04"}], "hasTradeIn": true, "tradeValue": 36500, "tradePayoff": 38500}, "vehicle": {"id": "b49074b4-338a-49b5-b959-ad4712f41847", "vin": "1C6SRFKP3TN178530", "make": "RAM", "trim": "Tungsten", "year": 2026, "model": "1500", "heading": "New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4", "mileage": 13, "user_id": "64ac9c2e-c712-47ee-a124-9e2f0cb3310a", "condition": "new", "photo_url": null, "dealer_lat": 26.052616, "dealer_lng": -80.253156, "dealer_zip": "33328", "listing_id": "1C6SRFKP3TN178530-9844d452-43ef", "dealer_city": "Davie", "dealer_name": "University Dodge Ram", "inserted_at": "2025-10-29T15:35:40.35721+00:00", "listing_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "asking_price": 79270, "dealer_phone": "954-869-4746", "dealer_state": "FL", "dealer_street": "5455 S University Dr", "listing_source": "universitydodge.com"}, "customer": {}, "location": {"lat": 28.0757955, "lng": -80.69611239999999, "zip": "32904", "city": "Melbourne", "state": "FL", "county": null, "address": "4240 Miami Ave, Melbourne, FL 32904, USA", "stateCode": "FL", "countyName": "Brevard", "formatted_address": "4240 Miami Ave, Melbourne, FL 32904, USA"}, "financing": {"term": 72, "cashDown": 4300, "salePrice": 70000, "creditScoreRange": "excellent"}}	\N	2025-11-04 23:54:05.881836+00
\.


--
-- Data for Name: secure_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.secure_settings (name, secret, updated_at) FROM stdin;
google_maps_api_key	AIzaSyC5LXJ43CBBfA5d-zAl03NBXwMVML2FMA8	2025-10-28 23:15:40.462753+00
google_maps_map_id	YOUR_MAP_ID	2025-10-28 23:15:40.462753+00
marketcheck_api_key	KgCk97zRkUDXEWZX2TLt0UAyn9bRJqQ9	2025-10-28 23:15:40.462753+00
\.


--
-- Data for Name: vehicles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vehicles (id, user_id, vehicle, year, make, model, asking_price, inserted_at, mileage, "trim", dealer_name, dealer_street, dealer_city, dealer_state, dealer_zip, dealer_phone, dealer_lat, dealer_lng, listing_id, listing_source, listing_url, vin, heading, photo_url, marketcheck_payload, condition) FROM stdin;
f4443bca-d9fa-426a-ad38-ac309e5d29a7	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2024 GMC Sierra EV Denali	2024	GMC	Sierra EV	75295	2025-10-16 03:54:03.035892+00	8281	Denali	Delray Buick Gmc	2400 S Federal Hwy	Delray Beach	FL	33483	561-278-3217	26.4327	-80.073005	1GT401EL6RU402072-f61d840a-081e	MARKETCHECK	https://www.delraybuickgmc.com/used/GMC/2024-GMC-Sierra-EV-2f44a448ac18342efeccefd6fea84d00.htm	1GT401EL6RU402072	2024 GMC Sierra EV Denali Edition 1 Truck Crew Cab	https://pictures.dealer.com/g/garberbuickgmcofdelray/0107/6f8d54e3dcd43e539a0f94801d347713x.jpg	{"vin": "1GT401EL6RU402072", "make": "GMC", "trim": "Denali", "year": 2024, "model": "Sierra EV", "heading": "2024 GMC Sierra EV Denali Edition 1 Truck Crew Cab", "mileage": 8281, "vehicle": "2024 GMC Sierra EV Denali Edition 1 Truck Crew Cab", "photo_url": "https://pictures.dealer.com/g/garberbuickgmcofdelray/0107/6f8d54e3dcd43e539a0f94801d347713x.jpg", "dealer_lat": 26.4327, "dealer_lng": -80.073005, "dealer_zip": "33483", "listing_id": "1GT401EL6RU402072-f61d840a-081e", "dealer_city": "Delray Beach", "dealer_name": "Delray Buick Gmc", "listing_url": "https://www.delraybuickgmc.com/used/GMC/2024-GMC-Sierra-EV-2f44a448ac18342efeccefd6fea84d00.htm", "asking_price": 75295, "dealer_phone": "561-278-3217", "dealer_state": "FL", "dealer_street": "2400 S Federal Hwy", "listing_source": "MARKETCHECK"}	New
1cbd682d-066a-4a97-8004-58469b3caf42	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2026 Ram 2500 Limited	2026	RAM	2500	97315	2025-10-15 05:59:16.639949+00	10	Limited	Chrysler Dodge Jeep Ram Of Leesburg	3401 Us Highway 441/27	Fruitland Park	FL	34731	352-787-2223	28.847432	-81.897798	3C63R5SL4TG153432-8c0b97c3-c480	MARKETCHECK	https://www.chryslerdodgejeepramofleesburg.com/new/Ram/2026-Ram-2500-e5a0dc7bac1804a4cdb8d9d663d0d8f3.htm	3C63R5SL4TG153432	2026 Ram 2500 LIMITED CREW CAB 4X4 6'4 BOX Pickup	https://pictures.dealer.com/c/chryslerdodgejeepramofleesburgcllc/0530/1f343f1810ca5bc1201ad1afeec283c0x.jpg	{"vin": "3C63R5SL4TG153432", "make": "RAM", "trim": "Limited", "year": 2026, "model": "Ram 2500 Pickup", "heading": "2026 Ram 2500 LIMITED CREW CAB 4X4 6'4 BOX Pickup", "mileage": 10, "vehicle": "2026 Ram 2500 LIMITED CREW CAB 4X4 6'4 BOX Pickup", "photo_url": "https://pictures.dealer.com/c/chryslerdodgejeepramofleesburgcllc/0530/1f343f1810ca5bc1201ad1afeec283c0x.jpg", "dealer_lat": 28.847432, "dealer_lng": -81.897798, "dealer_zip": "34731", "listing_id": "3C63R5SL4TG153432-8c0b97c3-c480", "dealer_city": "Fruitland Park", "dealer_name": "Chrysler Dodge Jeep Ram Of Leesburg", "listing_url": "https://www.chryslerdodgejeepramofleesburg.com/new/Ram/2026-Ram-2500-e5a0dc7bac1804a4cdb8d9d663d0d8f3.htm", "asking_price": 97315, "dealer_phone": "352-787-2223", "dealer_state": "FL", "dealer_street": "3401 Us Highway 441/27", "listing_source": "MARKETCHECK"}	New
85f9e7f1-bceb-46ef-ac44-2cfb19d34d49	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	\N	2026	RAM	Ram 1500	89390	2025-10-31 14:59:40.140248+00	0	Tungsten	Boniface-hiers Chrysler Dodge Jeep Ram	2555 West King Street	Cocoa	FL	32926	321-486-6603	28.35563	-80.7726	1C6SRFKP5TN215092-e865d46f-12c3	marketcheck	https://www.bonifacehierschryslerdodge.com/viewdetails/new/1c6srfkp5tn215092/2026-ram-1500-crew-cab-pickup?type=finance&term=72	1C6SRFKP5TN215092	2026 RAM 1500 Tungsten Crew Cab 5'7 Box 4WD	https://service.secureoffersites.com/images/GetEvoxImage?styleid=473205&colorcode=PWD	\N	Used
3f90f6b7-e321-4996-b14f-402ad7af04d4	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2025 Ram 1500 Limited (Danny)	2025	Ram	1500	58700	2025-10-16 00:14:18.720728+00	\N	Limited	Hanania Chrysler Dodge Jeep Ram	2330 US Route 1	St. Augustine	FL	32086	\N	29.8564167	-81.3221464	\N	\N	\N	\N	Danny Bouse	\N	\N	used
c3e723ea-1562-4b61-8afa-f3107c307cb4	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2024 BMW ALPINA XB7 Base	2024	BMW	X7	119700	2025-10-28 21:36:43.558796+00	16945	ALPINA XB7	Sarasota Ford	707 South Washington Blvd	Sarasota	FL	34236	888-349-4989	27.329807	-82.530408	\N	\N	\N	5UX43EM17R9W07335	\N	\N	\N	Used
5cac4543-211e-43f6-9533-339730a95baf	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	2022 BMW XB7 Alpina	2022	BMW	ALPINA XB7	78995	2025-10-17 01:07:57.936594+00	43373	\N	San Diego	\N	San Diego	CA	\N	\N	32.715738	-117.1610838	\N	\N	\N	5UXCX6C15N9N12712	\N	\N	\N	Used
b49074b4-338a-49b5-b959-ad4712f41847	64ac9c2e-c712-47ee-a124-9e2f0cb3310a	New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4	2026	RAM	1500	79270	2025-10-29 15:35:40.35721+00	13	Tungsten	University Dodge Ram	5455 S University Dr	Davie	FL	33328	954-869-4746	26.052616	-80.253156	1C6SRFKP3TN178530-9844d452-43ef	universitydodge.com	https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/	1C6SRFKP3TN178530	New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4	\N	{"extras": {"specs": null, "history": [{"id": "1C6SRFKP3TN178530-9844d452-43ef", "zip": "33328", "city": "Davie", "miles": 13, "price": 79270, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1761296554, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1761732053, "last_seen_at": 1761732053, "first_seen_at": 1761296554, "inventory_type": "new", "scraped_at_date": "2025-10-24T09:02:34.000Z", "last_seen_at_date": "2025-10-29T10:00:53.000Z", "first_seen_at_date": "2025-10-24T09:02:34.000Z"}, {"id": "1C6SRFKP3TN178530-dd05c25d-c921", "zip": "33014", "city": "Miami Lakes", "miles": 13, "price": 94252, "state": "FL", "source": "newcarsflorida.com", "vdp_url": "https://www.newcarsflorida.com/inventory/new-2026-ram-1500-tungsten-4wd-4d-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1760529042, "data_source": "mc", "seller_name": "New Cars Florida", "seller_type": "dealer", "status_date": 1761646371, "last_seen_at": 1761646371, "first_seen_at": 1760529042, "inventory_type": "new", "scraped_at_date": "2025-10-15T11:50:42.000Z", "last_seen_at_date": "2025-10-28T10:12:51.000Z", "first_seen_at_date": "2025-10-15T11:50:42.000Z"}, {"id": "1C6SRFKP3TN178530-5fb93946-5fa4", "zip": "33328", "city": "Davie", "miles": 13, "price": 78270, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1760533773, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1761165542, "last_seen_at": 1761165542, "first_seen_at": 1760533773, "inventory_type": "new", "scraped_at_date": "2025-10-15T13:09:33.000Z", "last_seen_at_date": "2025-10-22T20:39:02.000Z", "first_seen_at_date": "2025-10-15T13:09:33.000Z"}, {"id": "1C6SRFKP3TN178530-2e6bcae9-74bd", "zip": "33328", "city": "Davie", "miles": 2, "price": 77949, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1759576851, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1760448627, "last_seen_at": 1760448627, "first_seen_at": 1759576851, "inventory_type": "new", "scraped_at_date": "2025-10-04T11:20:51.000Z", "last_seen_at_date": "2025-10-14T13:30:27.000Z", "first_seen_at_date": "2025-10-04T11:20:51.000Z"}, {"id": "1C6SRFKP3TN178530-ce0b7c25-dfd4", "zip": "33014", "city": "Miami Lakes", "miles": 2, "price": 94252, "state": "FL", "source": "newcarsflorida.com", "vdp_url": "https://www.newcarsflorida.com/inventory/new-2026-ram-1500-tungsten-4wd-4d-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1759500041, "data_source": "mc", "seller_name": "New Cars Florida", "seller_type": "dealer", "status_date": 1760351559, "last_seen_at": 1760351559, "first_seen_at": 1759500041, "inventory_type": "new", "scraped_at_date": "2025-10-03T14:00:41.000Z", "last_seen_at_date": "2025-10-13T10:32:39.000Z", "first_seen_at_date": "2025-10-03T14:00:41.000Z"}, {"id": "1C6SRFKP3TN178530-3e218f1d-b084", "zip": "33328", "city": "Davie", "miles": 10, "price": 77949, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1759490504, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1759490504, "last_seen_at": 1759490504, "first_seen_at": 1759490504, "inventory_type": "new", "scraped_at_date": "2025-10-03T11:21:44.000Z", "last_seen_at_date": "2025-10-03T11:21:44.000Z", "first_seen_at_date": "2025-10-03T11:21:44.000Z"}, {"id": "1C6SRFKP3TN178530-fc68e324-74d0", "zip": "33014", "city": "Miami Lakes", "miles": 10, "price": 94252, "state": "FL", "source": "newcarsflorida.com", "vdp_url": "https://www.newcarsflorida.com/inventory/new-2026-ram-1500-tungsten-4wd-4d-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1758192323, "data_source": "mc", "seller_name": "New Cars Florida", "seller_type": "dealer", "status_date": 1759414752, "last_seen_at": 1759414752, "first_seen_at": 1758192323, "inventory_type": "new", "scraped_at_date": "2025-09-18T10:45:23.000Z", "last_seen_at_date": "2025-10-02T14:19:12.000Z", "first_seen_at_date": "2025-09-18T10:45:23.000Z"}, {"id": "1C6SRFKP3TN178530-46ca717a-c96d", "zip": "33328", "city": "Davie", "miles": 10, "price": 78949, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1759347379, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1759347379, "last_seen_at": 1759347379, "first_seen_at": 1759347379, "inventory_type": "new", "scraped_at_date": "2025-10-01T19:36:19.000Z", "last_seen_at_date": "2025-10-01T19:36:19.000Z", "first_seen_at_date": "2025-10-01T19:36:19.000Z"}, {"id": "1C6SRFKP3TN178530-48c24001-0374", "zip": "33328", "city": "Davie", "miles": 10, "price": 79949, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1758370187, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1758886228, "last_seen_at": 1758886228, "first_seen_at": 1758370187, "inventory_type": "new", "scraped_at_date": "2025-09-20T12:09:47.000Z", "last_seen_at_date": "2025-09-26T11:30:28.000Z", "first_seen_at_date": "2025-09-20T12:09:47.000Z"}, {"id": "1C6SRFKP3TN178530-60fffb66-c92c", "zip": "33328", "city": "Davie", "miles": 10, "price": 91860, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1758196341, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1758282675, "last_seen_at": 1758282675, "first_seen_at": 1758196341, "inventory_type": "new", "scraped_at_date": "2025-09-18T11:52:21.000Z", "last_seen_at_date": "2025-09-19T11:51:15.000Z", "first_seen_at_date": "2025-09-18T11:52:21.000Z"}, {"id": "1C6SRFKP3TN178530-65912718-9a54", "zip": "33328", "city": "Davie", "miles": 0, "price": 91860, "state": "FL", "source": "universitydodge.com", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "scraped_at": 1756998964, "data_source": "mc", "seller_name": "University Dodge Ram", "seller_type": "dealer", "status_date": 1758113031, "last_seen_at": 1758113031, "first_seen_at": 1756998964, "inventory_type": "new", "scraped_at_date": "2025-09-04T15:16:04.000Z", "last_seen_at_date": "2025-09-17T12:43:51.000Z", "first_seen_at_date": "2025-09-04T15:16:04.000Z"}], "summary": null, "raw_listing": {"id": "1C6SRFKP3TN178530-9844d452-43ef", "dom": 56, "vin": "1C6SRFKP3TN178530", "msrp": 91860, "build": {"make": "RAM", "trim": "Tungsten", "year": 2026, "doors": 4, "model": "Ram 1500 Pickup", "engine": "3.0L I6", "made_in": "USA", "version": "Tungsten 4x4 Crew Cab 5'7", "city_mpg": 15, "body_type": "Pickup", "cylinders": 6, "fuel_type": "Premium Unleaded", "drivetrain": "4WD", "engine_size": 3, "highway_mpg": 21, "std_seating": "5", "body_subtype": "Crew", "transmission": "Automatic", "vehicle_type": "Truck", "overall_height": "77.6", "overall_length": "232.4", "powertrain_type": "Combustion"}, "extra": {"options": ["Adaptive cruise control Adaptive cruise control with stop and go", "Smart device integration Apple CarPlay/Android Auto smart device wireless mirroring", "Climate control Automatic climate control", "4WD type Part and full-time 4WD", "Rear camera Rear mounted camera", "Blind spot Blind Spot Detection", "Handsfree Uconnect w/Bluetooth handsfree wireless device connectivity", "Fog lights LED front fog lights", "Forward collision warning Intersection Collision Assist forward collision mitigation with left turn assist", "Heated front seats Heated driver and front passenger seats", "Interior accents Chrome and metal-look interior accents", "Keyfob keyless entry", "Integrated navigation Integrated navigation system with voice activation", "Parking sensors ParkSense front and rear parking sensors", "Power driver seat controls Driver seat power reclining, lumbar support, cushion extension, seatback side bolster support, cushion tilt, fore/aft control and height adjustable control", "Fob engine controls Smart key with hands-free access and push button start", "Keyfob remote start", "First-row sunroof First and second-row sliding and tilting glass sunroof with express open/close activation sunshade", "Internet access 4G LTE Wi-Fi Hot Spot mobile hotspot internet access", "ADDITIONAL EQUIPMENT $225 MYFLEXCARE SERVICE PLAN", "BED UTILITY GROUP $545 MOPAR 4 Adjustable Cargo Tie-Down Hooks Truck Bed Cargo Divider Exterior 115V AC Outlet", "ENGINE ENGINE: 3.0L I6 HURRICANE HO TWIN TURBO ESS", "MULTI-FUNCTION TAILGATE $1,095 Remote Tailgate Release RAM's Head Badge", "PRIMARY PAINT BRIGHT WHITE CLEARCOAT", "QUICK ORDER PACKAGE 22V TUNGSTEN Engine: 3.0L I6 Hurricane HO Twin Turbo ESS Transmission: 8-Speed Automatic (8HP75)", "SEAT TYPE BLACK PREMIUM LEATHER BUCKET SEATS", "TIRES TIRES: 285/45R22XL BSW ALL SEASON", "TRANSMISSION TRANSMISSION: 8-SPEED AUTOMATIC (8HP75)"], "features": ["AWD", "Adaptive Cruise Control", "Android Auto", "Apple CarPlay", "Automatic Climate Control", "Backup Camera", "Blind Spot Monitor", "Bluetooth", "Fog Lights", "Forward Collision Warning", "Heated Seats", "Interior Accents", "Keyless Entry", "Navigation System", "Parking Sensors / Assist", "Power Seats", "Push Start", "Remote Start", "Sunroof / Moonroof", "WiFi Hotspot", "Trim: Tungsten", "Drivetrain: 4x4", "12-Way / 1-Way Trailer Connector", "22-Inch x 9.0-Inch Polish/Painted Whls w/ Inserts", "285/45R22XL BSW All-Season Tires", "3.0L I6 Hurricane HO Twin Turbo with Stop/Start", "3.92 Rear Axle Ratio", "5 Additional Gallons of Gas", "50 State Emissions", "8-Speed Automatic 8HP75 Transmission", "Automatic Power-Folding Mirrors", "Automatic-Dimming Exterior Driver Mirror", "Black", "Black Interior Color", "Bright White Clear-Coat Exterior Paint", "Chrome Exterior Mirrors", "Customer Preferred Package 2TV", "Exterior Mirrors Courtesy Lamps", "Exterior Mirrors with Heating Element", "Exterior Mirrors with Memory", "Exterior Mirrors with Supplemental Signals", "Fuel Fill / Battery Charge", "GVW Rating - 7,100 Pounds", "MyFlexCare Service Plan", "Premium Leather Bucket Seats", "T3AC", "Uconnect 5 Nav with 14.4-Inch Touch Screen Display", "Bed Utility Group", "Customer Preferred Package 22V", "Multi-Function Tailgate", "12V power outlets 2 12V power outlets", "3-point seatbelt Rear seat center 3-point seatbelt", "4WD type Part and full-time 4WD", "ABS Brakes 4-wheel antilock (ABS) brakes", "ABS Brakes Four channel ABS brakes", "Accessory power Retained accessory power", "Adaptive cruise control Adaptive cruise control with stop and go", "Adjustable pedals Power adjustable pedals", "Air conditioning Yes", "All-in-one key All-in-one remote fob and ignition key", "Alternator Type Alternator", "Ambient lighting", "Amplifier Premium grade amplifier", "Antenna Fixed audio antenna", "Armrests front center Front seat center armrest", "Armrests front storage Front seat armrest storage", "Armrests rear Rear seat center armrest", "Auto door locks Auto-locking doors", "Auto headlights Auto on/off headlight control", "Auto high-beam headlights", "Auto-dimming door mirror driver Auto-dimming driver side mirror", "Autonomous cruise control Hands-off cruise control", "Aux input jack Auxiliary input jack", "Auxiliary battery", "Basic warranty 36 month/36,000 miles", "Battery type Lead acid battery", "Bed liner Spray-in pickup bed liner", "Bed-rail protectors Pickup bed-rail protectors", "Beverage holders Illuminated front beverage holders", "Beverage holders rear Rear beverage holders", "Blind spot Blind Spot Detection", "Body panels Galvanized steel/aluminum body panels with side impact beams", "Bodyside moldings Metal-look bodyside moldings", "Box storage RamBox integrated pickup box storage", "Box style Standard style pickup box", "Brake assist system Predictive brake assist system", "Brake type 4-wheel disc brakes", "Bulb warning Bulb failure warning", "Bumper insert Chrome front bumper insert", "Bumper rub strip front Chrome front bumper rub strip", "Bumpers front Body-colored front bumper", "Bumpers rear Body-colored rear bumper", "Cab mounted cargo light", "Cabin air filter", "Camera Aerial view camera", "Capless fuel filler", "Cargo access Power cargo area access release", "Child door locks Manual rear child safety door locks", "Climate control Automatic climate control", "Clock Digital clock", "Compass", "Compressor Twin turbo", "Configurable instrumentation gauges", "Console insert material Aluminum and carbon fiber console insert", "Convex spotter Driver and passenger convex spotter mirrors", "Cooled front seats Ventilated driver and front passenger seats", "Cooled rear seats Ventilated rear seats", "Corrosion perforation warranty 60 month/unlimited", "Cruise control Cruise control with steering wheel mounted controls", "Cylinder head material Aluminum cylinder head", "Dashboard material Leather upholstered dashboard", "Day/Night rearview mirror", "Delay off headlights Delay-off headlights", "Deluxe sound insulation", "Digital signal processor", "Distance alert Following distance alert", "Door ajar warning Rear cargo area ajar warning", "Door bins front Driver and passenger door bins", "Door bins rear Rear door bins", "Door handle material Body-colored door handles", "Door locks Power door locks with 2 stage unlocking", "Door mirror style Chrome door mirrors", "Door mirror type Standard style side mirrors", "Door mirror with tilt-down in reverse Power driver and passenger door mirrors with tilt down in reverse", "Door panel insert Aluminum and carbon fiber door panel insert", "Door trim insert Leather door trim insert", "Drive type Four-wheel drive", "Driver attention monitor Drowsy Driver Detection", "Driver foot rest", "Driver information center", "Driver lumbar Driver seat with 4-way power lumbar", "Driver seat direction Driver seat with 12-way directional controls", "Drivetrain selectable Driver selectable drivetrain mode", "DRL preference setting", "Dual-zone front climate control", "Easy lower tailgate", "Electronic parking brake", "Electronic stability control Electronic stability control system with anti-roll", "Emissions LEV3-ULEV70 emissions", "Emissions tiers Tier 3 Bin 70 emissions", "Engine block material Aluminum engine block", "Engine Cylinders Hurricane I6", "Engine hour meter", "Engine Hurricane 3L I-6 gasoline direct injection, DOHC, variable valve control, twin turbo, premium unleaded, engine with 540HP", "Engine Location Front mounted engine", "Engine Mounting direction Longitudinal mounted engine", "Engine Short Hurricane 3L I-6 DOHC", "Engine temperature warning", "Engine/electric motor temperature gauge", "Evasion assist system Evasive Steer Assist evasion assist system", "Exterior 120V AC power outlet 1 exterior 120V AC power outlet", "External memory External memory control", "Fenders Body-colored fender flares", "First-row sunroof First and second-row sliding and tilting glass sunroof with express open/close activation sunshade", "First-row windows Power first-row windows", "Floor console Full floor console", "Floor console storage Covered floor console storage", "Floor coverage Full floor coverage", "Floor covering Full carpet floor covering", "Floor mats Rubber front and rear floor mats with carpet inserts", "Fob engine controls Smart key with hands-free access and push button start", "Fog lights LED front fog lights", "Folding door mirrors Power folding door mirrors", "Folding rear seats 60-40 folding rear seats", "Forward collision warning Intersection Collision Assist forward collision mitigation with left turn assist", "Front anti-roll Front anti-roll bar", "Front camera Front mounted camera", "Front cross traffic warning Intersection Collision Assist System front cross traffic warning", "Front head restraint control Power front seat head restraint control", "Front head restraints Height and tilt adjustable front seat head restraints", "Front impact airbag driver Driver front impact airbag", "Front impact airbag passenger Passenger front impact airbag", "Front passenger lumbar Front passenger seat with 4-way power lumbar", "Front passenger screen Front passenger touchscreen", "Front passenger screen size (inches) Front passenger screen size: 10.2", "Front reading lights", "Front seat upholstery Leather front seat upholstery", "Front seatback upholstery Leather front seatback upholstery", "Front side impact airbag driver Seat mounted side impact driver airbag", "Front side impact airbag passenger Seat mounted side impact front passenger airbag", "Fuel Type Premium Unleaded", "Full gauge cluster screen", "Garage door opener", "Gauge cluster display size (inches) Gauge cluster display size: 12.00", "Gearshifter material Metal-look gear shifter material", "Glove box Illuminated locking glove box", "Grille style Chrome grille with body-color surround", "Handsfree Uconnect w/Bluetooth handsfree wireless device connectivity", "Head up display Head-up display", "Headlight type Projector beam headlights", "Headlights LED low and high beam headlights", "Headlights on reminder", "Headliner coverage Full headliner coverage", "Headliner material Simulated suede headliner material", "Heated door mirrors Heated driver and passenger side door mirrors", "Heated front seats Heated driver and front passenger seats", "Heated rear seats", "Heated steering wheel", "Height adjustable seatbelts Front height adjustable seatbelts", "High mount stop light High mounted center stop light", "Hill start assist", "Ignition Spark ignition system", "Ignition type Push-button", "Illuminated entry", "Illuminated glove box", "Immobilizer", "In-box lighting LED in-box lighting", "Instrumentation display Digital/analog instrumentation display", "Integrated navigation Integrated navigation system with voice activation", "Interior 120V AC power outlets 2 interior 120V AC power outlets", "Interior accents Chrome and metal-look interior accents", "Interior courtesy lights Fade interior courtesy lights", "Internet access 4G LTE Wi-Fi Hot Spot mobile hotspot internet access", "Internet radio capability", "Key in vehicle warning", "Keycard activated door locks", "Keyfob cargo controls Keyfob trunk control", "Keyfob exterior storage lock controls Keyfob exterior integrated storage lock control", "Keyfob keyless entry", "Keyfob remote start", "Keyfob suspension controls Keyfob air suspension control", "Laminated window Laminated side window glass", "Lane departure Active Lane Management System", "LED brake lights", "Left camera Left side camera", "Limited slip differential Mechanical limited slip differential", "Lock-up transmission", "Locking hub control Auto locking hub control", "Low level warnings Low level warning for fuel, washer fluid and brake fluid", "Low tire pressure warning Tire specific low air pressure warning", "Massaging driver seat", "Massaging front passenger seat", "Memory settings Memory settings include: door mirrors, audio controls and pedals", "Mobile app access RAM Connect App mobile app access", "Multiple headlights Multiple enclosed headlights", "Noise cancellation Active noise cancellation", "Number of airbags 6 airbags", "Number of beverage holders 12 beverage holders", "Number of doors 4 doors", "Number of first-row screens 3 total number of 1st row displays", "Number of memory settings 2 memory settings", "Occupancy sensor Airbag occupancy sensor", "Oil pressure gauge", "Oil pressure warning", "Oil temperature gauge", "One-touch down window Driver and passenger one-touch down windows", "One-touch up window Driver and passenger one-touch up windows", "Over the air updates", "Overdrive transmission", "Overhead airbags Curtain first and second-row overhead airbags", "Overhead console Mini overhead console", "Overhead console storage", "Paint Non-metallic paint", "Panel insert Aluminum and carbon fiber instrument panel insert", "Parking sensors ParkSense front and rear parking sensors", "Passenger doors rear left Conventional left rear passenger door", "Passenger doors rear right Conventional right rear passenger door", "Passenger seat direction Front passenger seat with 12-way directional controls", "Pedestrian detection Pedestrian Emergency Braking", "Perimeter approach lighting Remote activated perimeter approach lighting with puddle lights", "Power driver seat controls Driver seat power reclining, lumbar support, cushion extension, seatback side bolster support, cushion tilt, fore/aft control and height adjustable control", "Power passenger seat controls Passenger seat power reclining, lumbar support, seatback side bolster support, cushion extension, cushion tilt, fore/aft control and height adjustable control", "Powertrain type ICE", "Powertrain warranty 120 month/100,000 miles (FLT)", "Primary display size 14.4 inch primary display", "Primary display touchscreen Primary monitor touchscreen", "Radiator", "Radio AM/FM/digital/satellite", "Rain detecting wipers", "RDS Radio data system (RDS)", "Real time traffic Real-time traffic", "Real time weather Real-time weather", "Rear anti-roll Rear anti-roll bar", "Rear bumper step", "Rear camera Rear mounted camera", "Rear cargo door Tailgate with split swing-out", "Rear collision warning Cross Path Detection collision warning", "Rear console climate control ducts", "Rear head restraint control 3 rear seat head restraints", "Rear head restraint control Manual rear seat head restraint control", "Rear head restraints Height adjustable rear seat head restraints", "Rear reading lights", "Rear seat check warning Rear Seat Reminder Alert rear seat check warning", "Rear seat direction Front facing rear seat", "Rear seat folding position Fold-up rear seat cushion", "Rear seat upholstery Leather rear seat upholstery", "Rear seatback upholstery Carpet rear seatback upholstery", "Rear seats fixed or removable Fixed rear seats", "Rear seats Split-bench rear seat", "Rear Springs Regular grade rear springs", "Rear step MOPAR retractable rear step", "Rear under seat ducts Rear under seat climate control ducts", "Rear window defroster", "Rear windshield Power rear windshield", "Rearview mirror Auto-dimming rear view mirror", "Reclining rear seats Manual reclining rear seats", "Remote panic alarm", "Right camera Right side camera", "Roadside warranty 60 month/60,000 miles", "Running boards Power running boards", "Running lights LED daytime running lights", "SAE Autonomy Level 2 - partial automation SAE Autonomy", "Satellite trial 3 month satellite trial subscription", "Seatback storage pockets 2 seatback storage pockets", "Seatbelt pretensioners Front seatbelt pretensioners", "Seatbelt pretensioners number 2 seatbelt pre-tensioners", "Seating capacity 5", "Second-row windows Power second-row windows", "Security system", "Seek scan", "Selectable mode transmission", "Service interval warning Service interval indicator", "Shock absorbers Heavy-duty gas-pressurized shock absorbers", "Shutters Active grille shutters", "Smart device integration Apple CarPlay/Android Auto smart device wireless mirroring", "Smart device remote start", "Smart device-as-key proximity door locks", "Spare tire Full-size spare tire with aluminum wheel", "Spare tire location Crank-down spare tire", "Speakers number 23 speakers", "Special paint Monotone paint", "Speed sensitive volume", "Speedometer Redundant digital speedometer", "Split front seats Bucket front seats", "Sport pedals Sport style pedals", "Springs front Front air springs", "Springs rear Rear air springs", "Start-stop engine Auto stop-start engine", "Steering Electric power-assist steering system", "Steering mounted audio control Steering wheel mounted audio controls", "Steering type Rack-pinion steering", "Steering wheel material Leather and genuine wood steering wheel", "Steering wheel telescopic Manual telescopic steering wheel", "Steering wheel tilt Manual tilting steering wheel", "Suspension auto correcting Automatic height adjustable suspension with driver control", "Suspension auto-leveling Auto-leveling front and rear suspension", "Suspension control Automatic suspension ride control with driver control", "Suspension ride type front Independent front suspension", "Suspension ride type rear Rigid axle rear suspension", "Suspension Standard ride suspension", "Suspension type front Short and long arm front suspension", "Suspension type rear Multi-link rear suspension", "Tachometer", "Tailgate control Tailgate/power door lock", "Tailpipe Stainless steel dual exhaust with chrome tailpipe finisher", "Temperature display Exterior temperature display", "Tinted windows Deep tinted windows", "Tire pressure Tire Fill Alert tire pressure fill assist", "Tires P285/45TR22 AS BSW front and rear tires", "Tonneau cover Soft tonneau cover", "Tow hooks front 2 front tow hooks", "Towing class Class IV tow rating", "Towing hitch light Trailer hitch light", "Towing hitch Trailer hitch", "Towing trailer sway Trailer sway control", "Towing wiring harness Trailer wiring harness", "Traction control All-speed ABS and driveline traction control", "Traffic sign information Traffic Sign Recognition", "Transfer case Electronic transfer case shift", "Transmission 8-speed automatic", "Transmission electronic control", "Transmission fluid temperature warning Transmission fluid temp warning", "Transmission temperature gauge Transmission fluid temperature gauge", "Transmission Type Automatic", "Trip computer", "Trip odometer", "Turn signal in door mirrors Turn signal indicator in door mirrors", "Two-Speed Transfer Case", "Under seat tray rear Rear under seat tray", "USB ports 9 USB ports", "Valet key", "Variable panel light Variable instrument panel light", "Ventilated brakes Front ventilated disc brakes", "Video rearview mirror Video-feed rearview mirror", "Visor driver mirror Driver visor mirror", "Visor illuminated driver mirror Illuminated driver visor mirror", "Visor illuminated passenger mirror Illuminated passenger visor mirror", "Visor passenger mirror Passenger visor mirror", "Voice activated audio Voice activated audio controls", "Voice recorder Personal voice memo recorder", "Voltmeter", "Wheels 22 x 9-inch front and rear polished w/painted accents aluminum wheels", "Window Trim Chrome side window trim", "Wipers Variable intermittent front windshield wipers", "Wireless device charging Front wireless smart device charging", "Wireless streaming Wireless audio streaming"], "seller_comments": "2026 Ram 1500 Tungsten Bright White Clearcoat 8-Speed Automatic 3.0L I6The displayed price includes an incentive for financing with University Auomall's Finance Company. Price does not included etch/apperance .Outside financing and bank drafts are not accepted. All pre-owned vehicle exports are subject to an export fee. Taxes, title, registration, and dealer fees apply. . Thanks for shopping with us. Davie FL. Fort Lauderdale FL. Hollywood FL. Pembroke Pines FL. Weston FL. Plantation FL. Coral Springs FL. Margate FL. Sunrise FL. Aventura FL. Boca Raton FL. Miami FL. West Palm Beach FL.", "options_packages": ["ANT", "MWK", "2S6"], "high_value_features": [{"type": "Standard", "category": "Safety & Driver Assist", "description": "360 View Parking Device"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Parking Assistance System"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Parking Distance System"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Anti Collision System"}, {"type": "Standard", "category": "Infotainment", "description": "Satellite Radio"}, {"type": "Standard", "category": "Infotainment", "description": "Bluetooth"}, {"type": "Standard", "category": "Infotainment", "description": "Touch Screen Audio"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Power Closing Doors"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Lane Keep Assist"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Autonomous Drive Functions"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Autonomous Drive - Level 2"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Blind Spot System"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Brake Assist"}, {"type": "Standard", "category": "Engine", "description": "Turbo Boost"}, {"type": "Standard", "category": "Infotainment", "description": "Upgraded Aux Jack Input"}, {"type": "Standard", "category": "Infotainment", "description": "Upgraded USB Connection"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Adaptive Cruise Control"}, {"type": "Standard", "category": "Exterior", "description": "Heated Door Mirrors"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Power Closing Liftgate"}, {"type": "Standard", "category": "Exterior", "description": "Fog Lights"}, {"type": "Standard", "category": "Interior", "description": "Massage Seats"}, {"type": "Standard", "category": "Interior", "description": "Heated Seats"}, {"type": "Standard", "category": "Interior", "description": "Heated/Cooled Seats"}, {"type": "Standard", "category": "Interior", "description": "Memory Seats"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Coming Home Device"}, {"type": "Standard", "category": "Interior", "description": "Sun/Moonroof"}, {"type": "Standard", "category": "Vehicle Segment", "description": "Full Size Pickup"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Memory Mirrors"}, {"type": "Standard", "category": "Infotainment", "description": "Android Auto"}, {"type": "Standard", "category": "Infotainment", "description": "Apple CarPlay"}, {"type": "Standard", "category": "Infotainment", "description": "Phone Integration"}, {"type": "Standard", "category": "Infotainment", "description": "Navigation"}, {"type": "Standard", "category": "Infotainment", "description": "Traffic Information"}, {"type": "Standard", "category": "Infotainment", "description": "Collision/Breakdown Telematics"}, {"type": "Standard", "category": "Infotainment", "description": "Voice Recognition"}, {"type": "Standard", "category": "Infotainment", "description": "Wireless Charging/Connection"}, {"type": "Standard", "category": "Exterior", "description": "Upgrade Paint"}, {"type": "Standard", "category": "Interior", "description": "Panoramic Sun/Moonroof"}, {"type": "Standard", "category": "Exterior", "description": "Short Pickup Bed"}, {"type": "Standard", "category": "Exterior", "description": "Pickup Bed Liner"}, {"type": "Standard", "category": "Exterior", "description": "Pickup Bed Cover"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Cross Traffic Collision Avoidance"}, {"type": "Standard", "category": "Infotainment", "description": "Steering Wheel Controls"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Keyless Start/Remote Engine Start"}, {"type": "Standard", "category": "Interior", "description": "Leather Seats"}, {"type": "Standard", "category": "Comfort & Convenience", "description": "Smart Card / Smart Key"}, {"type": "Standard", "category": "Infotainment", "description": "Premium Speakers"}, {"type": "Standard", "category": "Exterior", "description": "Upgraded Tire Type"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Traffic Information"}, {"type": "Standard", "category": "Safety & Driver Assist", "description": "Trailer Assist"}, {"type": "Standard", "category": "Transmission", "description": "Automatic Transmission"}, {"type": "Standard", "category": "Infotainment", "description": "Virtual Assistant"}, {"type": "Standard", "category": "Exterior", "description": "Upgraded Wheel Size"}, {"type": "Standard", "category": "Exterior", "description": "Premium Wheels"}, {"type": "Standard", "category": "Infotainment", "description": "WiFi Network"}]}, "media": {"photo_links": ["https://vehicle-images.dealerinspire.com/692f-11001470/1C6SRFKP3TN178530/dee301b29222276849f824051090487d.jpg", "https://vehicle-images.dealerinspire.com/7982-11001470/1C6SRFKP3TN178530/47434344429882941d2e288fe68c1089.jpeg", "https://vehicle-images.dealerinspire.com/fd03-11001470/1C6SRFKP3TN178530/31dd770eeb04bad9fff305b702161a95.jpg", "https://vehicle-images.dealerinspire.com/5d7c-11001470/1C6SRFKP3TN178530/0db27d84206f273de73b45f36526fa96.jpg", "https://vehicle-images.dealerinspire.com/c847-11001470/1C6SRFKP3TN178530/fcc02f03d2910a37406d4219127015a8.jpg", "https://vehicle-images.dealerinspire.com/ed02-11001470/1C6SRFKP3TN178530/1557f4db977f05b4a416d1b1f537f786.jpg", "https://vehicle-images.dealerinspire.com/e62a-11001470/1C6SRFKP3TN178530/a0915be86a56424d592309b570b6b1ca.jpg", "https://vehicle-images.dealerinspire.com/2241-11001470/1C6SRFKP3TN178530/a2cbea7acd17f091416a8ee41259d0af.jpg", "https://vehicle-images.dealerinspire.com/91bf-11001470/1C6SRFKP3TN178530/66d23174b22e9b63a9b5df7a749b322c.jpg", "https://vehicle-images.dealerinspire.com/623f-11001470/1C6SRFKP3TN178530/554f997698567f0133f04fb1dde06b4b.jpg", "https://vehicle-images.dealerinspire.com/02b4-11001470/1C6SRFKP3TN178530/1d937f619157efeafce37793b983089c.jpg", "https://vehicle-images.dealerinspire.com/cd07-11001470/1C6SRFKP3TN178530/1cdd2f76621785c478b06ac410a291a2.jpg", "https://vehicle-images.dealerinspire.com/1347-11001470/1C6SRFKP3TN178530/83aa9e0d706123a10f827abf4f7f1075.jpg", "https://vehicle-images.dealerinspire.com/47c7-11001470/1C6SRFKP3TN178530/8df9e92082de70d5f9ea4396dbba4cb1.jpg", "https://vehicle-images.dealerinspire.com/a970-11001470/1C6SRFKP3TN178530/06fc057ff79cf45de5728da77995e51e.jpg", "https://vehicle-images.dealerinspire.com/84fd-11001470/1C6SRFKP3TN178530/24a3d0a27929497a665d7fd010f574e2.jpg", "https://vehicle-images.dealerinspire.com/0576-11001470/1C6SRFKP3TN178530/80d55c7343735a132712edbfbdf2339b.jpg", "https://vehicle-images.dealerinspire.com/990a-11001470/1C6SRFKP3TN178530/63e02147bdcf6c051bd2e3d6fdfe09bb.jpg", "https://vehicle-images.dealerinspire.com/80c3-11001470/1C6SRFKP3TN178530/ee80dfc6a422076a413f013a9c553b54.jpg", "https://vehicle-images.dealerinspire.com/fd60-11001470/1C6SRFKP3TN178530/4b9fa4beb11d02b2f23a92c46c02eac7.jpg", "https://vehicle-images.dealerinspire.com/d0ce-11001470/1C6SRFKP3TN178530/af69de17d0c4a14aacbb47cdf7e60d22.jpg", "https://vehicle-images.dealerinspire.com/3ea6-11001470/1C6SRFKP3TN178530/cbdc48dac4b8ddcc9818339e354e3de1.jpg", "https://vehicle-images.dealerinspire.com/6b75-11001470/1C6SRFKP3TN178530/bc899e5e4a6c5944c718da25edb01d94.jpg", "https://vehicle-images.dealerinspire.com/fa92-11001470/1C6SRFKP3TN178530/f85fd70e3f186c0431f5fe547af4c50b.jpg", "https://vehicle-images.dealerinspire.com/406b-11001470/1C6SRFKP3TN178530/c41009d34ed7f9a4e3f94c5dca9a93d2.jpg", "https://vehicle-images.dealerinspire.com/0b49-11001470/1C6SRFKP3TN178530/170b925d03c26507ce2d5323aa1699f6.jpg", "https://vehicle-images.dealerinspire.com/115c-11001470/1C6SRFKP3TN178530/486d61fed475913df19dcd0cc15be599.jpg", "https://vehicle-images.dealerinspire.com/4d02-11001470/1C6SRFKP3TN178530/f3a9e5f1fee13c06f83d331abf1c750f.jpg", "https://vehicle-images.dealerinspire.com/32dd-11001470/1C6SRFKP3TN178530/f7ac301bee79b85d0c6ed4d5ebb239c8.jpg", "https://vehicle-images.dealerinspire.com/cb3f-11001470/1C6SRFKP3TN178530/7856fd91c0af844c64c61464da715a73.jpg", "https://vehicle-images.dealerinspire.com/efff-11001470/1C6SRFKP3TN178530/bb4f392bd9f1941adb2b10fd548ce595.jpg", "https://vehicle-images.dealerinspire.com/65e5-11001470/1C6SRFKP3TN178530/608800bb148100f848df0fe5ac5f8ba5.jpg", "https://vehicle-images.dealerinspire.com/ceee-11001470/1C6SRFKP3TN178530/de537e5ce6af5692d56864ec507b40fb.jpg", "https://vehicle-images.dealerinspire.com/55e4-11001470/1C6SRFKP3TN178530/f5276b24b2522d015129c5d5e4e345fd.jpg", "https://vehicle-images.dealerinspire.com/ba95-11001470/1C6SRFKP3TN178530/e2829eff0173761aa54dae5a0fdf1366.jpg", "https://vehicle-images.dealerinspire.com/e3df-11001470/1C6SRFKP3TN178530/03b3c463251b6e9663eabaa58d2929c9.jpg", "https://vehicle-images.dealerinspire.com/7ad0-11001470/1C6SRFKP3TN178530/ea7ea266b5f47231618336fd0fecc940.jpg", "https://vehicle-images.dealerinspire.com/f622-11001470/1C6SRFKP3TN178530/5b3f7b0c56e68faf843c3d9c84565dd3.jpg", "https://vehicle-images.dealerinspire.com/6241-11001470/1C6SRFKP3TN178530/9d93bc95312a4342da56010361d352e1.jpg", "https://vehicle-images.dealerinspire.com/34f6-11001470/1C6SRFKP3TN178530/8e7342020d300658d6f3468bbb582d59.jpg", "https://vehicle-images.dealerinspire.com/44fa-11001470/1C6SRFKP3TN178530/385fbd4d5f196cf98ccacf456ebca3a0.jpg", "https://vehicle-images.dealerinspire.com/d6d3-11001470/1C6SRFKP3TN178530/d5b4d038babd649d63f0aebb7b3e9c45.jpg", "https://vehicle-images.dealerinspire.com/5d01-11001470/1C6SRFKP3TN178530/ce99d59cda5e5723ca3b332801803c77.jpg", "https://vehicle-images.dealerinspire.com/c89c-11001470/1C6SRFKP3TN178530/d9515352aa41f9483d1ba8f4871121c6.jpg", "https://vehicle-images.dealerinspire.com/be40-11001470/1C6SRFKP3TN178530/9841e250b6c7f7ae66b2d515ae820769.jpg", "https://vehicle-images.dealerinspire.com/a847-11001470/1C6SRFKP3TN178530/5cf37a3ff35e3d01195e72eda83f612f.jpg", "https://vehicle-images.dealerinspire.com/bfdb-11001470/1C6SRFKP3TN178530/9a2d32505a632372c5f4136944bc4e00.jpg", "https://vehicle-images.dealerinspire.com/015d-11001470/1C6SRFKP3TN178530/30719cad6da37c841878c29fea3062ac.jpg", "https://vehicle-images.dealerinspire.com/80a7-11001470/1C6SRFKP3TN178530/8a6e2b784e15ca00ee42fababcfda933.jpg", "https://vehicle-images.dealerinspire.com/9878-11001470/1C6SRFKP3TN178530/943224a05fa1e8b3aebdf30ab726d770.jpg", "https://vehicle-images.dealerinspire.com/460b-11001470/1C6SRFKP3TN178530/e8b87ec0904a10362bffac1ea461e0ba.jpg", "https://vehicle-images.dealerinspire.com/f0dc-11001470/1C6SRFKP3TN178530/06ff0e73990de72704350227fba7b7b0.jpg", "https://vehicle-images.dealerinspire.com/f919-11001470/1C6SRFKP3TN178530/c4f0a3da693fc246d2e278c7960d8791.jpg", "https://vehicle-images.dealerinspire.com/95b1-11001470/1C6SRFKP3TN178530/c6ac5a4294a1a9cb38015665d81d7998.jpg", "https://vehicle-images.dealerinspire.com/d9ba-11001470/1C6SRFKP3TN178530/1f55d133f6a0f2c1a7cdeca3c5a821ba.jpg", "https://vehicle-images.dealerinspire.com/4a93-11001470/1C6SRFKP3TN178530/2ad517c0e8ff3c4721224cbf6ea64e9c.jpg", "https://vehicle-images.dealerinspire.com/aa8a-11001470/1C6SRFKP3TN178530/cd4a681cfbf7cb0f55dfd2bc358b438d.jpg", "https://vehicle-images.dealerinspire.com/443f-11001470/1C6SRFKP3TN178530/7963e83287bc5585173a37acbcebcd1e.jpg", "https://vehicle-images.dealerinspire.com/1be9-11001470/1C6SRFKP3TN178530/c8187b1c1f5c7d8e4da84ceca2d01e31.jpg", "https://vehicle-images.dealerinspire.com/df3e-11001470/1C6SRFKP3TN178530/3914b3d48316a056242a12d4c9d8da80.jpg", "https://vehicle-images.dealerinspire.com/b66c-11001470/1C6SRFKP3TN178530/6e1e89668b4af71a6521c97a3bf49d05.jpg", "https://vehicle-images.dealerinspire.com/e737-11001470/1C6SRFKP3TN178530/86b84b10ac442569c211cb85bd900f8a.jpg", "https://vehicle-images.dealerinspire.com/6a6d-11001470/1C6SRFKP3TN178530/7265a04206156a36fea6396777a1afd7.jpg", "https://vehicle-images.dealerinspire.com/04d3-11001470/1C6SRFKP3TN178530/1e55c05ba1cb5c3a95ef93d8dabb1992.jpg", "https://vehicle-images.dealerinspire.com/6e41-11001470/1C6SRFKP3TN178530/b6ddb4b360392180601c9a72028ca277.jpg", "https://vehicle-images.dealerinspire.com/c5f9-11001470/1C6SRFKP3TN178530/a17dd8330cf8efc60ee6320c15357806.jpg"]}, "miles": 13, "price": 79270, "dealer": {"id": 1001013, "zip": "33328", "city": "Davie", "name": "University Dodge Ram", "phone": "954-869-4746", "state": "FL", "street": "5455 S University Dr", "country": "US", "website": "universitydodge.com", "latitude": "26.052616", "msa_code": "2680", "longitude": "-80.253156", "dealer_type": "franchise", "seller_email": "Nick.Salerno@UniversityDodge.com"}, "source": "universitydodge.com", "dom_180": 56, "heading": "New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4", "vdp_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "stock_no": "U6T178530", "ref_miles": 13, "ref_price": 78270, "dom_active": 56, "dos_active": 54, "in_transit": false, "scraped_at": 1761296554, "data_source": "mc", "seller_type": "dealer", "car_location": {"mc_car_location_id": "1412738"}, "last_seen_at": 1761732053, "ref_miles_dt": 1761165542, "ref_price_dt": 1761165542, "first_seen_at": 1761296554, "mc_dealership": {"zip": "33328", "city": "Davie", "name": "University Dodge Ram", "phone": "954-869-4746", "state": "FL", "street": "5455 S University Dr", "country": "US", "website": "universitydodge.com", "latitude": "26.052616", "msa_code": "2680", "longitude": "-80.253156", "dealer_type": "franchise", "mc_category": "Dealer", "mc_dealer_id": 1157707, "seller_email": "Nick.Salerno@UniversityDodge.com", "mc_rooftop_id": 240629, "mc_website_id": 1001013, "mc_location_id": 1412738}, "base_ext_color": "White", "base_int_color": "Black", "carfax_1_owner": false, "exterior_color": "Bright White Clear-Coat Paint", "interior_color": "Black", "inventory_type": "new", "scraped_at_date": "2025-10-24T09:02:34.000Z", "first_seen_at_mc": 1756998964, "last_seen_at_date": "2025-10-29T10:00:53.000Z", "carfax_clean_title": false, "first_seen_at_date": "2025-10-24T09:02:34.000Z", "first_seen_at_source": 1756998964, "price_change_percent": 1.28, "first_seen_at_mc_date": "2025-09-04T15:16:04.000Z", "first_seen_at_source_date": "2025-09-04T15:16:04.000Z"}, "search_source": "active listings (nationwide)", "payload_source": "active listings (nationwide)", "search_attempts": [{"endpoint": "searchActive", "description": "active listings (nationwide)", "resultCount": 1}]}, "payload": {"vin": "1C6SRFKP3TN178530", "make": "RAM", "trim": "Tungsten", "year": 2026, "model": "Ram 1500 Pickup", "heading": "New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4", "mileage": 13, "vehicle": "New 2026 RAM 1500 TUNGSTEN CREW CAB 4X4", "photo_url": null, "dealer_lat": "26.052616", "dealer_lng": "-80.253156", "dealer_zip": "33328", "listing_id": "1C6SRFKP3TN178530-9844d452-43ef", "dealer_city": "Davie", "dealer_name": "University Dodge Ram", "listing_url": "https://www.universitydodge.com/inventory/new-2026-ram-1500-tungsten-4x4-crew-cab-1c6srfkp3tn178530/", "asking_price": 79270, "dealer_phone": "954-869-4746", "dealer_state": "FL", "dealer_street": "5455 S University Dr", "listing_source": "universitydodge.com"}}	new
\.


--
-- Name: auto_rates auto_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_rates
    ADD CONSTRAINT auto_rates_pkey PRIMARY KEY (id);


--
-- Name: county_surtax_windows county_surtax_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.county_surtax_windows
    ADD CONSTRAINT county_surtax_windows_pkey PRIMARY KEY (id);


--
-- Name: customer_addon_sets customer_addon_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addon_sets
    ADD CONSTRAINT customer_addon_sets_pkey PRIMARY KEY (id);


--
-- Name: customer_offers customer_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_offers
    ADD CONSTRAINT customer_offers_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_email_key UNIQUE (email);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (id);


--
-- Name: dealer_fee_sets dealer_fee_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_fee_sets
    ADD CONSTRAINT dealer_fee_sets_pkey PRIMARY KEY (id);


--
-- Name: garage_vehicles garage_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garage_vehicles
    ADD CONSTRAINT garage_vehicles_pkey PRIMARY KEY (id);


--
-- Name: gov_fee_sets gov_fee_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_fee_sets
    ADD CONSTRAINT gov_fee_sets_pkey PRIMARY KEY (id);


--
-- Name: marketcheck_cache marketcheck_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketcheck_cache
    ADD CONSTRAINT marketcheck_cache_pkey PRIMARY KEY (id);


--
-- Name: marketcheck_cache marketcheck_cache_vin_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketcheck_cache
    ADD CONSTRAINT marketcheck_cache_vin_key UNIQUE (vin);


--
-- Name: offer_submissions offer_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_submissions
    ADD CONSTRAINT offer_submissions_pkey PRIMARY KEY (id);


--
-- Name: salesperson_contacts salesperson_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_contacts
    ADD CONSTRAINT salesperson_contacts_pkey PRIMARY KEY (id);


--
-- Name: saved_offers saved_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_offers
    ADD CONSTRAINT saved_offers_pkey PRIMARY KEY (id);


--
-- Name: secure_settings secure_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secure_settings
    ADD CONSTRAINT secure_settings_pkey PRIMARY KEY (name);


--
-- Name: salesperson_contacts unique_salesperson; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salesperson_contacts
    ADD CONSTRAINT unique_salesperson UNIQUE (full_name, dealership_name);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: auto_rates_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auto_rates_source_unique ON public.auto_rates USING btree (source, loan_type, term_range_min, term_range_max, credit_tier, credit_score_min, credit_score_max);


--
-- Name: idx_customer_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_email ON public.customer_profiles USING btree (email);


--
-- Name: idx_customer_last_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_last_used ON public.customer_profiles USING btree (last_used_at DESC);


--
-- Name: idx_customer_offers_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_offers_profile ON public.customer_offers USING btree (customer_profile_id);


--
-- Name: idx_customer_offers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_offers_status ON public.customer_offers USING btree (status);


--
-- Name: idx_customer_offers_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_offers_submitted ON public.customer_offers USING btree (submitted_at DESC);


--
-- Name: idx_customer_offers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_offers_user_id ON public.customer_offers USING btree (user_id);


--
-- Name: idx_customer_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_phone ON public.customer_profiles USING btree (phone);


--
-- Name: idx_customer_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_customer_profiles_user_id ON public.customer_profiles USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_customer_profiles_user_id_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_profiles_user_id_lookup ON public.customer_profiles USING btree (user_id);


--
-- Name: idx_dealership_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealership_name ON public.salesperson_contacts USING btree (dealership_name);


--
-- Name: idx_garage_vehicles_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garage_vehicles_created_at ON public.garage_vehicles USING btree (created_at DESC);


--
-- Name: idx_garage_vehicles_last_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garage_vehicles_last_used ON public.garage_vehicles USING btree (last_used_at DESC NULLS LAST);


--
-- Name: idx_garage_vehicles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_garage_vehicles_user_id ON public.garage_vehicles USING btree (user_id);


--
-- Name: idx_mc_cache_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_cache_expires ON public.marketcheck_cache USING btree (expires_at);


--
-- Name: idx_mc_cache_vin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_cache_vin ON public.marketcheck_cache USING btree (vin);


--
-- Name: idx_offer_submissions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offer_submissions_date ON public.offer_submissions USING btree (submitted_at DESC);


--
-- Name: idx_offer_submissions_offer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offer_submissions_offer ON public.offer_submissions USING btree (saved_offer_id);


--
-- Name: idx_salesperson_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_name ON public.salesperson_contacts USING btree (full_name);


--
-- Name: idx_salesperson_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salesperson_usage ON public.salesperson_contacts USING btree (times_used DESC, last_used_at DESC);


--
-- Name: idx_saved_offers_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_created ON public.saved_offers USING btree (created_at DESC);


--
-- Name: idx_saved_offers_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_customer ON public.saved_offers USING btree (customer_profile_id);


--
-- Name: idx_saved_offers_last_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_last_viewed ON public.saved_offers USING btree (last_viewed_at DESC);


--
-- Name: idx_saved_offers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_status ON public.saved_offers USING btree (status);


--
-- Name: idx_saved_offers_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_updated ON public.saved_offers USING btree (updated_at DESC);


--
-- Name: idx_saved_offers_vehicle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_offers_vehicle ON public.saved_offers USING btree (vehicle_year, vehicle_make, vehicle_model);


--
-- Name: idx_vehicles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vehicles_user_id ON public.vehicles USING btree (user_id);


--
-- Name: idx_windows_state_county_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_windows_state_county_dates ON public.county_surtax_windows USING btree (state_code, county_name, effective_date, expiration_date, component_label);


--
-- Name: uq_dealer_fee_sets_one_active_per_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_dealer_fee_sets_one_active_per_state ON public.dealer_fee_sets USING btree (applies_state_code) WHERE (active IS TRUE);


--
-- Name: uq_dealer_fee_sets_state_label; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_dealer_fee_sets_state_label ON public.dealer_fee_sets USING btree (applies_state_code, label);


--
-- Name: uq_gov_fee_sets_one_active_per_state; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_gov_fee_sets_one_active_per_state ON public.gov_fee_sets USING btree (applies_state_code) WHERE (active IS TRUE);


--
-- Name: uq_gov_fee_sets_state_label; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_gov_fee_sets_state_label ON public.gov_fee_sets USING btree (applies_state_code, label);


--
-- Name: vehicles_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_listing_id_idx ON public.vehicles USING btree (listing_id);


--
-- Name: vehicles_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_user_id_idx ON public.vehicles USING btree (user_id);


--
-- Name: vehicles_user_vin_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vehicles_user_vin_unique_idx ON public.vehicles USING btree (user_id, vin) WHERE (vin IS NOT NULL);


--
-- Name: vehicles_vin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_vin_idx ON public.vehicles USING btree (vin);


--
-- Name: dealer_fee_sets set_updated_at_dealer_fee_sets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_dealer_fee_sets BEFORE UPDATE ON public.dealer_fee_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: gov_fee_sets set_updated_at_gov_fee_sets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_gov_fee_sets BEFORE UPDATE ON public.gov_fee_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: customer_offers update_customer_offers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_offers_updated_at BEFORE UPDATE ON public.customer_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_profiles update_customer_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_profiles_updated_at BEFORE UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: garage_vehicles update_garage_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_garage_vehicles_updated_at BEFORE UPDATE ON public.garage_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: salesperson_contacts update_salesperson_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_salesperson_contacts_updated_at BEFORE UPDATE ON public.salesperson_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: saved_offers update_saved_offers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_offers_updated_at BEFORE UPDATE ON public.saved_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dealer_fee_sets validate_dealer_fee_sets_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_dealer_fee_sets_items BEFORE INSERT OR UPDATE OF items ON public.dealer_fee_sets FOR EACH ROW EXECUTE FUNCTION public.dealer_fee_sets_validate_t();


--
-- Name: gov_fee_sets validate_gov_fee_sets_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_gov_fee_sets_items BEFORE INSERT OR UPDATE OF items ON public.gov_fee_sets FOR EACH ROW EXECUTE FUNCTION public.gov_fee_sets_validate_t();


--
-- Name: customer_offers customer_offers_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_offers
    ADD CONSTRAINT customer_offers_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;


--
-- Name: customer_offers customer_offers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_offers
    ADD CONSTRAINT customer_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: customer_profiles customer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: garage_vehicles garage_vehicles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.garage_vehicles
    ADD CONSTRAINT garage_vehicles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: offer_submissions offer_submissions_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_submissions
    ADD CONSTRAINT offer_submissions_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.salesperson_contacts(id) ON DELETE SET NULL;


--
-- Name: offer_submissions offer_submissions_saved_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_submissions
    ADD CONSTRAINT offer_submissions_saved_offer_id_fkey FOREIGN KEY (saved_offer_id) REFERENCES public.saved_offers(id) ON DELETE CASCADE;


--
-- Name: saved_offers saved_offers_customer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_offers
    ADD CONSTRAINT saved_offers_customer_profile_id_fkey FOREIGN KEY (customer_profile_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;


--
-- Name: saved_offers saved_offers_salesperson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_offers
    ADD CONSTRAINT saved_offers_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.salesperson_contacts(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vehicles Admins can delete vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (((auth.jwt() ->> 'user_role'::text) = 'admin'::text));


--
-- Name: vehicles Admins can insert vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (((auth.jwt() ->> 'user_role'::text) = 'admin'::text));


--
-- Name: vehicles Admins can select all vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can select all vehicles" ON public.vehicles FOR SELECT TO authenticated USING (((auth.jwt() ->> 'user_role'::text) = 'admin'::text));


--
-- Name: vehicles Admins can update vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (((auth.jwt() ->> 'user_role'::text) = 'admin'::text)) WITH CHECK (((auth.jwt() ->> 'user_role'::text) = 'admin'::text));


--
-- Name: customer_profiles Allow all on customer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all on customer_profiles" ON public.customer_profiles USING (true) WITH CHECK (true);


--
-- Name: offer_submissions Allow all on offer_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all on offer_submissions" ON public.offer_submissions USING (true) WITH CHECK (true);


--
-- Name: salesperson_contacts Allow all on salesperson_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all on salesperson_contacts" ON public.salesperson_contacts USING (true) WITH CHECK (true);


--
-- Name: saved_offers Allow all on saved_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all on saved_offers" ON public.saved_offers USING (true) WITH CHECK (true);


--
-- Name: dealer_fee_sets Allow anon select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon select" ON public.dealer_fee_sets FOR SELECT USING (true);


--
-- Name: gov_fee_sets Allow anon select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon select" ON public.gov_fee_sets FOR SELECT USING (true);


--
-- Name: dealer_fee_sets Allow anon update dealer fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon update dealer fees" ON public.dealer_fee_sets FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: gov_fee_sets Allow anon update gov fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anon update gov fees" ON public.gov_fee_sets FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: customer_offers Anyone can view offers with link; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view offers with link" ON public.customer_offers FOR SELECT USING (true);


--
-- Name: vehicles Enable users to view their own data only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable users to view their own data only" ON public.vehicles FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: garage_vehicles Garage vehicles are insertable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Garage vehicles are insertable by owner" ON public.garage_vehicles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: garage_vehicles Garage vehicles are readable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Garage vehicles are readable by owner" ON public.garage_vehicles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: garage_vehicles Users can delete own garage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own garage vehicles" ON public.garage_vehicles FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: customer_offers Users can delete own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own offers" ON public.customer_offers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: vehicles Users can delete their own vehicle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own vehicle" ON public.vehicles FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: garage_vehicles Users can insert own garage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own garage vehicles" ON public.garage_vehicles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: customer_offers Users can insert own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own offers" ON public.customer_offers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: vehicles Users can insert their own vehicle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own vehicle" ON public.vehicles FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: garage_vehicles Users can update own garage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own garage vehicles" ON public.garage_vehicles FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: customer_offers Users can update own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own offers" ON public.customer_offers FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: vehicles Users can update their own vehicle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own vehicle" ON public.vehicles FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: garage_vehicles Users can view own garage vehicles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own garage vehicles" ON public.garage_vehicles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: customer_offers Users can view own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own offers" ON public.customer_offers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: customer_addon_sets allow_public_read_customer_addons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allow_public_read_customer_addons ON public.customer_addon_sets FOR SELECT USING (true);


--
-- Name: auto_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: auto_rates auto_rates_authenticated_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auto_rates_authenticated_write ON public.auto_rates TO authenticated USING (true) WITH CHECK (true);


--
-- Name: auto_rates auto_rates_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auto_rates_public_read ON public.auto_rates FOR SELECT USING (true);


--
-- Name: county_surtax_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.county_surtax_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_addon_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_addon_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: dealer_fee_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dealer_fee_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: garage_vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.garage_vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: gov_fee_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gov_fee_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: offer_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: dealer_fee_sets public select dealer fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public select dealer fees" ON public.dealer_fee_sets FOR SELECT TO anon USING (true);


--
-- Name: gov_fee_sets public select gov fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public select gov fees" ON public.gov_fee_sets FOR SELECT TO anon USING (true);


--
-- Name: county_surtax_windows public select windows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public select windows" ON public.county_surtax_windows FOR SELECT TO anon USING (true);


--
-- Name: salesperson_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.salesperson_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: secure_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secure_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: secure_settings service role only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role only" ON public.secure_settings USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: customer_addon_sets service_role_only_modify; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only_modify ON public.customer_addon_sets USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: vehicles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION activate_dealer_fee_set(p_state text, p_set_id uuid, p_label text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.activate_dealer_fee_set(p_state text, p_set_id uuid, p_label text) TO anon;
GRANT ALL ON FUNCTION public.activate_dealer_fee_set(p_state text, p_set_id uuid, p_label text) TO authenticated;
GRANT ALL ON FUNCTION public.activate_dealer_fee_set(p_state text, p_set_id uuid, p_label text) TO service_role;


--
-- Name: FUNCTION activate_gov_fee_set(p_state text, p_set_id uuid, p_label text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.activate_gov_fee_set(p_state text, p_set_id uuid, p_label text) TO anon;
GRANT ALL ON FUNCTION public.activate_gov_fee_set(p_state text, p_set_id uuid, p_label text) TO authenticated;
GRANT ALL ON FUNCTION public.activate_gov_fee_set(p_state text, p_set_id uuid, p_label text) TO service_role;


--
-- Name: FUNCTION county_surtax_on(p_state text, p_county text, p_on date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.county_surtax_on(p_state text, p_county text, p_on date) TO anon;
GRANT ALL ON FUNCTION public.county_surtax_on(p_state text, p_county text, p_on date) TO authenticated;
GRANT ALL ON FUNCTION public.county_surtax_on(p_state text, p_county text, p_on date) TO service_role;


--
-- Name: FUNCTION dealer_fee_sets_validate_t(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dealer_fee_sets_validate_t() TO anon;
GRANT ALL ON FUNCTION public.dealer_fee_sets_validate_t() TO authenticated;
GRANT ALL ON FUNCTION public.dealer_fee_sets_validate_t() TO service_role;


--
-- Name: FUNCTION gov_fee_sets_validate_t(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.gov_fee_sets_validate_t() TO anon;
GRANT ALL ON FUNCTION public.gov_fee_sets_validate_t() TO authenticated;
GRANT ALL ON FUNCTION public.gov_fee_sets_validate_t() TO service_role;


--
-- Name: FUNCTION increment_garage_vehicle_usage(vehicle_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_garage_vehicle_usage(vehicle_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_garage_vehicle_usage(vehicle_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_garage_vehicle_usage(vehicle_id uuid) TO service_role;


--
-- Name: FUNCTION increment_salesperson_usage(salesperson_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_salesperson_usage(salesperson_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_salesperson_usage(salesperson_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_salesperson_usage(salesperson_id uuid) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION show_jwt_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.show_jwt_role() TO anon;
GRANT ALL ON FUNCTION public.show_jwt_role() TO authenticated;
GRANT ALL ON FUNCTION public.show_jwt_role() TO service_role;


--
-- Name: FUNCTION update_customer_last_used(profile_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_customer_last_used(profile_id uuid) TO anon;
GRANT ALL ON FUNCTION public.update_customer_last_used(profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_customer_last_used(profile_id uuid) TO service_role;


--
-- Name: FUNCTION update_garage_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_garage_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_garage_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_garage_updated_at() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION upsert_dealer_fee_set(p_state text, p_label text, p_items jsonb, p_version text, p_active boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upsert_dealer_fee_set(p_state text, p_label text, p_items jsonb, p_version text, p_active boolean) TO anon;
GRANT ALL ON FUNCTION public.upsert_dealer_fee_set(p_state text, p_label text, p_items jsonb, p_version text, p_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_dealer_fee_set(p_state text, p_label text, p_items jsonb, p_version text, p_active boolean) TO service_role;


--
-- Name: FUNCTION upsert_gov_fee_set(p_state text, p_label text, p_items jsonb, p_county_fips text, p_version text, p_active boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.upsert_gov_fee_set(p_state text, p_label text, p_items jsonb, p_county_fips text, p_version text, p_active boolean) TO anon;
GRANT ALL ON FUNCTION public.upsert_gov_fee_set(p_state text, p_label text, p_items jsonb, p_county_fips text, p_version text, p_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.upsert_gov_fee_set(p_state text, p_label text, p_items jsonb, p_county_fips text, p_version text, p_active boolean) TO service_role;


--
-- Name: FUNCTION validate_dealer_fee_items(p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_dealer_fee_items(p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.validate_dealer_fee_items(p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.validate_dealer_fee_items(p_items jsonb) TO service_role;


--
-- Name: FUNCTION validate_gov_fee_items(p_items jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_gov_fee_items(p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.validate_gov_fee_items(p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.validate_gov_fee_items(p_items jsonb) TO service_role;


--
-- Name: TABLE auto_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auto_rates TO anon;
GRANT ALL ON TABLE public.auto_rates TO authenticated;
GRANT ALL ON TABLE public.auto_rates TO service_role;


--
-- Name: TABLE county_surtax_windows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.county_surtax_windows TO anon;
GRANT ALL ON TABLE public.county_surtax_windows TO authenticated;
GRANT ALL ON TABLE public.county_surtax_windows TO service_role;


--
-- Name: TABLE customer_addon_sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_addon_sets TO anon;
GRANT ALL ON TABLE public.customer_addon_sets TO authenticated;
GRANT ALL ON TABLE public.customer_addon_sets TO service_role;


--
-- Name: TABLE customer_addon_items_v; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_addon_items_v TO anon;
GRANT ALL ON TABLE public.customer_addon_items_v TO authenticated;
GRANT ALL ON TABLE public.customer_addon_items_v TO service_role;


--
-- Name: TABLE customer_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_offers TO anon;
GRANT ALL ON TABLE public.customer_offers TO authenticated;
GRANT ALL ON TABLE public.customer_offers TO service_role;


--
-- Name: TABLE customer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO authenticated;
GRANT ALL ON TABLE public.customer_profiles TO service_role;


--
-- Name: TABLE dealer_fee_sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dealer_fee_sets TO anon;
GRANT ALL ON TABLE public.dealer_fee_sets TO authenticated;
GRANT ALL ON TABLE public.dealer_fee_sets TO service_role;


--
-- Name: TABLE dealer_fee_items_v; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dealer_fee_items_v TO anon;
GRANT ALL ON TABLE public.dealer_fee_items_v TO authenticated;
GRANT ALL ON TABLE public.dealer_fee_items_v TO service_role;


--
-- Name: TABLE garage_vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.garage_vehicles TO anon;
GRANT ALL ON TABLE public.garage_vehicles TO authenticated;
GRANT ALL ON TABLE public.garage_vehicles TO service_role;


--
-- Name: TABLE gov_fee_sets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gov_fee_sets TO anon;
GRANT ALL ON TABLE public.gov_fee_sets TO authenticated;
GRANT ALL ON TABLE public.gov_fee_sets TO service_role;


--
-- Name: TABLE gov_fee_items_v; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gov_fee_items_v TO anon;
GRANT ALL ON TABLE public.gov_fee_items_v TO authenticated;
GRANT ALL ON TABLE public.gov_fee_items_v TO service_role;


--
-- Name: TABLE marketcheck_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketcheck_cache TO anon;
GRANT ALL ON TABLE public.marketcheck_cache TO authenticated;
GRANT ALL ON TABLE public.marketcheck_cache TO service_role;


--
-- Name: TABLE offer_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.offer_submissions TO anon;
GRANT ALL ON TABLE public.offer_submissions TO authenticated;
GRANT ALL ON TABLE public.offer_submissions TO service_role;


--
-- Name: TABLE salesperson_contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.salesperson_contacts TO anon;
GRANT ALL ON TABLE public.salesperson_contacts TO authenticated;
GRANT ALL ON TABLE public.salesperson_contacts TO service_role;


--
-- Name: TABLE saved_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saved_offers TO anon;
GRANT ALL ON TABLE public.saved_offers TO authenticated;
GRANT ALL ON TABLE public.saved_offers TO service_role;


--
-- Name: TABLE secure_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.secure_settings TO anon;
GRANT ALL ON TABLE public.secure_settings TO authenticated;
GRANT ALL ON TABLE public.secure_settings TO service_role;


--
-- Name: TABLE vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicles TO anon;
GRANT ALL ON TABLE public.vehicles TO authenticated;
GRANT ALL ON TABLE public.vehicles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict S5gC1aQKzIkuvl14BfjLOhTrzjrO8HS8qORCkFuxI8Mls7HQgzp0FajQyjViB1q

