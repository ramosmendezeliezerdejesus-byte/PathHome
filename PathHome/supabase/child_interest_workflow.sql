-- Flujo privado de interés, asignación profesional, visitas, informes y entrega.
-- Ejecutar después de family_cases.sql, institution_children.sql, family_notifications.sql,
-- institution_notifications.sql y family_psychological_reports.sql.

create or replace function public.is_pathhome_psychologist()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.verification_requests v on v.user_id = p.id
    where p.id = auth.uid() and p.account_type = 'profesional' and v.account_type = 'profesional' and v.status = 'aprobada'
  );
$$;
revoke all on function public.is_pathhome_psychologist() from public,anon;
grant execute on function public.is_pathhome_psychologist() to authenticated;

create table if not exists public.child_interest_cases (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.institution_children(id) on delete restrict,
  institution_id uuid not null references auth.users(id) on delete restrict,
  family_id uuid not null references public.profiles(id) on delete restrict,
  psychologist_id uuid references public.profiles(id) on delete restrict,
  status text not null default 'interes_recibido' check (status in (
    'interes_recibido','cita_inicial_programada','informe_visita_pendiente','informe_visita_revision','informe_visita_corregir',
    'visita_hogar_disponible','cita_hogar_programada','evaluacion_hogar_pendiente','evaluacion_hogar_revision',
    'evaluacion_hogar_no_favorable','entrega_disponible','cita_entrega_programada','entrega_confirmada','finalizado'
  )),
  institution_decision text check (institution_decision in ('favorable','no_favorable')),
  institution_observations text,
  delivery_confirmed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, institution_id, family_id)
);
create unique index if not exists institution_children_id_owner_uidx on public.institution_children(id,institution_id);
create unique index if not exists child_interest_case_id_owner_uidx on public.child_interest_cases(id,institution_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='child_interest_cases_child_owner_fk') then
    alter table public.child_interest_cases add constraint child_interest_cases_child_owner_fk foreign key(child_id,institution_id) references public.institution_children(id,institution_id) on delete restrict;
  end if;
end $$;
create unique index if not exists child_interest_one_active_psychologist_idx
  on public.child_interest_cases(psychologist_id) where psychologist_id is not null and status <> 'finalizado';
create index if not exists child_interest_institution_status_idx on public.child_interest_cases(institution_id,status,created_at desc);
create index if not exists child_interest_family_idx on public.child_interest_cases(family_id,created_at desc);
create index if not exists child_interest_psychologist_idx on public.child_interest_cases(psychologist_id,status,created_at desc);
alter table public.child_interest_cases enable row level security;
revoke all on public.child_interest_cases from anon, authenticated;
grant select on public.child_interest_cases to authenticated;
drop policy if exists "Family reads own child interest cases" on public.child_interest_cases;
create policy "Family reads own child interest cases" on public.child_interest_cases for select to authenticated using (family_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='familia'));
drop policy if exists "Responsible institution reads child interest cases" on public.child_interest_cases;
create policy "Responsible institution reads child interest cases" on public.child_interest_cases for select to authenticated using (institution_id = auth.uid() and public.is_pathhome_institution());
drop policy if exists "Assigned psychologist reads child interest cases" on public.child_interest_cases;
create policy "Assigned psychologist reads child interest cases" on public.child_interest_cases for select to authenticated using (psychologist_id = auth.uid() and public.is_pathhome_psychologist());
drop policy if exists "Verified psychologists read available child cases" on public.child_interest_cases;
create policy "Verified psychologists read available child cases" on public.child_interest_cases for select to authenticated using (psychologist_id is null and public.is_pathhome_psychologist());

alter table public.family_appointments alter column psychologist_id drop not null;
alter table public.family_appointments add column if not exists child_interest_case_id uuid references public.child_interest_cases(id) on delete cascade;
alter table public.family_appointments add column if not exists institution_id uuid references auth.users(id) on delete restrict;
alter table public.family_appointments add column if not exists appointment_type text not null default 'psicologica';
alter table public.family_appointments add column if not exists organizer_id uuid references public.profiles(id);
alter table public.family_appointments add column if not exists attended_at timestamptz;
alter table public.family_appointments drop constraint if exists family_appointments_appointment_type_check;
alter table public.family_appointments add constraint family_appointments_appointment_type_check check (appointment_type in ('psicologica','visita_inicial','visita_hogar','entrega'));
create unique index if not exists child_interest_one_appointment_per_stage_idx on public.family_appointments(child_interest_case_id,appointment_type) where child_interest_case_id is not null;
create unique index if not exists family_appointments_id_case_uidx on public.family_appointments(id,child_interest_case_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='family_appointments_case_owner_fk') then
    alter table public.family_appointments add constraint family_appointments_case_owner_fk foreign key(child_interest_case_id,institution_id) references public.child_interest_cases(id,institution_id) match full on delete cascade;
  end if;
end $$;

drop policy if exists "Psychologists schedule approved families" on public.family_appointments;
create policy "Psychologists schedule approved families" on public.family_appointments for insert to authenticated
  with check (child_interest_case_id is null and psychologist_id=auth.uid()
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='profesional')
    and exists(select 1 from public.family_cases c where c.family_id=family_appointments.family_id and c.status='aprobada'));
drop policy if exists "Psychologists update their scheduled appointments" on public.family_appointments;
create policy "Psychologists update their scheduled appointments" on public.family_appointments for update to authenticated
  using (psychologist_id=auth.uid() and child_interest_case_id is null)
  with check (psychologist_id=auth.uid() and child_interest_case_id is null
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='profesional')
    and exists(select 1 from public.family_cases c where c.family_id=family_appointments.family_id and c.status='aprobada'));
drop policy if exists "Psychologists delete their scheduled appointments" on public.family_appointments;
create policy "Psychologists delete their scheduled appointments" on public.family_appointments for delete to authenticated
  using (psychologist_id=auth.uid() and child_interest_case_id is null);

create or replace function public.protect_child_case_appointment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.child_interest_case_id is not null and current_setting('pathhome.child_case_write',true) is distinct from 'on' then
    raise exception 'Las citas del proceso solo pueden cambiarse desde su flujo autorizado.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.protect_child_case_appointment() from public,anon,authenticated;
drop trigger if exists protect_child_case_appointment_update on public.family_appointments;
drop trigger if exists protect_child_case_appointment_delete on public.family_appointments;
create trigger protect_child_case_appointment_update before update on public.family_appointments for each row execute function public.protect_child_case_appointment();
create trigger protect_child_case_appointment_delete before delete on public.family_appointments for each row execute function public.protect_child_case_appointment();

create table if not exists public.child_case_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.child_interest_cases(id) on delete cascade,
  appointment_id uuid not null references public.family_appointments(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  report_type text not null check (report_type in ('visita_inicial','evaluacion_hogar')),
  observations text not null,
  strengths text not null default '',
  concerns text not null default '',
  recommendation text not null,
  status text not null default 'pendiente_revision' check (status in ('pendiente_revision','rechazado','aprobado','favorable','no_favorable')),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='child_case_reports_appointment_case_fk') then
    alter table public.child_case_reports add constraint child_case_reports_appointment_case_fk foreign key(appointment_id,case_id) references public.family_appointments(id,child_interest_case_id) on delete cascade;
  end if;
end $$;
alter table public.child_case_reports enable row level security;
revoke all on public.child_case_reports from anon, authenticated;
grant select on public.child_case_reports to authenticated;
drop policy if exists "Case participants read reports" on public.child_case_reports;
create policy "Case participants read reports" on public.child_case_reports for select to authenticated using (
 exists (select 1 from public.child_interest_cases c where c.id=case_id and (
   (c.family_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='familia'))
   or (c.institution_id=auth.uid() and public.is_pathhome_institution())
   or (c.psychologist_id=auth.uid() and public.is_pathhome_psychologist())
 ))
);

create table if not exists public.child_case_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.child_interest_cases(id) on delete cascade,
  report_id uuid not null references public.child_case_reports(id) on delete restrict,
  institution_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('favorable','no_favorable')),
  observations text,
  created_at timestamptz not null default now()
);
alter table public.child_case_decisions enable row level security;
revoke all on public.child_case_decisions from anon,authenticated;
grant select on public.child_case_decisions to authenticated;
drop policy if exists "Case participants read institutional decisions" on public.child_case_decisions;
create policy "Case participants read institutional decisions" on public.child_case_decisions for select to authenticated using (
  (institution_id=auth.uid() and public.is_pathhome_institution())
  or exists(select 1 from public.child_interest_cases c where c.id=case_id and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist())
);

drop function if exists public.psychologist_list_family_appointments();
create function public.psychologist_list_family_appointments()
returns table(id uuid,family_id uuid,psychologist_id uuid,title text,appointment_date date,appointment_time time,note text,created_at timestamptz,family_name text,attended_at timestamptz,child_interest_case_id uuid,appointment_type text)
language sql stable security definer set search_path = '' as $$
  select a.id,a.family_id,a.psychologist_id,a.title,a.appointment_date,a.appointment_time,a.note,a.created_at,p.full_name,a.attended_at,a.child_interest_case_id,a.appointment_type
  from public.family_appointments a join public.profiles p on p.id=a.family_id
  where a.psychologist_id=auth.uid() and public.is_pathhome_psychologist()
  order by a.appointment_date,a.appointment_time;
$$;
revoke all on function public.psychologist_list_family_appointments() from public,anon;
grant execute on function public.psychologist_list_family_appointments() to authenticated;

create or replace function public.block_legacy_report_for_child_case()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.family_appointments a where a.id=new.appointment_id and a.child_interest_case_id is not null) then
    raise exception 'Usa el informe de la etapa del proceso de vinculación.' using errcode='42501';
  end if;
  return new;
end; $$;
revoke all on function public.block_legacy_report_for_child_case() from public,anon,authenticated;
do $$ begin
 if pg_catalog.to_regclass('public.family_psych_reports') is not null then
   execute 'drop trigger if exists block_legacy_report_for_child_case on public.family_psych_reports';
   execute 'create trigger block_legacy_report_for_child_case before insert or update on public.family_psych_reports for each row execute function public.block_legacy_report_for_child_case()';
 end if;
end $$;

-- La notificación histórica de citas suponía que toda cita tenía psicólogo.
-- El nuevo flujo permite que la institución agende la primera cita.
create or replace function public.notify_family_appointment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    insert into public.family_notifications(family_id,category,title,message) values(old.family_id,'cita','Cita cancelada','La cita "'||old.title||'" del '||to_char(old.appointment_date,'DD/MM/YYYY')||' fue cancelada.');
    if old.psychologist_id is not null then insert into public.family_notifications(family_id,category,title,message) values(old.psychologist_id,'cita','Cita cancelada','Una cita de tu agenda fue cancelada.'); end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.title is not distinct from new.title and old.appointment_date is not distinct from new.appointment_date and old.appointment_time is not distinct from new.appointment_time and old.note is not distinct from new.note then return new; end if;
  insert into public.family_notifications(family_id,category,title,message) values(new.family_id,'cita',case when tg_op='INSERT' then 'Nueva cita agendada' else 'Cita actualizada' end,'"'||new.title||'" está programada para el '||to_char(new.appointment_date,'DD/MM/YYYY')||' a las '||left(new.appointment_time::text,5)||'.');
  if new.psychologist_id is not null then insert into public.family_notifications(family_id,category,title,message) values(new.psychologist_id,'cita',case when tg_op='INSERT' then 'Cita agendada' else 'Cita actualizada' end,'Tu agenda fue actualizada.'); end if;
  return new;
end; $$;

-- RPCs run as the database owner and enforce actor, ownership and stage on every write.
create or replace function public.family_express_child_interest(target_child_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare child_row public.institution_children%rowtype; new_case uuid;
begin
  if not public.family_can_access_child_catalog() then raise exception 'Tu familia aún no tiene acceso al catálogo.' using errcode='42501'; end if;
  select * into child_row from public.institution_children where id=target_child_id for update;
  if not found then raise exception 'El perfil ya no está disponible.'; end if;
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

create or replace function public.child_case_list(target_role text default 'auto')
returns table(id uuid,child_id uuid,child_name text,child_age integer,family_id uuid,family_name text,institution_id uuid,
  psychologist_id uuid,status text,institution_decision text,institution_observations text,created_at timestamptz,
  appointment_id uuid,appointment_type text,appointment_date date,appointment_time time,appointment_note text,attended_at timestamptz,
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

create or replace function public.psychologist_claim_child_case(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f_id uuid; pending_report boolean;
begin
  if not public.is_pathhome_psychologist() then raise exception 'Solo un psicólogo validado puede tomar casos.' using errcode='42501'; end if;
  if exists(select 1 from public.child_interest_cases where psychologist_id=auth.uid() and status<>'finalizado') then raise exception 'Primero debes finalizar tu caso activo.' using errcode='23514'; end if;
  update public.child_interest_cases set psychologist_id=auth.uid(),updated_at=now()
    where id=target_case_id and psychologist_id is null and status<>'finalizado';
  if not found then raise exception 'El caso ya fue asignado o no está disponible.'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  update public.family_appointments set psychologist_id=auth.uid()
    where child_interest_case_id=target_case_id and appointment_type='visita_inicial' and psychologist_id is null;
  select family_id into f_id from public.child_interest_cases where id=target_case_id;
  select exists(select 1 from public.child_case_reports where case_id=target_case_id and report_type='visita_inicial' and status='pendiente_revision') into pending_report;
  if pending_report then insert into public.family_notifications(family_id,related_family_id,category,title,message) values(auth.uid(),f_id,'sistema','Informe institucional pendiente de revisión','La institución ya envió el informe de la visita inicial para tu caso.'); end if;
exception when unique_violation then raise exception 'Primero debes finalizar tu caso activo.' using errcode='23514';
end; $$;

create or replace function public.child_case_schedule_appointment(target_case_id uuid, appointment_kind text, target_date date, target_time time, appointment_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; result_id uuid; expected_status text;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if not ((appointment_kind='visita_inicial' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status in ('interes_recibido','cita_inicial_programada'))
    or (appointment_kind='visita_hogar' and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() and c.status='visita_hogar_disponible')
    or (appointment_kind='entrega' and c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status='entrega_disponible')) then raise exception 'No tienes permiso para agendar esta cita en la etapa actual.' using errcode='42501'; end if;
  if target_date < current_date then raise exception 'Selecciona una fecha futura.'; end if;
  insert into public.family_appointments(family_id,psychologist_id,institution_id,organizer_id,child_interest_case_id,appointment_type,title,appointment_date,appointment_time,note)
  values(c.family_id,c.psychologist_id,c.institution_id,auth.uid(),c.id,appointment_kind,
    case appointment_kind when 'visita_inicial' then 'Visita inicial en la institución' when 'visita_hogar' then 'Visita al hogar' else 'Coordinación de entrega' end,target_date,target_time,appointment_note)
  returning id into result_id;
  expected_status := case appointment_kind when 'visita_inicial' then 'cita_inicial_programada' when 'visita_hogar' then 'cita_hogar_programada' else 'cita_entrega_programada' end;
  update public.child_interest_cases set status=expected_status,updated_at=now() where id=c.id;
  if appointment_kind='visita_hogar' then
    insert into public.institution_notifications(institution_id,related_family_id,category,title,message) values(c.institution_id,c.family_id,'informe','Visita al hogar agendada','El psicólogo responsable programó la visita al hogar.');
  end if;
  return result_id;
end; $$;

create or replace function public.child_case_confirm_appointment(target_appointment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.family_appointments%rowtype; c public.child_interest_cases%rowtype;
begin
  select * into a from public.family_appointments where id=target_appointment_id and child_interest_case_id is not null;
  if not found then raise exception 'Cita no encontrada.'; end if;
  select * into c from public.child_interest_cases where id=a.child_interest_case_id for update;
  if a.appointment_date > current_date then raise exception 'La asistencia solo se confirma el día de la cita o después.'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  if a.appointment_type='visita_inicial' and c.institution_id=auth.uid() and public.is_pathhome_institution() then
    update public.family_appointments set attended_at=now() where id=a.id;
    update public.child_interest_cases set status='informe_visita_pendiente',updated_at=now() where id=c.id;
  elsif a.appointment_type='visita_hogar' and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() then
    update public.family_appointments set attended_at=now() where id=a.id;
    update public.child_interest_cases set status='evaluacion_hogar_pendiente',updated_at=now() where id=c.id;
  elsif a.appointment_type='entrega' and c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() then
    update public.family_appointments set attended_at=now() where id=a.id;
    update public.child_interest_cases set status='entrega_confirmada',delivery_confirmed_at=now(),updated_at=now() where id=c.id;
    insert into public.family_notifications(family_id,related_family_id,category,title,message) values(c.family_id,c.family_id,'sistema','Entrega confirmada','El psicólogo confirmó la entrega. El caso se cerrará después de completar el registro final.');
    insert into public.institution_notifications(institution_id,related_family_id,category,title,message) values(c.institution_id,c.family_id,'sistema','Entrega confirmada','El psicólogo confirmó la entrega; el caso sigue activo hasta el cierre final.');
  else raise exception 'No puedes confirmar esta cita.' using errcode='42501'; end if;
end; $$;

create or replace function public.child_case_submit_report(target_case_id uuid, observations text, strengths text, concerns text, recommendation text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; a public.family_appointments%rowtype; kind text; report_uuid uuid;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status in ('informe_visita_pendiente','informe_visita_corregir') then kind:='visita_inicial';
  elsif c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() and c.status='evaluacion_hogar_pendiente' then kind:='evaluacion_hogar';
  else raise exception 'No puedes enviar un informe en la etapa actual.' using errcode='42501'; end if;
  if nullif(trim(coalesce(observations,'')),'') is null or nullif(trim(coalesce(recommendation,'')),'') is null then raise exception 'Completa las observaciones y la recomendación.'; end if;
  select * into a from public.family_appointments
    where child_interest_case_id=c.id
      and appointment_type=case kind when 'visita_inicial' then 'visita_inicial' when 'evaluacion_hogar' then 'visita_hogar' end
    order by created_at desc limit 1;
  if not found then raise exception 'No se encontró la cita de esta etapa.'; end if;
  insert into public.child_case_reports(case_id,appointment_id,author_id,report_type,observations,strengths,concerns,recommendation)
  values(c.id,a.id,auth.uid(),kind,trim(observations),trim(coalesce(strengths,'')),trim(coalesce(concerns,'')),trim(recommendation)) returning id into report_uuid;
  update public.child_interest_cases set status=case kind when 'visita_inicial' then 'informe_visita_revision' else 'evaluacion_hogar_revision' end,updated_at=now() where id=c.id;
  if kind='visita_inicial' then
    if c.psychologist_id is not null then insert into public.family_notifications(family_id,related_family_id,category,title,message) values(c.psychologist_id,c.family_id,'sistema','Informe institucional disponible','La institución envió el informe de la visita inicial para tu revisión.'); end if;
  else
    insert into public.institution_notifications(institution_id,related_family_id,category,title,message) values(c.institution_id,c.family_id,'informe','Evaluación del hogar recibida','El psicólogo responsable envió la evaluación del hogar.');
  end if;
  return report_uuid;
end; $$;

create or replace function public.psychologist_decide_institution_visit_report(target_report_id uuid, approve boolean, decision_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.child_case_reports%rowtype; c public.child_interest_cases%rowtype;
begin
  select * into r from public.child_case_reports where id=target_report_id and report_type='visita_inicial';
  if not found then raise exception 'Informe no encontrado.'; end if;
  select * into c from public.child_interest_cases where id=r.case_id for update;
  if c.psychologist_id<>auth.uid() or not public.is_pathhome_psychologist() or c.status<>'informe_visita_revision' then raise exception 'Solo el psicólogo asignado puede revisar este informe.' using errcode='42501'; end if;
  update public.child_case_reports set status=case when approve then 'aprobado' else 'rechazado' end,decision_reason=nullif(trim(decision_note),''),updated_at=now() where id=r.id;
  update public.child_interest_cases set status=case when approve then 'visita_hogar_disponible' else 'informe_visita_corregir' end,updated_at=now() where id=c.id;
  insert into public.institution_notifications(institution_id,related_family_id,category,title,message)
  values(c.institution_id,c.family_id,'informe',case when approve then 'Informe de visita aprobado' else 'Informe requiere corrección' end,
    coalesce(nullif(trim(decision_note),''),case when approve then 'El psicólogo aprobó el informe; el caso puede avanzar.' else 'El psicólogo solicitó completar el informe.' end));
end; $$;

create or replace function public.institution_decide_home_evaluation(target_case_id uuid, favorable boolean, decision_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; r public.child_case_reports%rowtype;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  select * into r from public.child_case_reports where case_id=c.id and report_type='evaluacion_hogar' order by created_at desc limit 1;
  if not found then raise exception 'No se encontró la evaluación del hogar.'; end if;
  if c.institution_id<>auth.uid() or not public.is_pathhome_institution() or c.status not in ('evaluacion_hogar_revision','evaluacion_hogar_no_favorable') then raise exception 'No puedes decidir esta evaluación.' using errcode='42501'; end if;
  update public.child_case_reports set status=case when favorable then 'favorable' else 'no_favorable' end,decision_reason=nullif(trim(decision_note),''),updated_at=now() where id=r.id;
  insert into public.child_case_decisions(case_id,report_id,institution_id,decision,observations) values(c.id,r.id,c.institution_id,case when favorable then 'favorable' else 'no_favorable' end,nullif(trim(decision_note),''));
  update public.child_interest_cases set institution_decision=case when favorable then 'favorable' else 'no_favorable' end,institution_observations=nullif(trim(decision_note),''),status=case when favorable then 'entrega_disponible' else 'evaluacion_hogar_no_favorable' end,updated_at=now() where id=c.id;
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
  values(c.family_id,c.family_id,'sistema',case when favorable then 'Evaluación del hogar favorable' else 'Evaluación del hogar no favorable' end,
    coalesce(nullif(trim(decision_note),''),'La institución registró su decisión.'));
  if c.psychologist_id is not null then insert into public.family_notifications(family_id,related_family_id,category,title,message) values(c.psychologist_id,c.family_id,'sistema',case when favorable then 'Evaluación del hogar favorable' else 'Evaluación del hogar no favorable' end,coalesce(nullif(trim(decision_note),''),'La institución registró su decisión.')); end if;
end; $$;

create or replace function public.psychologist_close_child_case(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.child_interest_cases set status='finalizado',closed_at=now(),updated_at=now()
  where id=target_case_id and psychologist_id=auth.uid() and public.is_pathhome_psychologist() and status='entrega_confirmada' and delivery_confirmed_at is not null;
  if not found then raise exception 'El caso solo se cierra después de confirmar la entrega.' using errcode='42501'; end if;
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
  select family_id,family_id,'sistema','Proceso finalizado','La entrega fue confirmada y el caso se cerró.' from public.child_interest_cases where id=target_case_id;
  insert into public.institution_notifications(institution_id,related_family_id,category,title,message)
  select institution_id,family_id,'sistema','Proceso finalizado','El psicólogo confirmó la entrega y cerró el caso.' from public.child_interest_cases where id=target_case_id;
end; $$;

revoke all on function public.family_express_child_interest(uuid),public.child_case_list(text),public.psychologist_claim_child_case(uuid),public.child_case_schedule_appointment(uuid,text,date,time,text),public.child_case_confirm_appointment(uuid),public.child_case_submit_report(uuid,text,text,text,text),public.psychologist_decide_institution_visit_report(uuid,boolean,text),public.institution_decide_home_evaluation(uuid,boolean,text),public.psychologist_close_child_case(uuid) from public,anon;
grant execute on function public.family_express_child_interest(uuid),public.child_case_list(text),public.psychologist_claim_child_case(uuid),public.child_case_schedule_appointment(uuid,text,date,time,text),public.child_case_confirm_appointment(uuid),public.child_case_submit_report(uuid,text,text,text,text),public.psychologist_decide_institution_visit_report(uuid,boolean,text),public.institution_decide_home_evaluation(uuid,boolean,text),public.psychologist_close_child_case(uuid) to authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='child_interest_cases') then alter publication supabase_realtime add table public.child_interest_cases; end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='child_case_reports') then alter publication supabase_realtime add table public.child_case_reports; end if;
 end if;
end $$;
