-- Correctif : « Database error saving new user » à la création d'un compte sans téléphone (Apple, Google).
--  1) un téléphone vide (ou invalide) devient NULL au lieu de '' (la règle profiles.phone_format refuse '').
--  2) un compte créé par « Se connecter avec Apple » (uniquement possible depuis l'app chauffeur) est
--     un chauffeur : profil « driver » + fiche chauffeur « hors_service » en attente de validation.
-- Les inscriptions clients (site web) et chauffeurs par email gardent exactement le même comportement.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_provider text := lower(coalesce(new.raw_app_meta_data ->> 'provider', ''));
  v_raw text := lower(coalesce(new.raw_user_meta_data ->> 'role',
                               case when v_provider = 'apple' then 'driver' else 'client' end));
  v_role user_role;
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '');
  v_phone text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
  v_addr text := nullif(trim(new.raw_user_meta_data ->> 'adresse_facturation'), '');
  v_m text[];
begin
  v_role := case when v_raw in ('driver','courier','chauffeur') then 'driver'::user_role else 'client'::user_role end;

  -- téléphone vide ou au mauvais format : on ne le stocke pas (évite l'erreur de contrainte)
  if v_phone is not null and v_phone !~ '^\+?[0-9\s\-\(\)]{9,}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role, v_name, v_phone)
  on conflict (id) do nothing;

  -- Connexion Apple : pas de formulaire d'inscription, donc on crée la fiche chauffeur ici
  if v_role = 'driver' and v_provider = 'apple' then
    insert into public.drivers (auth_id, name, phone, status)
    values (new.id, coalesce(nullif(v_name, ''), 'Chauffeur'), v_phone, 'hors_service')
    on conflict (auth_id) do nothing;
  end if;

  if v_role = 'client' then
    if v_addr is not null then
      v_m := regexp_match(v_addr, '^(.*),\s*(\d{5})\s+(.+)$');
    end if;

    insert into public.clients (id, company_name, siret, tax_id, contact_email, contact_name, contact_phone,
      billing_address, billing_postal_code, billing_city)
    values (new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), nullif(new.raw_user_meta_data ->> 'company', ''),
               nullif(new.raw_user_meta_data ->> 'raison_sociale', ''), ''),
      nullif(new.raw_user_meta_data ->> 'siret', ''),
      nullif(new.raw_user_meta_data ->> 'tva_number', ''),
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      coalesce(v_m[1], v_addr, new.raw_user_meta_data ->> 'billing_address', 'À remplir'),
      coalesce(v_m[2], new.raw_user_meta_data ->> 'billing_postal_code', ''),
      coalesce(v_m[3], new.raw_user_meta_data ->> 'billing_city', ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $function$;
