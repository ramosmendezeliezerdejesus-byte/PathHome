-- Reserva de perfiles desde que una familia expresa interés.
-- Ejecutar después de institution_children.sql y child_interest_workflow.sql.
-- El historial se conserva; la RPC del catálogo simplemente deja de devolver el perfil.

-- Una familia que ya eligió a un niño no vuelve a entrar al catálogo, incluso
-- si intenta abrir la ruta directamente o repetir la solicitud desde el cliente.
create or replace function public.family_can_access_child_catalog()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare latest_status text; latest_updated timestamptz; reset_at timestamptz;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='familia') then return false; end if;
  if exists(select 1 from public.child_interest_cases c where c.family_id=auth.uid()) then return false; end if;
  if not exists(select 1 from public.family_cases c where c.family_id=auth.uid() and c.status='aprobada') then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_reports') is null then return false; end if;
  execute 'select r.status,r.updated_at from public.family_psych_reports r where r.family_id=$1 order by r.updated_at desc limit 1'
    into latest_status,latest_updated using auth.uid();
  if latest_updated is null then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_report_resets') is not null then
    execute 'select x.updated_at from public.family_psych_report_resets x where x.family_id=$1' into reset_at using auth.uid();
  end if;
  if reset_at is not null and reset_at>=latest_updated then return false; end if;
  return latest_status='aceptada';
end; $$;
revoke all on function public.family_can_access_child_catalog() from public,anon;
grant execute on function public.family_can_access_child_catalog() to authenticated;

create or replace function public.family_list_catalog_children()
returns table(id uuid, name text, age integer, gender text, institution_name text, summary text,
  characteristics text[], interests text[], photo_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_can_access_child_catalog() then
    raise exception 'El catálogo solo está disponible para familias aprobadas.' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.age, c.gender, c.institution_name, c.summary, c.characteristics, c.interests, c.photo_path
    from public.institution_children c
    where not exists(select 1 from public.child_interest_cases x where x.child_id=c.id)
    order by c.created_at desc;
end;
$$;
revoke all on function public.family_list_catalog_children() from public, anon;
grant execute on function public.family_list_catalog_children() to authenticated;

create or replace function public.family_express_child_interest(target_child_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare child_row public.institution_children%rowtype; new_case uuid;
begin
  if not public.family_can_access_child_catalog() then
    raise exception 'Tu familia aún no tiene acceso al catálogo.' using errcode='42501';
  end if;
  -- Serializa las selecciones del mismo perfil para impedir que dos familias lo reserven.
  select * into child_row from public.institution_children where id=target_child_id for update;
  if not found then raise exception 'El perfil ya no está disponible.' using errcode='P0002'; end if;
  if exists(select 1 from public.child_interest_cases where child_id=child_row.id) then
    raise exception 'Este niño ya fue seleccionado por otra familia y no está disponible.' using errcode='23505';
  end if;
  insert into public.child_interest_cases(child_id,institution_id,family_id)
  values(child_row.id,child_row.institution_id,auth.uid()) returning id into new_case;
  insert into public.institution_notifications(institution_id,related_family_id,category,title,message)
  select child_row.institution_id,auth.uid(),'informe','Nuevo interés familiar',
    (select full_name from public.profiles where id=auth.uid()) || ' expresó interés en ' || child_row.name || '.';
  return new_case;
end; $$;
revoke all on function public.family_express_child_interest(uuid) from public, anon;
grant execute on function public.family_express_child_interest(uuid) to authenticated;
