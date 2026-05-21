-- Run AFTER creating bucket named "clips" in Supabase Storage
-- Dashboard → Storage → clips → Policies (or SQL Editor)

-- Allow public read (friends can watch clips)
create policy "clips_public_read"
on storage.objects for select
using (bucket_id = 'clips');

-- Authenticated users upload to their folder: {user_id}/filename
create policy "clips_auth_upload"
on storage.objects for insert
with check (
  bucket_id = 'clips'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users delete own files
create policy "clips_auth_delete"
on storage.objects for delete
using (
  bucket_id = 'clips'
  and auth.role() = 'authenticated'
  and (storage.foldername(name))[1] = auth.uid()::text
);
