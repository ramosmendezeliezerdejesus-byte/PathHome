-- Perfiles y fotos registrados por instituciones; ejecutar después de
-- institution_family_review.sql.
create table if not exists public.institution_children (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  age integer not null check (age between 0 and 17),
  gender text not null check (gender in ('Niño', 'Niña')),
  institution_name text not null,
  summary text,
  characteristics text[] not null default '{}',
  interests text[] not null default '{}',
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.institution_children add column if not exists photo_path text;

alter table public.institution_children enable row level security;
grant select, insert, update, delete on public.institution_children to authenticated;

drop policy if exists "Verified institutions read own child profiles" on public.institution_children;
create policy "Verified institutions read own child profiles"
  on public.institution_children for select to authenticated
  using (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

drop policy if exists "Verified institutions create own child profiles" on public.institution_children;
create policy "Verified institutions create own child profiles"
  on public.institution_children for insert to authenticated
  with check (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

drop policy if exists "Verified institutions update own child profiles" on public.institution_children;
create policy "Verified institutions update own child profiles"
  on public.institution_children for update to authenticated
  using (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()))
  with check (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

drop policy if exists "Verified institutions delete own child profiles" on public.institution_children;
create policy "Verified institutions delete own child profiles"
  on public.institution_children for delete to authenticated
  using (institution_id = (select auth.uid()) and (select public.is_pathhome_institution()));

create index if not exists institution_children_institution_created_idx
  on public.institution_children (institution_id, created_at desc);

-- Bucket privado para fotografías de perfiles; el primer segmento de cada ruta es el ID institucional.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institution-child-photos', 'institution-child-photos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists "Verified institutions read own child photos" on storage.objects;
create policy "Verified institutions read own child photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'institution-child-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_pathhome_institution()));

drop policy if exists "Verified institutions upload own child photos" on storage.objects;
create policy "Verified institutions upload own child photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'institution-child-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_pathhome_institution()));

drop policy if exists "Verified institutions delete own child photos" on storage.objects;
create policy "Verified institutions delete own child photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'institution-child-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_pathhome_institution()));

-- Catálogo: requiere documentos aprobados y una evaluación psicológica aceptada.
create or replace function public.family_can_access_child_catalog()
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare latest_status text; latest_updated timestamptz; reset_at timestamptz;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'familia') then
    return false;
  end if;
  if not exists (select 1 from public.family_cases c where c.family_id = auth.uid() and c.status = 'aprobada') then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_reports') is null then return false; end if;
  execute 'select r.status, r.updated_at from public.family_psych_reports r where r.family_id = $1 order by r.updated_at desc limit 1'
    into latest_status, latest_updated using auth.uid();
  if latest_updated is null then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_report_resets') is not null then
    execute 'select x.updated_at from public.family_psych_report_resets x where x.family_id = $1'
      into reset_at using auth.uid();
  end if;
  if reset_at is not null and (latest_updated is null or reset_at >= latest_updated) then return false; end if;
  return latest_status = 'aceptada';
end;
$$;
revoke all on function public.family_can_access_child_catalog() from public, anon;
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

drop policy if exists "Approved families read child catalog photos" on storage.objects;
create policy "Approved families read child catalog photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'institution-child-photos' and (select public.family_can_access_child_catalog()));

-- Habilita actualizaciones en vivo para las listas institucionales.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'institution_children'
    ) then
    execute 'alter publication supabase_realtime add table public.institution_children';
  end if;
end;
$$;
