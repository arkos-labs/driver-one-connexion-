-- Les photos ne peuvent plus être ajoutées, modifiées ou supprimées que par leur propriétaire (chauffeur connecté).
-- La lecture par lien public reste possible pour l'affichage (bucket public).
begin;

drop policy if exists "Public Access for delivery-photos" on storage.objects;
drop policy if exists "Public Access for avatars" on storage.objects;

-- Photos de livraison : dossier = identifiant du chauffeur ; photo de profil : avatars/<identifiant>-...
create policy "Photos : ajout par le propriétaire" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or name like 'avatars/' || auth.uid()::text || '-%')
  );

create policy "Photos : lecture par le propriétaire" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or name like 'avatars/' || auth.uid()::text || '-%')
  );

create policy "Photos : modification par le propriétaire" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'delivery-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or name like 'avatars/' || auth.uid()::text || '-%')
  )
  with check (
    bucket_id = 'delivery-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or name like 'avatars/' || auth.uid()::text || '-%')
  );

create policy "Photos : suppression par le propriétaire" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'delivery-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or name like 'avatars/' || auth.uid()::text || '-%')
  );

-- Bucket avatars (non utilisé par l'app) : seulement son propre fichier
create policy "Avatars : écriture par le propriétaire" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '%')
  with check (bucket_id = 'avatars' and name like auth.uid()::text || '%');

commit;
