-- Permite al administrador cambiar el tipo de cuenta sin conceder privilegios admin.
-- Ejecutar en Supabase SQL Editor después de admin_setup.sql.

create or replace function public.admin_change_user_role(
  target_user_id uuid,
  new_account_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_pathhome_admin() then
    raise exception 'Solo un administrador puede cambiar los roles.' using errcode = '42501';
  end if;

  if new_account_type is null or new_account_type not in ('familia', 'profesional', 'institucion') then
    raise exception 'El rol seleccionado no es válido.' using errcode = '22023';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'No puedes cambiar tu propio rol administrativo.' using errcode = '42501';
  end if;

  update public.profiles
  set account_type = new_account_type
  where id = target_user_id
    and is_admin = false;

  if not found then
    raise exception 'No se encontró una cuenta editable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_change_user_role(uuid, text) from public, anon;
grant execute on function public.admin_change_user_role(uuid, text) to authenticated;
