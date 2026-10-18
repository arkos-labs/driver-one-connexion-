-- Refus d'une course par le chauffeur : la course repart au dispatch (statut en_attente, sans chauffeur).
-- Fonction sécurisée : seul le chauffeur assigné peut refuser, et seulement une course non commencée.
create or replace function public.driver_refuse_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.drivers where auth_id = auth.uid();

  update public.orders
     set status = 'en_attente',
         driver_id = null,
         refused_by_driver = coalesce(v_name, 'Chauffeur'),
         updated_at = now()
   where id = p_order_id
     and driver_id = auth.uid()
     and status in ('assigned', 'confirmee');

  if not found then
    raise exception 'Course introuvable ou déjà prise en charge';
  end if;
end $$;

grant execute on function public.driver_refuse_order(uuid) to authenticated;
