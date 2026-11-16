-- PathHome: expedientes familiares, documentos privados y citas.
-- Ejecutar después de schema.sql y admin_setup.sql.
create table if not exists public.family_cases (
  family_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.family_documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  document_type text not null,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.family_appointments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.profiles(id) on delete cascade,
  psychologist_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title text not null,
  appointment_date date not null,
  appointment_time time not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.family_cases enable row level security;
alter table public.family_documents enable row level security;
alter table public.family_appointments enable row level security;
revoke all on public.family_cases, public.family_documents, public.family_appointments from anon, authenticated;
grant select, insert, update on public.family_documents to authenticated;
grant select, insert, update on public.family_cases to authenticated;
grant select, insert on public.family_appointments to authenticated;
drop policy if exists "Families manage their documents" on public.family_documents;
create policy "Families manage their documents" on public.family_documents for all to authenticated
 using (family_id = (select auth.uid())) with check (family_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'familia'));
drop policy if exists "Admin reads family documents" on public.family_documents;
create policy "Admin reads family documents" on public.family_documents for select to authenticated using ((select public.is_pathhome_admin()));
drop policy if exists "Psychologists read family documents" on public.family_documents;
create policy "Psychologists read family documents" on public.family_documents for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional') and exists (select 1 from public.family_cases c where c.family_id = family_documents.family_id and c.status = 'aprobada'));
drop policy if exists "Admin manages family approvals" on public.family_cases;
create policy "Admin manages family approvals" on public.family_cases for all to authenticated using ((select public.is_pathhome_admin())) with check ((select public.is_pathhome_admin()));
drop policy if exists "Families read their approval" on public.family_cases;
create policy "Families read their approval" on public.family_cases for select to authenticated using (family_id = (select auth.uid()));
drop policy if exists "Psychologists read approved families" on public.family_cases;
create policy "Psychologists read approved families" on public.family_cases for select to authenticated using (status = 'aprobada' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional'));
drop policy if exists "Families read own appointments" on public.family_appointments;
create policy "Families read own appointments" on public.family_appointments for select to authenticated using (family_id = (select auth.uid()));
drop policy if exists "Psychologists read their scheduled appointments" on public.family_appointments;
create policy "Psychologists read their scheduled appointments" on public.family_appointments for select to authenticated using (psychologist_id = (select auth.uid()));
drop policy if exists "Psychologists schedule approved families" on public.family_appointments;
create policy "Psychologists schedule approved families" on public.family_appointments for insert to authenticated with check (psychologist_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional') and exists (select 1 from public.family_cases c where c.family_id = family_appointments.family_id and c.status = 'aprobada'));
insert into storage.buckets (id, name, public) values ('family-documents','family-documents',false) on conflict (id) do nothing;
drop policy if exists "Families upload own documents" on storage.objects;
create policy "Families upload own documents" on storage.objects for insert to authenticated with check (bucket_id = 'family-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Families read own documents" on storage.objects;
create policy "Families read own documents" on storage.objects for select to authenticated using (bucket_id = 'family-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Admin reads family document files" on storage.objects;
create policy "Admin reads family document files" on storage.objects for select to authenticated using (bucket_id = 'family-documents' and (select public.is_pathhome_admin()));
drop policy if exists "Psychologists read approved family files" on storage.objects;
create policy "Psychologists read approved family files" on storage.objects for select to authenticated using (bucket_id = 'family-documents' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional') and exists (select 1 from public.family_cases c where c.family_id::text = (storage.foldername(name))[1] and c.status = 'aprobada'));
create or replace function public.admin_list_family_cases()
returns table(family_id uuid, full_name text, email text, status text, approved_at timestamptz, documents jsonb)
language sql stable security definer set search_path = '' as $$
 select p.id, p.full_name, u.email::text, coalesce(c.status,'pendiente'), c.reviewed_at,
 coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.family_documents d where d.family_id=p.id),'[]'::jsonb)
 from public.profiles p join auth.users u on u.id=p.id left join public.family_cases c on c.family_id=p.id
 where p.account_type='familia' and public.is_pathhome_admin()
 and exists (select 1 from public.family_documents d where d.family_id = p.id)
 order by p.created_at desc;
$$;
create or replace function public.psychologist_list_approved_families()
returns table(family_id uuid, full_name text, email text, status text, approved_at timestamptz, documents jsonb)
language sql stable security definer set search_path = '' as $$
 select p.id, p.full_name, u.email::text, c.status, c.reviewed_at,
 coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.family_documents d where d.family_id=p.id),'[]'::jsonb)
 from public.family_cases c join public.profiles p on p.id=c.family_id join auth.users u on u.id=p.id
 where c.status='aprobada' and exists(select 1 from public.profiles me where me.id=auth.uid() and me.account_type='profesional');
$$;
revoke all on function public.admin_list_family_cases(), public.psychologist_list_approved_families() from public, anon;
grant execute on function public.admin_list_family_cases(), public.psychologist_list_approved_families() to authenticated;

-- Operaciones CRUD para citas y mantenimiento de documentos.
grant select, insert, update, delete on public.family_appointments to authenticated;
drop policy if exists "Psychologists update their scheduled appointments" on public.family_appointments;
create policy "Psychologists update their scheduled appointments" on public.family_appointments for update to authenticated
 using (psychologist_id = (select auth.uid()))
 with check (psychologist_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'profesional') and exists (select 1 from public.family_cases c where c.family_id = family_appointments.family_id and c.status = 'aprobada'));
drop policy if exists "Psychologists delete their scheduled appointments" on public.family_appointments;
create policy "Psychologists delete their scheduled appointments" on public.family_appointments for delete to authenticated
 using (psychologist_id = (select auth.uid()));
drop policy if exists "Families delete own document files" on storage.objects;
create policy "Families delete own document files" on storage.objects for delete to authenticated
 using (bucket_id = 'family-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.psychologist_list_family_appointments()
returns table(id uuid, family_id uuid, psychologist_id uuid, title text, appointment_date date, appointment_time time, note text, created_at timestamptz, family_name text)
language sql stable security definer set search_path = '' as $$
 select a.id, a.family_id, a.psychologist_id, a.title, a.appointment_date, a.appointment_time, a.note, a.created_at, p.full_name
 from public.family_appointments a
 join public.profiles p on p.id = a.family_id
 where a.psychologist_id = auth.uid()
 and exists(select 1 from public.profiles me where me.id=auth.uid() and me.account_type='profesional')
 order by a.appointment_date, a.appointment_time;
$$;
revoke all on function public.psychologist_list_family_appointments() from public, anon;
grant execute on function public.psychologist_list_family_appointments() to authenticated;


grant delete on public.family_documents, public.family_cases to authenticated;
