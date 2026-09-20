-- Storage checks permission before final object metadata is available.
-- Enforce reservation ownership before upload, and actual size/type at completion.
drop policy space_media_upload on storage.objects;
create policy space_media_upload on storage.objects for insert to authenticated with check(
 bucket_id='space-media' and exists(select 1 from public.media m where m.object_path=name and m.owner_id=(select auth.uid()) and m.status='reserved')
);
drop policy media_complete on public.media;
create policy media_complete on public.media for update to authenticated using(owner_id=(select auth.uid())) with check(
 owner_id=(select auth.uid()) and status='ready' and exists(select 1 from storage.objects o where o.bucket_id='space-media' and o.name=object_path
 and (o.metadata->>'size')::bigint=byte_size and o.metadata->>'mimetype'=mime_type)
);
-- Delete the stored object first. Completed reservations cannot be reused to upload.
create policy space_media_delete on storage.objects for delete to authenticated using(
 bucket_id='space-media' and exists(select 1 from public.media m where m.object_path=name and m.owner_id=(select auth.uid()) and m.status='ready')
);
grant delete on public.media to authenticated;
create policy media_delete on public.media for delete to authenticated using(
 owner_id=(select auth.uid()) and status='ready' and not exists(select 1 from storage.objects o where o.bucket_id='space-media' and o.name=object_path)
);
