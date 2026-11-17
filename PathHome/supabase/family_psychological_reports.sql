-- Flujo de asistencia, informe psicológico y resolución institucional.
-- Ejecutar después de family_cases.sql, family_notifications.sql e institution_family_review.sql.

alter table public.family_appointments
  add column if not exists attended_at timestamptz;

create table if not exists public.family_psych_reports (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.family_appointments(id) on delete cascade,
  family_id uuid not null references public.profiles(id) on delete cascade,
  psychologist_id uuid not null references public.profiles(id) on delete cascade,
  observations text not null,
  strengths text not null,
  concerns text not null,
  recommendation text not null,
  status text not null default 'pendiente' check (status in ('pendiente','aceptada','rechazada')),
  decision_reason text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists family_psych_reports_family_created_idx
  on public.family_psych_reports (family_id, created_at desc);
alter table public.family_psych_reports add column if not exists updated_at timestamptz;
update public.family_psych_reports set updated_at = created_at where updated_at is null;
alter table public.family_psych_reports alter column updated_at set default now();
alter table public.family_psych_reports alter column updated_at set not null;
alter table public.family_psych_reports enable row level security;
revoke all on public.family_psych_reports from anon, authenticated;

-- Conserva un marcador de reinicio si se elimina el informe más reciente, para
-- que una decisión antigua no vuelva a habilitar el catálogo por accidente.
create table if not exists public.family_psych_report_resets (
  family_id uuid primary key references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.family_psych_report_resets enable row level security;
revoke all on public.family_psych_report_resets from anon, authenticated;

-- Reemplaza la función para incluir la confirmación de asistencia.
drop function if exists public.psychologist_list_family_appointments();
create function public.psychologist_list_family_appointments()
returns table(id uuid, family_id uuid, psychologist_id uuid, title text, appointment_date date, appointment_time time, note text, created_at timestamptz, family_name text, attended_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.family_id, a.psychologist_id, a.title, a.appointment_date, a.appointment_time, a.note, a.created_at, p.full_name, a.attended_at
  from public.family_appointments a
  join public.profiles p on p.id = a.family_id
  where a.psychologist_id = auth.uid()
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.account_type = 'profesional')
  order by a.appointment_date, a.appointment_time;
$$;
revoke all on function public.psychologist_list_family_appointments() from public, anon;
grant execute on function public.psychologist_list_family_appointments() to authenticated;

create or replace function public.psychologist_confirm_family_attendance(target_appointment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_family_id uuid;
begin
  update public.family_appointments a set attended_at = now()
  where a.id = target_appointment_id and a.psychologist_id = auth.uid()
    and a.attended_at is null
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional');
  if not found then raise exception 'No se encontró una cita asignada a tu cuenta.' using errcode = 'P0002'; end if;
  select a.family_id into target_family_id from public.family_appointments a where a.id = target_appointment_id;
  insert into public.family_notifications (family_id, related_family_id, category, title, message)
  values (target_family_id, target_family_id, 'cita', 'Asistencia a la cita confirmada', 'El psicólogo confirmó que asististe a la cita. La cita ya no aparece entre tus próximas citas.');
end;
$$;

create or replace function public.psychologist_submit_family_report(
  target_appointment_id uuid, report_observations text, report_strengths text,
  report_concerns text, report_recommendation text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare appointment_row public.family_appointments%rowtype; report_id uuid;
begin
  select * into appointment_row from public.family_appointments a
  where a.id = target_appointment_id and a.psychologist_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional')
  for update;
  if not found then raise exception 'No se encontró una cita asignada a tu cuenta.' using errcode = 'P0002'; end if;
  if appointment_row.attended_at is null then raise exception 'Confirma primero que la familia asistió a la cita.' using errcode = '23514'; end if;
  if coalesce(trim(report_observations),'') = '' or coalesce(trim(report_strengths),'') = '' or coalesce(trim(report_concerns),'') = '' or coalesce(trim(report_recommendation),'') = '' then
    raise exception 'Completa las observaciones, fortalezas, aspectos por atender y recomendación.' using errcode = '22023';
  end if;
  insert into public.family_psych_reports (appointment_id, family_id, psychologist_id, observations, strengths, concerns, recommendation)
  values (appointment_row.id, appointment_row.family_id, auth.uid(), trim(report_observations), trim(report_strengths), trim(report_concerns), trim(report_recommendation))
  returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.psychologist_list_family_reports()
returns table(id uuid, appointment_id uuid, family_id uuid, psychologist_id uuid, family_name text, appointment_date date, appointment_time time, observations text, strengths text, concerns text, recommendation text, status text, decision_reason text, decided_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.appointment_id, r.family_id, r.psychologist_id, p.full_name, a.appointment_date, a.appointment_time,
    r.observations, r.strengths, r.concerns, r.recommendation, r.status, r.decision_reason, r.decided_at, r.created_at
  from public.family_psych_reports r
  join public.profiles p on p.id = r.family_id
  join public.family_appointments a on a.id = r.appointment_id
  where r.psychologist_id = auth.uid()
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.account_type = 'profesional')
  order by r.updated_at desc;
$$;

create or replace function public.institution_list_psych_reports()
returns table(id uuid, appointment_id uuid, family_id uuid, psychologist_id uuid, family_name text, appointment_date date, appointment_time time, observations text, strengths text, concerns text, recommendation text, status text, decision_reason text, decided_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.appointment_id, r.family_id, r.psychologist_id, p.full_name, a.appointment_date, a.appointment_time,
    r.observations, r.strengths, r.concerns, r.recommendation, r.status, r.decision_reason, r.decided_at, r.created_at
  from public.family_psych_reports r
  join public.profiles p on p.id = r.family_id
  join public.family_appointments a on a.id = r.appointment_id
  where public.is_pathhome_institution()
  order by (r.status = 'pendiente') desc, r.updated_at desc;
$$;

create or replace function public.institution_decide_psych_report(target_report_id uuid, new_status text, decision_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare report_row public.family_psych_reports%rowtype; reset_latest boolean;
begin
  if not public.is_pathhome_institution() then raise exception 'Solo una institución verificada puede decidir sobre los informes.' using errcode = '42501'; end if;
  if new_status not in ('aceptada','rechazada') then raise exception 'La decisión no es válida.' using errcode = '22023'; end if;
  if new_status = 'rechazada' and coalesce(trim(decision_note),'') = '' then raise exception 'Explica el motivo del rechazo para informar a la familia.' using errcode = '22023'; end if;
  select * into report_row from public.family_psych_reports r where r.id = target_report_id and r.status = 'pendiente' for update;
  if not found then raise exception 'El informe ya fue revisado o no está disponible.' using errcode = 'P0002'; end if;
  update public.family_psych_reports set status = new_status,
    decision_reason = case when new_status = 'rechazada' then trim(decision_note) else null end,
    decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = target_report_id;
  insert into public.family_notifications (family_id, related_family_id, category, title, message)
  values (report_row.family_id, report_row.family_id, 'sistema',
    case when new_status = 'aceptada' then 'Familia aceptada para el catálogo' else 'Decisión sobre tu evaluación' end,
    case when new_status = 'aceptada' then 'La institución aceptó el informe psicológico. Ya puedes acceder al catálogo desde Mi progreso.'
      else 'La institución decidió que todavía no puedes pasar al catálogo. Motivo: ' || trim(decision_note) end);
  if new_status = 'rechazada' then
    insert into public.family_notifications (family_id, related_family_id, category, title, message)
    values (report_row.psychologist_id, report_row.family_id, 'sistema', 'Familia no aceptada para el catálogo',
      'La institución revisó el informe de esta familia y decidió que todavía no está apta. Motivo: ' || trim(decision_note) || '. Puedes programar una nueva cita de seguimiento.');
  end if;
end;
$$;

create or replace function public.psychologist_update_family_report(
  target_report_id uuid, report_observations text, report_strengths text,
  report_concerns text, report_recommendation text
)
returns void language plpgsql security definer set search_path = '' as $$
declare report_row public.family_psych_reports%rowtype;
begin
  select * into report_row from public.family_psych_reports r
  where r.id = target_report_id and r.psychologist_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional')
  for update;
  if not found then raise exception 'No se encontró un informe creado por tu cuenta.' using errcode = 'P0002'; end if;
  if report_row.status <> 'pendiente' then raise exception 'Este informe ya fue revisado por la institución y no se puede editar.' using errcode = '55000'; end if;
  if coalesce(trim(report_observations),'') = '' or coalesce(trim(report_strengths),'') = '' or coalesce(trim(report_concerns),'') = '' or coalesce(trim(report_recommendation),'') = '' then
    raise exception 'Completa las observaciones, fortalezas, aspectos por atender y recomendación.' using errcode = '22023';
  end if;
  update public.family_psych_reports set observations = trim(report_observations), strengths = trim(report_strengths),
    concerns = trim(report_concerns), recommendation = trim(report_recommendation), status = 'pendiente',
    decision_reason = null, decided_by = null, decided_at = null, updated_at = now()
  where id = target_report_id;
  insert into public.family_notifications (family_id, related_family_id, category, title, message)
  values (report_row.family_id, report_row.family_id, 'sistema', 'Informe psicológico actualizado',
    'El psicólogo actualizó tu informe. La institución debe revisar la versión nueva antes de confirmar el resultado.');
end;
$$;

create or replace function public.psychologist_delete_family_report(target_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare report_row public.family_psych_reports%rowtype; reset_latest boolean;
begin
  select * into report_row from public.family_psych_reports r
  where r.id = target_report_id and r.psychologist_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional')
  for update;
  if not found then raise exception 'No se encontró un informe creado por tu cuenta.' using errcode = 'P0002'; end if;
  select not exists (
    select 1 from public.family_psych_reports newer
    where newer.family_id = report_row.family_id and newer.id <> report_row.id and newer.updated_at > report_row.updated_at
  ) into reset_latest;
  if reset_latest then
    insert into public.family_psych_report_resets (family_id, updated_at)
    values (report_row.family_id, now())
    on conflict (family_id) do update set updated_at = excluded.updated_at;
  end if;
  delete from public.family_psych_reports where id = target_report_id;
  insert into public.family_notifications (family_id, related_family_id, category, title, message)
  values (report_row.family_id, report_row.family_id, 'sistema', 'Informe psicológico retirado',
    case when reset_latest then 'El psicólogo retiró el informe más reciente. El resultado queda pendiente hasta que se envíe una nueva versión.'
      else 'El psicólogo retiró una versión anterior del informe. El resultado vigente no cambia.' end);
end;
$$;

create or replace function public.family_latest_report_outcome()
returns table(status text, reason text, decided_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare latest_status text; latest_reason text; latest_decision timestamptz; latest_updated timestamptz; reset_at timestamptz;
begin
  select resets.updated_at into reset_at from public.family_psych_report_resets resets where resets.family_id = auth.uid();
  select r.status, r.decision_reason, r.decided_at, r.updated_at
    into latest_status, latest_reason, latest_decision, latest_updated
  from public.family_psych_reports r where r.family_id = auth.uid() order by r.updated_at desc limit 1;
  if reset_at is not null and (latest_updated is null or reset_at >= latest_updated) then
    return query select 'pendiente'::text, null::text, null::timestamptz;
  elsif latest_updated is not null then
    return query select latest_status, latest_reason, latest_decision;
  end if;
end;
$$;

revoke all on function public.psychologist_confirm_family_attendance(uuid) from public, anon;
revoke all on function public.psychologist_submit_family_report(uuid,text,text,text,text) from public, anon;
revoke all on function public.psychologist_list_family_reports() from public, anon;
revoke all on function public.psychologist_update_family_report(uuid,text,text,text,text) from public, anon;
revoke all on function public.psychologist_delete_family_report(uuid) from public, anon;
revoke all on function public.institution_list_psych_reports() from public, anon;
revoke all on function public.institution_decide_psych_report(uuid,text,text) from public, anon;
revoke all on function public.family_latest_report_outcome() from public, anon;
grant execute on function public.psychologist_confirm_family_attendance(uuid) to authenticated;
grant execute on function public.psychologist_submit_family_report(uuid,text,text,text,text) to authenticated;
grant execute on function public.psychologist_list_family_reports() to authenticated;
grant execute on function public.psychologist_update_family_report(uuid,text,text,text,text) to authenticated;
grant execute on function public.psychologist_delete_family_report(uuid) to authenticated;
grant execute on function public.institution_list_psych_reports() to authenticated;
grant execute on function public.institution_decide_psych_report(uuid,text,text) to authenticated;
grant execute on function public.family_latest_report_outcome() to authenticated;

-- Aclara que la revisión del expediente documental la realiza la institución.
create or replace function public.notify_family_case_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('aprobada', 'rechazada')
    or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then return new; end if;
  insert into public.family_notifications (family_id, category, title, message)
  values (new.family_id, 'sistema',
    case when new.status = 'aprobada' then 'Familia aceptada' else 'Revisión del expediente' end,
    case when new.status = 'aprobada' then 'La institución aceptó tu expediente. El psicólogo podrá agendar una cita.'
      else 'La institución revisó tu expediente. Consulta tus documentos para ver qué debes actualizar.' end);
  if new.status = 'aprobada' then
    insert into public.family_notifications (family_id, related_family_id, category, title, message)
    select professional.id, new.family_id, 'sistema', 'Familia lista para evaluación',
      'La institución aceptó el expediente de ' || family.full_name || '. Puedes agendarle una cita.'
    from public.profiles professional cross join public.profiles family
    where professional.account_type = 'profesional' and family.id = new.family_id;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_family_case_review() from public, anon, authenticated;
