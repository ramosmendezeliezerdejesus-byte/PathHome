-- Notifications stored for each family. Run after schema.sql and family_cases.sql.
create table if not exists public.family_notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('documento', 'cita', 'sistema')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  related_family_id uuid references public.profiles(id) on delete set null
);

alter table public.family_notifications
  add column if not exists related_family_id uuid references public.profiles(id) on delete set null;

create index if not exists family_notifications_family_created_idx
  on public.family_notifications (family_id, created_at desc);

alter table public.family_notifications enable row level security;
revoke all on public.family_notifications from anon, authenticated;
grant select, update (read_at) on public.family_notifications to authenticated;

drop policy if exists "Families read their notifications" on public.family_notifications;
create policy "Families read their notifications"
  on public.family_notifications for select to authenticated
  using (family_id = (select auth.uid()));

drop policy if exists "Families mark their notifications as read" on public.family_notifications;
create policy "Families mark their notifications as read"
  on public.family_notifications for update to authenticated
  using (family_id = (select auth.uid()))
  with check (family_id = (select auth.uid()));

create or replace function public.notify_family_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.name is not distinct from new.name
    and old.document_type is not distinct from new.document_type
    and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  insert into public.family_notifications (family_id, category, title, message)
  values (
    new.family_id,
    'documento',
    case when tg_op = 'INSERT' then 'Documento recibido' else 'Documento actualizado' end,
    new.document_type || case when tg_op = 'INSERT' then ' se agregó' else ' se actualizó' end || ' en tu expediente.'
  );
  return new;
end;
$$;

revoke all on function public.notify_family_document_change() from public, anon, authenticated;
drop trigger if exists family_document_notification on public.family_documents;
create trigger family_document_notification
  after insert or update on public.family_documents
  for each row execute function public.notify_family_document_change();

create or replace function public.notify_family_case_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('aprobada', 'rechazada')
    or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  insert into public.family_notifications (family_id, category, title, message)
  values (
    new.family_id,
    'sistema',
    case when new.status = 'aprobada' then 'Familia aceptada' else 'Revisión del expediente' end,
    case when new.status = 'aprobada'
      then 'El administrador aceptó tu expediente. El psicólogo podrá agendar una cita.'
      else 'El administrador revisó tu expediente. Consulta tus documentos para ver qué debes actualizar.'
    end
  );
  if new.status = 'aprobada' then
    insert into public.family_notifications (family_id, related_family_id, category, title, message)
    select professional.id, new.family_id, 'sistema', 'Familia lista para evaluación',
      'El expediente de ' || family.full_name || ' fue aceptado por el administrador. Puedes agendarle una cita.'
    from public.profiles professional
    cross join public.profiles family
    where professional.account_type = 'profesional'
      and family.id = new.family_id;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_family_case_review() from public, anon, authenticated;
drop trigger if exists family_case_review_notification on public.family_cases;
create trigger family_case_review_notification
  after insert or update of status on public.family_cases
  for each row execute function public.notify_family_case_review();

create or replace function public.notify_family_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_family_id uuid;
  notification_title text;
  notification_message text;
begin
  if tg_op = 'DELETE' then
    target_family_id := old.family_id;
    notification_title := 'Cita cancelada';
    notification_message := 'La cita "' || old.title || '" del ' || to_char(old.appointment_date, 'DD/MM/YYYY') || ' fue cancelada.';
    insert into public.family_notifications (family_id, category, title, message)
    values (target_family_id, 'cita', notification_title, notification_message);
    insert into public.family_notifications (family_id, category, title, message)
    values (old.psychologist_id, 'cita', 'Cita cancelada', 'La cita con una familia fue cancelada.');
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.title is not distinct from new.title
    and old.appointment_date is not distinct from new.appointment_date
    and old.appointment_time is not distinct from new.appointment_time
    and old.note is not distinct from new.note then
    return new;
  end if;

  target_family_id := new.family_id;
  notification_title := case when tg_op = 'INSERT' then 'Nueva cita agendada' else 'Cita actualizada' end;
  notification_message := '"' || new.title || '" está programada para el ' || to_char(new.appointment_date, 'DD/MM/YYYY') || ' a las ' || left(new.appointment_time::text, 5) || '.';
  insert into public.family_notifications (family_id, category, title, message)
  values (target_family_id, 'cita', notification_title, notification_message);
  insert into public.family_notifications (family_id, category, title, message)
  values (
    new.psychologist_id,
    'cita',
    case when tg_op = 'INSERT' then 'Cita agendada' else 'Cita actualizada' end,
    'La agenda de una familia fue ' || case when tg_op = 'INSERT' then 'actualizada con una nueva cita.' else 'actualizada.' end
  );
  return new;
end;
$$;

revoke all on function public.notify_family_appointment_change() from public, anon, authenticated;
drop trigger if exists family_appointment_notification on public.family_appointments;
create trigger family_appointment_notification
  after insert or update or delete on public.family_appointments
  for each row execute function public.notify_family_appointment_change();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'family_notifications'
    ) then
    alter publication supabase_realtime add table public.family_notifications;
  end if;
end;
$$;

-- Backfill current records so installing this module does not leave the inbox empty.
insert into public.family_notifications (family_id, category, title, message, created_at)
select d.family_id, 'documento', 'Documento recibido', d.document_type || ' se agregó en tu expediente.', d.created_at
from public.family_documents d
where not exists (
  select 1 from public.family_notifications n
  where n.family_id = d.family_id and n.category = 'documento'
    and n.title = 'Documento recibido'
    and n.message = d.document_type || ' se agregó en tu expediente.'
    and n.created_at = d.created_at
);

insert into public.family_notifications (family_id, category, title, message, created_at)
select c.family_id, 'sistema', 'Familia aceptada',
  'El administrador aceptó tu expediente. El psicólogo podrá agendar una cita.',
  coalesce(c.reviewed_at, c.created_at)
from public.family_cases c
where c.status = 'aprobada'
  and not exists (
    select 1 from public.family_notifications n
    where n.family_id = c.family_id and n.category = 'sistema'
      and n.title = 'Familia aceptada'
      and n.created_at = coalesce(c.reviewed_at, c.created_at)
  );

insert into public.family_notifications (family_id, category, title, message, created_at)
select p.id, 'sistema', 'Familia lista para evaluación',
  'Un expediente fue aceptado por el administrador y está disponible para agendar una cita.',
  coalesce(c.reviewed_at, c.created_at)
from public.family_cases c
cross join public.profiles p
where c.status = 'aprobada' and p.account_type = 'profesional'
  and not exists (
    select 1 from public.family_notifications n
    where n.family_id = p.id and n.category = 'sistema'
      and n.title = 'Familia lista para evaluación'
      and n.created_at = coalesce(c.reviewed_at, c.created_at)
  );

insert into public.family_notifications (family_id, category, title, message, created_at)
select a.family_id, 'cita', 'Nueva cita agendada',
  '"' || a.title || '" está programada para el ' || to_char(a.appointment_date, 'DD/MM/YYYY') || ' a las ' || left(a.appointment_time::text, 5) || '.',
  a.created_at
from public.family_appointments a
where a.appointment_date >= current_date
  and not exists (
    select 1 from public.family_notifications n
    where n.family_id = a.family_id and n.category = 'cita'
      and n.title = 'Nueva cita agendada' and n.created_at = a.created_at
  );

insert into public.family_notifications (family_id, category, title, message, created_at)
select a.psychologist_id, 'cita', 'Cita agendada',
  'La agenda de una familia fue actualizada con una nueva cita.', a.created_at
from public.family_appointments a
where a.appointment_date >= current_date
  and not exists (
    select 1 from public.family_notifications n
    where n.family_id = a.psychologist_id and n.category = 'cita'
      and n.title = 'Cita agendada' and n.created_at = a.created_at
  );
