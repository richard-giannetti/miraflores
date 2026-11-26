-- Photos removed from an issue are deleted from storage too: by whoever uploaded them, or a manager.
create policy "uploader or managers delete issue photos" on storage.objects for delete to authenticated
  using (bucket_id = 'issue-photos' and (owner_id = (select auth.uid())::text or (select private.my_role()) in ('owner', 'manager')));
