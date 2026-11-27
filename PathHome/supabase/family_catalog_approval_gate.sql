-- El catálogo solo se habilita si la documentación fue aprobada y la institución
-- aceptó el informe psicológico más reciente. La aprobación documental por sí sola
-- nunca da acceso. Ejecutar después de family_psychological_reports.sql.

create or replace function public.family_can_access_child_catalog()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare latest_status text; latest_updated timestamptz; reset_at timestamptz;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_type='familia') then return false; end if;
  if not exists(select 1 from public.family_cases c where c.family_id=auth.uid() and c.status='aprobada') then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_reports') is null then return false; end if;
  execute 'select r.status,r.updated_at from public.family_psych_reports r where r.family_id=$1 order by r.updated_at desc limit 1'
    into latest_status,latest_updated using auth.uid();
  if latest_updated is null then return false; end if;
  if pg_catalog.to_regclass('public.family_psych_report_resets') is not null then
    execute 'select x.updated_at from public.family_psych_report_resets x where x.family_id=$1'
      into reset_at using auth.uid();
  end if;
  if reset_at is not null and reset_at>=latest_updated then return false; end if;
  return latest_status='aceptada';
end; $$;
revoke all on function public.family_can_access_child_catalog() from public,anon;
grant execute on function public.family_can_access_child_catalog() to authenticated;
