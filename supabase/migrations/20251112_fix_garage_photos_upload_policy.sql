-- Fix the upload policy to allow authenticated users to upload
-- without requiring owner metadata (which isn't set automatically)

drop policy if exists "Users can upload garage photos" on storage.objects;

create policy "Users can upload garage photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'garage-vehicle-photos'
  );

-- Also allow anonymous uploads for cases where user isn't authenticated
drop policy if exists "Anonymous can upload garage photos" on storage.objects;

create policy "Anonymous can upload garage photos"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'garage-vehicle-photos'
  );
