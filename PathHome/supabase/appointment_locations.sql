-- Ubicación para las citas familiares. Ejecutar después de
-- child_interest_workflow.sql y child_initial_visit_crud.sql.

alter table public.family_appointments
  add column if not exists appointment_location text;

-- La ubicación forma parte de la información de cita que ven sus participantes.
drop function if exists public.child_case_list(text);
create function public.child_case_list(target_role text default 'auto')
returns table(id uuid,child_id uuid,child_name text,child_age integer,family_id uuid,family_name text,institution_id uuid,
  psychologist_id uuid,status text,institution_decision text,institution_observations text,created_at timestamptz,
  appointment_id uuid,appointment_type text,appointment_date date,appointment_time time,appointment_location text,appointment_note text,attended_at timestamptz,
  report_id uuid,report_type text,report_status text,report_observations text,report_strengths text,report_concerns text,report_recommendation text,report_reason text)
language plpgsql stable security definer set search_path = '' as $$
declare actor_type text;
begin
  select p.account_type into actor_type from public.profiles p where p.id=auth.uid();
  return query select c.id,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else ch.id end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then '[Caso asignado]' else ch.name end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else ch.age end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else c.family_id end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then 'Psicólogo asignado' else f.full_name end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else c.institution_id end,
    c.psychologist_id,c.status,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else c.institution_decision end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else c.institution_observations end,c.created_at,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.id end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.appointment_type end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.appointment_date end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.appointment_time end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.appointment_location end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.note end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else a.attended_at end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.id end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.report_type end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.status end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.observations end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.strengths end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.concerns end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.recommendation end,
    case when actor_type='profesional' and c.psychologist_id is not null and c.psychologist_id<>auth.uid() then null else r.decision_reason end
  from public.child_interest_cases c join public.institution_children ch on ch.id=c.child_id join public.profiles f on f.id=c.family_id
  left join lateral (select x.* from public.family_appointments x where x.child_interest_case_id=c.id order by x.created_at desc limit 1) a on true
  left join lateral (select x.* from public.child_case_reports x where x.case_id=c.id order by x.created_at desc limit 1) r on true
  where (actor_type='institucion' and c.institution_id=auth.uid() and public.is_pathhome_institution())
    or (actor_type='familia' and c.family_id=auth.uid())
    or (actor_type='profesional' and public.is_pathhome_psychologist());
end; $$;
revoke all on function public.child_case_list(text) from public,anon;
grant execute on function public.child_case_list(text) to authenticated;

drop function if exists public.psychologist_list_family_appointments();
create function public.psychologist_list_family_appointments()
returns table(id uuid,family_id uuid,psychologist_id uuid,title text,appointment_date date,appointment_time time,
  appointment_location text,note text,created_at timestamptz,family_name text,attended_at timestamptz,
  child_interest_case_id uuid,appointment_type text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.family_id,a.psychologist_id,a.title,a.appointment_date,a.appointment_time,a.appointment_location,
    a.note,a.created_at,p.full_name,a.attended_at,a.child_interest_case_id,a.appointment_type
  from public.family_appointments a join public.profiles p on p.id=a.family_id
  where a.psychologist_id=auth.uid() and public.is_pathhome_psychologist()
  order by a.appointment_date,a.appointment_time;
$$;
revoke all on function public.psychologist_list_family_appointments() from public,anon;
grant execute on function public.psychologist_list_family_appointments() to authenticated;

drop function if exists public.child_case_schedule_appointment(uuid,text,date,time,text);
create function public.child_case_schedule_appointment(target_case_id uuid, appointment_kind text, target_date date, target_time time, appointment_note text, target_location text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; result_id uuid; expected_status text;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if not ((appointment_kind='visita_inicial' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status in ('interes_recibido','cita_inicial_programada'))
    or (appointment_kind='visita_hogar' and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() and c.status='visita_hogar_disponible')
    or (appointment_kind='entrega' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status='entrega_disponible')) then raise exception 'No tienes permiso para agendar esta cita en la etapa actual.' using errcode='42501'; end if;
  if target_date < current_date then raise exception 'Selecciona una fecha futura.'; end if;
  if nullif(trim(target_location),'') is null then raise exception 'Escribe la dirección de la cita.'; end if;
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

drop function if exists public.institution_update_initial_visit(uuid,date,time,text);
create function public.institution_update_initial_visit(target_case_id uuid, target_date date, target_time time, target_note text, target_location text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; a public.family_appointments%rowtype;
begin
  if not public.is_pathhome_institution() then raise exception 'Solo una institución validada puede editar esta cita.' using errcode='42501'; end if;
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found or c.institution_id<>auth.uid() or c.status<>'cita_inicial_programada' then raise exception 'La cita ya no se puede editar.' using errcode='42501'; end if;
  if target_date < current_date then raise exception 'Selecciona una fecha de hoy o futura.' using errcode='22007'; end if;
  if nullif(trim(target_location),'') is null then raise exception 'Escribe la dirección de la cita.'; end if;
  select * into a from public.family_appointments where child_interest_case_id=c.id and appointment_type='visita_inicial' for update;
  if not found or a.attended_at is not null then raise exception 'La cita ya fue atendida o no está disponible.' using errcode='42501'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  update public.family_appointments set appointment_date=target_date,appointment_time=target_time,note=nullif(trim(target_note),''),appointment_location=trim(target_location) where id=a.id;
end; $$;
revoke all on function public.institution_update_initial_visit(uuid,date,time,text,text) from public,anon;
grant execute on function public.institution_update_initial_visit(uuid,date,time,text,text) to authenticated;

create or replace function public.notify_family_appointment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare family_message text;
begin
  if tg_op = 'DELETE' then
    insert into public.family_notifications(family_id,category,title,message) values(old.family_id,'cita','Cita cancelada','La cita "'||old.title||'" del '||to_char(old.appointment_date,'DD/MM/YYYY')||' fue cancelada.');
    if old.psychologist_id is not null then insert into public.family_notifications(family_id,category,title,message) values(old.psychologist_id,'cita','Cita cancelada','Una cita de tu agenda fue cancelada.'); end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.title is not distinct from new.title and old.appointment_date is not distinct from new.appointment_date
    and old.appointment_time is not distinct from new.appointment_time and old.note is not distinct from new.note
    and old.appointment_location is not distinct from new.appointment_location then return new; end if;
  family_message := '"'||new.title||'" está programada para el '||to_char(new.appointment_date,'DD/MM/YYYY')||' a las '||left(new.appointment_time::text,5)||'.'
    || case when nullif(trim(new.appointment_location),'') is null then '' else ' Ubicación: '||trim(new.appointment_location)||'.' end;
  insert into public.family_notifications(family_id,category,title,message) values(new.family_id,'cita',case when tg_op='INSERT' then 'Nueva cita agendada' else 'Cita actualizada' end,family_message);
  if new.psychologist_id is not null then insert into public.family_notifications(family_id,category,title,message) values(new.psychologist_id,'cita',case when tg_op='INSERT' then 'Cita agendada' else 'Cita actualizada' end,'Tu agenda fue actualizada.'); end if;
  return new;
end; $$;
