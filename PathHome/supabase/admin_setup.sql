-- PathHome: habilita permisos administrativos.
-- Ejecuta este archivo en Supabase > SQL Editor después de schema.sql.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Las cuentas creadas con Google no tienen cédula hasta que la completen.
alter table public.profiles alter column national_id drop not null;

-- Asegura que el perfil también pueda crearse para registros sociales.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_type text := new.raw_user_meta_data ->> 'account_type';
begin
  insert into public.profiles (id, account_type, full_name, national_id, phone)
  values (
    new.id,
    case
      when requested_type in ('institucion', 'profesional') then requested_type
      else 'familia'
    end,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuario'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'national_id'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

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

-- Datos de solicitudes para el panel. La función expone correo y perfil solo
-- a administradores, sin abrir auth.users al cliente.
create or replace function public.admin_list_verification_requests()
returns table (
  id uuid,
  user_id uuid,
  account_type text,
  verification_code text,
  document_path text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  email text,
  full_name text,
  national_id text,
  phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request.id,
    request.user_id,
    request.account_type,
    request.verification_code,
    request.document_path,
    request.status,
    request.created_at,
    request.reviewed_at,
    auth_user.email::text,
    profile.full_name,
    profile.national_id,
    profile.phone
  from public.verification_requests as request
  join public.profiles as profile on profile.id = request.user_id
  join auth.users as auth_user on auth_user.id = request.user_id
  where public.is_pathhome_admin()
  order by request.created_at desc;
$$;

revoke all on function public.admin_list_verification_requests() from public, anon;
grant execute on function public.admin_list_verification_requests() to authenticated;

-- Directorio para la pantalla Usuarios. Devuelve el estado de la solicitud
-- más reciente para que el rol pendiente no aparezca como habilitado.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  full_name text,
  account_type text,
  created_at timestamptz,
  is_admin boolean,
  verification_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    auth_user.email::text,
    profile.full_name,
    profile.account_type,
    profile.created_at,
    profile.is_admin,
    latest_request.status
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.id
  left join lateral (
    select request.status
    from public.verification_requests as request
    where request.user_id = profile.id
      and request.account_type = profile.account_type
    order by request.created_at desc
    limit 1
  ) as latest_request on true
  where public.is_pathhome_admin()
  order by profile.created_at desc;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- Después de crear la cuenta desde el formulario de PathHome, cambia el correo
-- de ejemplo por el correo exacto de esa cuenta y ejecuta esta consulta:
update public.profiles
set is_admin = true
where id in (
  select id
  from auth.users
  where lower(email) = lower('PON_AQUI_EL_CORREO_DEL_ADMIN')
);
