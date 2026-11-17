-- PathHome: las instituciones revisan los expedientes enviados por las familias.
-- Ejecutar después de schema.sql, admin_setup.sql y family_cases.sql.

create or replace function public.is_pathhome_institution()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.verification_requests v on v.user_id = p.id
    where p.id = auth.uid()
      and p.account_type = 'institucion'
      and v.account_type = 'institucion'
      and v.status = 'aprobada'
  );
$$;
revoke all on function public.is_pathhome_institution() from public, anon;
grant execute on function public.is_pathhome_institution() to authenticated;

-- Admin mantiene consulta de expedientes; la institución recibe permisos de revisión.
drop policy if exists "Admin manages family approvals" on public.family_cases;
drop policy if exists "Institutions read family documents" on public.family_documents;
create policy "Institutions read family documents" on public.family_documents
  for select to authenticated
  using ((select public.is_pathhome_institution()));

drop policy if exists "Institutions read family files" on storage.objects;
create policy "Institutions read family files" on storage.objects
  for select to authenticated
  using (bucket_id = 'family-documents' and (select public.is_pathhome_institution()));

drop policy if exists "Institutions read family cases" on public.family_cases;
create policy "Institutions read family cases" on public.family_cases
  for select to authenticated
  using ((select public.is_pathhome_institution()));

drop policy if exists "Institutions create family reviews" on public.family_cases;
create policy "Institutions create family reviews" on public.family_cases
  for insert to authenticated
  with check (
    (select public.is_pathhome_institution())
    and status in ('aprobada', 'rechazada')
    and exists (select 1 from public.family_documents d where d.family_id = family_cases.family_id)
  );

drop policy if exists "Institutions update family reviews" on public.family_cases;
create policy "Institutions update family reviews" on public.family_cases
  for update to authenticated
  using ((select public.is_pathhome_institution()))
  with check (
    (select public.is_pathhome_institution())
    and status in ('aprobada', 'rechazada')
    and exists (select 1 from public.family_documents d where d.family_id = family_cases.family_id)
  );

-- Solo las instituciones verificadas pueden listar expedientes y cambiar su estado.
create or replace function public.institution_list_family_cases()
returns table(family_id uuid, full_name text, email text, status text, approved_at timestamptz, documents jsonb)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, u.email::text, coalesce(c.status, 'pendiente'), c.reviewed_at,
    coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.family_documents d where d.family_id = p.id), '[]'::jsonb)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.family_cases c on c.family_id = p.id
  where p.account_type = 'familia'
    and public.is_pathhome_institution()
    and exists (select 1 from public.family_documents d where d.family_id = p.id)
  order by p.created_at desc;
$$;

create or replace function public.institution_review_family_case(target_family_id uuid, new_status text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_pathhome_institution() then
    raise exception 'Solo una institución verificada puede revisar expedientes familiares.' using errcode = '42501';
  end if;
  if new_status not in ('aprobada', 'rechazada') then
    raise exception 'Estado de revisión no válido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_family_id and p.account_type = 'familia')
     or not exists (select 1 from public.family_documents d where d.family_id = target_family_id) then
    raise exception 'No se encontró el expediente familiar.' using errcode = 'P0002';
  end if;
  insert into public.family_cases (family_id, status, reviewed_at)
  values (target_family_id, new_status, now())
  on conflict (family_id) do update set status = excluded.status, reviewed_at = excluded.reviewed_at;
end;
$$;

revoke all on function public.institution_list_family_cases() from public, anon;
revoke all on function public.institution_review_family_case(uuid, text) from public, anon;
grant execute on function public.institution_list_family_cases() to authenticated;
grant execute on function public.institution_review_family_case(uuid, text) to authenticated;
