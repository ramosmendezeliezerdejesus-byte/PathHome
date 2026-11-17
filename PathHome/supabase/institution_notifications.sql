-- Notificaciones institucionales persistentes.
-- Ejecutar después de family_cases.sql, institution_family_review.sql y family_psychological_reports.sql.

create table if not exists public.institution_notifications (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.profiles(id) on delete cascade,
  related_family_id uuid references public.profiles(id) on delete set null,
  category text not null check (category in ('documento', 'informe', 'sistema')),
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists institution_notifications_owner_created_idx
  on public.institution_notifications (institution_id, created_at desc);

alter table public.institution_notifications enable row level security;
revoke all on public.institution_notifications from anon, authenticated;
grant select, update (read_at) on public.institution_notifications to authenticated;

drop policy if exists "Institutions read own notifications" on public.institution_notifications;
create policy "Institutions read own notifications"
  on public.institution_notifications for select to authenticated
  using (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

drop policy if exists "Institutions mark own notifications read" on public.institution_notifications;
create policy "Institutions mark own notifications read"
  on public.institution_notifications for update to authenticated
  using (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()))
  with check (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

create or replace function public.notify_institutions_of_family_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare family_name text;
begin
  if tg_op = 'UPDATE'
    and old.name is not distinct from new.name
    and old.document_type is not distinct from new.document_type
    and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;
  select p.full_name into family_name from public.profiles p where p.id = new.family_id;
  insert into public.institution_notifications (institution_id, related_family_id, category, title, message)
  select v.user_id, new.family_id, 'documento', case when tg_op = 'INSERT' then 'Nueva solicitud familiar' else 'Documento familiar actualizado' end,
    coalesce(family_name, 'Una familia') || case when tg_op = 'INSERT' then ' envió el documento "' else ' actualizó el documento "' end || new.document_type || '" para revisión.'
  from public.verification_requests v
  join public.profiles institution on institution.id = v.user_id and institution.account_type = 'institucion'
  where v.account_type = 'institucion' and v.status = 'aprobada';
  return new;
end;
$$;
revoke all on function public.notify_institutions_of_family_document() from public, anon, authenticated;
drop trigger if exists institution_family_document_notification on public.family_documents;
create trigger institution_family_document_notification
  after insert or update of name, document_type, storage_path on public.family_documents
  for each row execute function public.notify_institutions_of_family_document();

create or replace function public.notify_institutions_of_psych_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare family_name text; notification_title text;
begin
  if tg_op = 'UPDATE'
    and old.observations is not distinct from new.observations
    and old.strengths is not distinct from new.strengths
    and old.concerns is not distinct from new.concerns
    and old.recommendation is not distinct from new.recommendation then
    return new;
  end if;
  select p.full_name into family_name from public.profiles p where p.id = new.family_id;
  notification_title := case when tg_op = 'INSERT' then 'Nuevo informe psicológico' else 'Informe psicológico actualizado' end;
  insert into public.institution_notifications (institution_id, related_family_id, category, title, message)
  select v.user_id, new.family_id, 'informe', notification_title,
    'El psicólogo ' || case when tg_op = 'INSERT' then 'envió' else 'actualizó' end || ' el informe de ' || coalesce(family_name, 'una familia') || '. Ya puedes revisarlo y decidir.'
  from public.verification_requests v
  join public.profiles institution on institution.id = v.user_id and institution.account_type = 'institucion'
  where v.account_type = 'institucion' and v.status = 'aprobada';
  return new;
end;
$$;
revoke all on function public.notify_institutions_of_psych_report() from public, anon, authenticated;
drop trigger if exists institution_psych_report_notification on public.family_psych_reports;
create trigger institution_psych_report_notification
  after insert or update of observations, strengths, concerns, recommendation on public.family_psych_reports
  for each row execute function public.notify_institutions_of_psych_report();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'institution_notifications'
     ) then
    alter publication supabase_realtime add table public.institution_notifications;
  end if;
end;
$$;
