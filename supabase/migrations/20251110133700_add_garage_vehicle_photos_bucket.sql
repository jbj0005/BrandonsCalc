-- ============================================
-- Garage Vehicle Photo Storage
-- ============================================

-- Create dedicated bucket (public so photo_url can be rendered directly)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'garage-vehicle-photos',
  'garage-vehicle-photos',
  true,
  5 * 1024 * 1024, -- 5 MB cap
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

-- Track storage object path so we can clean up uploads on edit/delete
alter table if exists garage_vehicles
  add column if not exists photo_storage_path text;

-- RLS policies for storage bucket
drop policy if exists "Garage photos are public" on storage.objects;
create policy "Garage photos are public"
  on storage.objects for select
  using (bucket_id = 'garage-vehicle-photos');

drop policy if exists "Users can upload garage photos" on storage.objects;
create policy "Users can upload garage photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'garage-vehicle-photos'
    and auth.uid() = owner
  );

drop policy if exists "Users can update garage photos" on storage.objects;
create policy "Users can update garage photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'garage-vehicle-photos'
    and auth.uid() = owner
  );

drop policy if exists "Users can delete garage photos" on storage.objects;
create policy "Users can delete garage photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'garage-vehicle-photos'
    and auth.uid() = owner
  );
