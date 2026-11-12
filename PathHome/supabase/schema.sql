-- PathHome: perfiles y solicitudes de verificación.
-- Ejecutar una sola vez en Supabase > SQL Editor > New query.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type text not null default 'familia'
    check (account_type in ('familia', 'institucion', 'profesional')),
  full_name text not null,
  national_id text unique
    check (national_id ~ '^\d{3}-\d{7}-\d$'),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_type text not null
    check (account_type in ('institucion', 'profesional')),
  verification_code text,
  document_path text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index verification_requests_user_id_idx
  on public.verification_requests (user_id);

-- Crear el perfil al registrarse. El tipo se restringe a los tipos de cuenta
-- admitidos; ninguno de estos tipos concede permisos administrativos.
create function public.handle_new_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Mantener updated_at al modificar el perfil.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.verification_requests enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, national_id, phone) on table public.profiles to authenticated;

revoke all on table public.verification_requests from anon, authenticated;
grant select, insert on table public.verification_requests to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users read their own verification requests"
  on public.verification_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Eligible users submit pending verification requests"
  on public.verification_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pendiente'
    and document_path like (select auth.uid())::text || '/%'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = verification_requests.account_type
        and profiles.account_type in ('institucion', 'profesional')
    )
  );

-- Para los documentos, crear primero un bucket privado llamado
-- verification-documents en Storage. La app debe guardar cada archivo bajo
-- una carpeta cuyo nombre sea el UUID del usuario (UUID/archivo.jpg).
create policy "Users upload their own verification documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users read their own verification documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
