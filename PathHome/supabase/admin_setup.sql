-- PathHome: habilita permisos administrativos.
-- Ejecuta este archivo en Supabase > SQL Editor después de schema.sql.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_pathhome_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.is_admin = true
  );
$$;

revoke all on function public.is_pathhome_admin() from public, anon;
grant execute on function public.is_pathhome_admin() to authenticated;

drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select to authenticated
  using ((select public.is_pathhome_admin()));

drop policy if exists "Admins read all verification requests" on public.verification_requests;
create policy "Admins read all verification requests"
  on public.verification_requests for select to authenticated
  using ((select public.is_pathhome_admin()));

grant update (status, reviewed_at) on public.verification_requests to authenticated;

drop policy if exists "Admins review pending verification requests" on public.verification_requests;
create policy "Admins review pending verification requests"
  on public.verification_requests for update to authenticated
  using (
    (select public.is_pathhome_admin())
    and status = 'pendiente'
  )
  with check (
    (select public.is_pathhome_admin())
    and status in ('aprobada', 'rechazada')
    and reviewed_at is not null
  );

drop policy if exists "Admins read verification documents" on storage.objects;
create policy "Admins read verification documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (select public.is_pathhome_admin())
  );

-- Después de crear la cuenta desde el formulario de PathHome, cambia el correo
-- de ejemplo por el correo exacto de esa cuenta y ejecuta esta consulta:
update public.profiles
set is_admin = true
where id in (
  select id
  from auth.users
  where lower(email) = lower('PON_AQUI_EL_CORREO_DEL_ADMIN')
);
