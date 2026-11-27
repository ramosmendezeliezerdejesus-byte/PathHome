-- La familia registra la dirección del hogar para que el psicólogo asignado
-- pueda coordinar la visita. Ejecutar después de family_notifications.sql,
-- child_interest_workflow.sql y appointment_locations.sql.

alter table public.profiles add column if not exists home_address text;
grant update (home_address) on public.profiles to authenticated;

create or replace function public.psychologist_get_child_case_home_address(target_case_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare result_address text;
begin
  if not public.is_pathhome_psychologist() then
    raise exception 'Solo un psicólogo validado puede consultar esta dirección.' using errcode='42501';
  end if;
  select nullif(trim(p.home_address), '') into result_address
  from public.child_interest_cases c
  join public.profiles p on p.id=c.family_id
  where c.id=target_case_id and c.psychologist_id=auth.uid() and c.status='visita_hogar_disponible';
  if not found then raise exception 'El caso no está asignado a este psicólogo o ya cambió de etapa.' using errcode='42501'; end if;
  return result_address;
end; $$;
revoke all on function public.psychologist_get_child_case_home_address(uuid) from public,anon;
grant execute on function public.psychologist_get_child_case_home_address(uuid) to authenticated;

-- La dirección de la visita al hogar siempre procede del perfil familiar.
create or replace function public.child_case_schedule_appointment(target_case_id uuid, appointment_kind text, target_date date, target_time time, appointment_note text, target_location text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; result_id uuid; expected_status text; family_home_address text;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if not ((appointment_kind='visita_inicial' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status in ('interes_recibido','cita_inicial_programada'))
    or (appointment_kind='visita_hogar' and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() and c.status='visita_hogar_disponible')
    or (appointment_kind='entrega' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status='entrega_disponible')) then raise exception 'No tienes permiso para agendar esta cita en la etapa actual.' using errcode='42501'; end if;
  if target_date < current_date then raise exception 'Selecciona una fecha futura.'; end if;
  if appointment_kind='visita_hogar' then
    select nullif(trim(p.home_address), '') into family_home_address from public.profiles p where p.id=c.family_id;
    if family_home_address is null then raise exception 'La familia debe registrar la dirección de su hogar antes de agendar la visita.' using errcode='23514'; end if;
    target_location := family_home_address;
  elsif nullif(trim(target_location),'') is null then
    raise exception 'Escribe la dirección de la cita.';
  end if;
  insert into public.family_appointments(family_id,psychologist_id,institution_id,organizer_id,child_interest_case_id,appointment_type,title,appointment_date,appointment_time,appointment_location,note)
  values(c.family_id,c.psychologist_id,c.institution_id,auth.uid(),c.id,appointment_kind,
    case appointment_kind when 'visita_inicial' then 'Visita inicial en la institución' when 'visita_hogar' then 'Visita al hogar' else 'Coordinación de entrega' end,
    target_date,target_time,trim(target_location),appointment_note)
  returning id into result_id;
  expected_status := case appointment_kind when 'visita_inicial' then 'cita_inicial_programada' when 'visita_hogar' then 'cita_hogar_programada' else 'cita_entrega_programada' end;
  update public.child_interest_cases set status=expected_status,updated_at=now() where id=c.id;
  if appointment_kind='visita_hogar' then
    insert into public.institution_notifications(institution_id,related_family_id,category,title,message) values(c.institution_id,c.family_id,'informe','Visita al hogar agendada','El psicólogo responsable programó la visita al hogar.');
  end if;
  return result_id;
end; $$;
revoke all on function public.child_case_schedule_appointment(uuid,text,date,time,text,text) from public,anon;
grant execute on function public.child_case_schedule_appointment(uuid,text,date,time,text,text) to authenticated;

create or replace function public.notify_assigned_psychologist_home_address()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare linked_case record;
begin
  if new.home_address is null or nullif(trim(new.home_address), '') is null
    or old.home_address is not distinct from new.home_address then return new; end if;

  for linked_case in
    select c.id,c.psychologist_id,c.status
    from public.child_interest_cases c
    where c.family_id=new.id and c.psychologist_id is not null
      and c.status in ('visita_hogar_disponible','cita_hogar_programada')
  loop
    if linked_case.status='cita_hogar_programada' then
      perform set_config('pathhome.child_case_write','on',true);
      update public.family_appointments set appointment_location=trim(new.home_address)
      where child_interest_case_id=linked_case.id and appointment_type='visita_hogar' and attended_at is null;
    else
      insert into public.family_notifications(family_id,related_family_id,category,title,message)
      values(linked_case.psychologist_id,new.id,'sistema','Dirección del hogar disponible','La familia registró la dirección de su hogar. Ya puedes coordinar la visita.');
    end if;
  end loop;
  return new;
end; $$;
revoke all on function public.notify_assigned_psychologist_home_address() from public,anon,authenticated;
drop trigger if exists psychologist_notified_of_family_home_address on public.profiles;
create trigger psychologist_notified_of_family_home_address
  after update of home_address on public.profiles
  for each row execute function public.notify_assigned_psychologist_home_address();
