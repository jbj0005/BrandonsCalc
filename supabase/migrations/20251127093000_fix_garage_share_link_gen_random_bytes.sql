-- Ensure pgcrypto is available and usable from functions
create extension if not exists "pgcrypto" with schema extensions;

-- Recreate create_garage_share_link with access to extensions schema (for gen_random_bytes)
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
set search_path = public, extensions
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
