-- Asignación del expediente familiar aprobado al psicólogo antes de la
-- evaluación y del catálogo. Ejecutar después de family_cases.sql,
-- institution_family_review.sql, family_notifications.sql,
-- family_psychological_reports.sql, child_interest_workflow.sql y
-- child_catalog_reservation.sql.

alter table public.family_cases
  add column if not exists psychologist_id uuid references public.profiles(id) on delete set null,
  add column if not exists psychologist_assigned_at timestamptz,
  add column if not exists psychologist_case_closed_at timestamptz;

create or replace function public.protect_family_case_psychologist_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('pathhome.psychologist_assignment',true) is distinct from 'on'
    and ((tg_op='INSERT' and new.psychologist_id is not null)
      or (tg_op='UPDATE' and (old.psychologist_id is distinct from new.psychologist_id
        or old.psychologist_assigned_at is distinct from new.psychologist_assigned_at
        or old.psychologist_case_closed_at is distinct from new.psychologist_case_closed_at))) then
    raise exception 'La asignación del psicólogo solo puede cambiarse desde el flujo de casos.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_family_case_psychologist_assignment on public.family_cases;
create trigger protect_family_case_psychologist_assignment before insert or update on public.family_cases
  for each row execute function public.protect_family_case_psychologist_assignment();
revoke all on function public.protect_family_case_psychologist_assignment() from public,anon,authenticated;
do $$ begin
  perform set_config('pathhome.psychologist_assignment','on',true);
  update public.family_cases f set psychologist_id=null,psychologist_case_closed_at=coalesce(f.psychologist_case_closed_at,now())
  where exists(select 1 from public.child_interest_cases c where c.family_id=f.family_id and c.status='finalizado');
  update public.family_cases f set psychologist_id=c.psychologist_id,psychologist_assigned_at=coalesce(f.psychologist_assigned_at,c.updated_at,now())
  from public.child_interest_cases c
  where c.family_id=f.family_id and f.status='aprobada' and f.psychologist_id is null
    and f.psychologist_case_closed_at is null and c.psychologist_id is not null and c.status<>'finalizado'
    and not exists(select 1 from public.child_interest_cases finished where finished.family_id=f.family_id and finished.status='finalizado');
end $$;

drop policy if exists "Psychologists read approved families" on public.family_cases;
create policy "Psychologists read approved families" on public.family_cases for select to authenticated
  using (status='aprobada' and psychologist_case_closed_at is null and (psychologist_id is null or psychologist_id=auth.uid())
    and not exists(select 1 from public.child_interest_cases done where done.family_id=family_cases.family_id and done.status='finalizado')
    and public.is_pathhome_psychologist());
drop policy if exists "Psychologists read family documents" on public.family_documents;
create policy "Psychologists read family documents" on public.family_documents for select to authenticated
  using (exists(select 1 from public.family_cases c where c.family_id=family_documents.family_id and c.status='aprobada'
    and c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null) and public.is_pathhome_psychologist());
drop policy if exists "Psychologists read approved family files" on storage.objects;
create policy "Psychologists read approved family files" on storage.objects for select to authenticated
  using (bucket_id='family-documents' and exists(select 1 from public.family_cases c
    where c.family_id::text=(storage.foldername(name))[1] and c.status='aprobada'
      and c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null) and public.is_pathhome_psychologist());

drop function if exists public.psychologist_list_approved_families();
create function public.psychologist_list_approved_families()
returns table(family_id uuid,full_name text,email text,status text,approved_at timestamptz,documents jsonb,
  psychologist_id uuid,assigned_to_me boolean,available_for_claim boolean)
language sql stable security definer set search_path = '' as $$
  select visible.family_id,visible.full_name,visible.email,visible.status,visible.approved_at,visible.documents,
    visible.psychologist_id,visible.assigned_to_me,visible.available_for_claim
  from (
    select p.id as family_id,p.full_name,u.email::text,c.status,c.reviewed_at as approved_at,
      case when c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null
        then coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.family_documents d where d.family_id=p.id),'[]'::jsonb)
        else '[]'::jsonb end as documents,
      c.psychologist_id,coalesce(c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null,false) as assigned_to_me,
      coalesce(c.psychologist_id is null and c.psychologist_case_closed_at is null,false) as available_for_claim
    from public.family_cases c join public.profiles p on p.id=c.family_id join auth.users u on u.id=p.id
    where c.status='aprobada' and c.psychologist_case_closed_at is null
      and (c.psychologist_id is null or c.psychologist_id=auth.uid())
      and not exists(select 1 from public.child_interest_cases done where done.family_id=c.family_id and done.status='finalizado')
      and public.is_pathhome_psychologist()
    union all
    select p.id,p.full_name,u.email::text,'finalizado'::text,f.reviewed_at,'[]'::jsonb,auth.uid(),false,false
    from public.child_interest_cases done join public.profiles p on p.id=done.family_id join auth.users u on u.id=p.id
    left join public.family_cases f on f.family_id=done.family_id
    where done.psychologist_id=auth.uid() and done.status='finalizado' and public.is_pathhome_psychologist()
  ) visible
  order by (visible.status='finalizado'),visible.assigned_to_me desc,visible.approved_at desc nulls last;
$$;
revoke all on function public.psychologist_list_approved_families() from public,anon;
grant execute on function public.psychologist_list_approved_families() to authenticated;

create or replace function public.psychologist_claim_family_case(target_family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare active_case_name text;
begin
  if not public.is_pathhome_psychologist() then raise exception 'Solo un psicólogo verificado puede tomar expedientes.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,531));
  select 'la vinculación de '||ch.name||' para la familia '||p.full_name into active_case_name
  from public.child_interest_cases c join public.institution_children ch on ch.id=c.child_id
  join public.profiles p on p.id=c.family_id
  where c.psychologist_id=auth.uid() and c.status<>'finalizado' order by c.updated_at desc limit 1;
  if active_case_name is null then
    select 'el expediente de la familia '||p.full_name into active_case_name
    from public.family_cases c join public.profiles p on p.id=c.family_id
    where c.psychologist_id=auth.uid() and c.status='aprobada' and c.psychologist_case_closed_at is null
      and not exists(select 1 from public.child_interest_cases done where done.family_id=c.family_id and done.status='finalizado')
      and (exists(select 1 from public.family_psych_reports r where r.family_id=c.family_id and r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada'))
        or exists(select 1 from public.family_appointments a where a.family_id=c.family_id and a.psychologist_id=auth.uid() and a.child_interest_case_id is null
          and ((a.appointment_date>=current_date and a.attended_at is null)
            or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id))))) limit 1;
  end if;
  if active_case_name is null then
    select 'la cita de evaluación de la familia '||coalesce(p.full_name,'') into active_case_name
    from public.family_appointments a join public.profiles p on p.id=a.family_id
    where a.psychologist_id=auth.uid() and a.child_interest_case_id is null and a.family_id<>target_family_id
      and ((a.appointment_date>=current_date and a.attended_at is null)
        or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id)))
      and not exists(select 1 from public.child_interest_cases done where done.family_id=a.family_id and done.status='finalizado') limit 1;
  end if;
  if active_case_name is null then
    select 'la evaluación de la familia '||coalesce(p.full_name,'') into active_case_name
    from public.family_psych_reports r join public.profiles p on p.id=r.family_id
    where r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada') and r.family_id<>target_family_id
      and not exists(select 1 from public.child_interest_cases done where done.family_id=r.family_id and done.status='finalizado') limit 1;
  end if;
  if active_case_name is not null then raise exception 'Ya tienes activo %. Finalízalo antes de tomar otro expediente.',active_case_name using errcode='23514'; end if;
  perform set_config('pathhome.psychologist_assignment','on',true);
  with released as (
    update public.family_cases f set psychologist_id=null,psychologist_assigned_at=null
    where f.psychologist_id=auth.uid() and f.status='aprobada' and f.psychologist_case_closed_at is null and f.family_id<>target_family_id
      and not exists(select 1 from public.child_interest_cases c where c.family_id=f.family_id and c.status<>'finalizado')
      and not exists(select 1 from public.family_psych_reports r where r.family_id=f.family_id and r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada'))
      and not exists(select 1 from public.family_appointments a where a.family_id=f.family_id and a.psychologist_id=auth.uid() and a.child_interest_case_id is null
        and ((a.appointment_date>=current_date and a.attended_at is null)
          or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id))))
    returning f.family_id
  )
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
  select released.family_id,released.family_id,'sistema','Expediente disponible para reasignación',
    'El expediente sigue aprobado, pero el psicólogo asignado no había iniciado citas ni informes. La institución podrá asignarlo a otro psicólogo.'
  from released;
  update public.family_cases set psychologist_id=auth.uid(),psychologist_assigned_at=coalesce(psychologist_assigned_at,now())
    where family_id=target_family_id and status='aprobada' and psychologist_case_closed_at is null
      and (psychologist_id is null or psychologist_id=auth.uid());
  if not found then raise exception 'Este expediente ya fue tomado o no está disponible.' using errcode='23505'; end if;
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
    values(target_family_id,target_family_id,'sistema','Psicólogo asignado','Un psicólogo tomó tu expediente y dará seguimiento a tu evaluación. Revisa tus citas y notificaciones para conocer los próximos pasos.');
end;
$$;
revoke all on function public.psychologist_claim_family_case(uuid) from public,anon;
grant execute on function public.psychologist_claim_family_case(uuid) to authenticated;

create or replace function public.notify_approved_family_to_psychologists()
returns trigger language plpgsql security definer set search_path = '' as $$
declare family_name text;
begin
  if new.status<>'aprobada' or (tg_op='UPDATE' and old.status is not distinct from new.status) then return new; end if;
  select p.full_name into family_name from public.profiles p where p.id=new.family_id;
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
  select p.id,new.family_id,'sistema','Nuevo expediente disponible',coalesce(family_name,'Una familia')||' tiene un expediente aprobado disponible para tomar.'
  from public.profiles p join public.verification_requests v on v.user_id=p.id
  where p.account_type='profesional' and v.account_type='profesional' and v.status='aprobada';
  return new;
end;
$$;
revoke all on function public.notify_approved_family_to_psychologists() from public,anon,authenticated;
drop trigger if exists approved_family_available_to_psychologists on public.family_cases;
create trigger approved_family_available_to_psychologists after insert or update of status on public.family_cases
  for each row execute function public.notify_approved_family_to_psychologists();

create or replace function public.family_express_child_interest(target_child_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare child_row public.institution_children%rowtype; new_case uuid; assigned_psychologist uuid;
begin
  if not public.family_can_access_child_catalog() then raise exception 'Tu familia aún no tiene acceso al catálogo.' using errcode='42501'; end if;
  select c.psychologist_id into assigned_psychologist from public.family_cases c
    where c.family_id=auth.uid() and c.status='aprobada' and c.psychologist_case_closed_at is null;
  select * into child_row from public.institution_children where id=target_child_id for update;
  if not found then raise exception 'El perfil ya no está disponible.' using errcode='P0002'; end if;
  if exists(select 1 from public.child_interest_cases where child_id=child_row.id) then raise exception 'Este niño ya fue seleccionado por otra familia y no está disponible.' using errcode='23505'; end if;
  insert into public.child_interest_cases(child_id,institution_id,family_id,psychologist_id)
    values(child_row.id,child_row.institution_id,auth.uid(),assigned_psychologist) returning id into new_case;
  insert into public.institution_notifications(institution_id,related_family_id,category,title,message)
    values(child_row.institution_id,auth.uid(),'informe','Nuevo interés familiar',(select full_name from public.profiles where id=auth.uid())||' expresó interés en '||child_row.name||'.');
  return new_case;
end;
$$;

create or replace function public.psychologist_claim_child_case(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; pending_report boolean; active_case_name text;
begin
  if not public.is_pathhome_psychologist() then raise exception 'Solo un psicólogo validado puede tomar casos.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,531));
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found or c.status='finalizado' or c.psychologist_id is not null then raise exception 'El caso ya fue asignado o no está disponible.'; end if;
  select 'la vinculación de '||ch.name||' para la familia '||p.full_name into active_case_name
  from public.child_interest_cases x join public.institution_children ch on ch.id=x.child_id join public.profiles p on p.id=x.family_id
  where x.psychologist_id=auth.uid() and x.status<>'finalizado' and x.id<>target_case_id order by x.updated_at desc limit 1;
  if active_case_name is null then select 'el expediente de la familia '||p.full_name into active_case_name from public.family_cases x join public.profiles p on p.id=x.family_id
    where x.psychologist_id=auth.uid() and x.status='aprobada' and x.psychologist_case_closed_at is null and x.family_id<>c.family_id
      and not exists(select 1 from public.child_interest_cases done where done.family_id=x.family_id and done.status='finalizado')
      and (exists(select 1 from public.family_psych_reports r where r.family_id=x.family_id and r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada'))
        or exists(select 1 from public.family_appointments a where a.family_id=x.family_id and a.psychologist_id=auth.uid() and a.child_interest_case_id is null
          and ((a.appointment_date>=current_date and a.attended_at is null)
            or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id))))) limit 1; end if;
  if active_case_name is null then select 'la cita de evaluación de la familia '||coalesce(p.full_name,'') into active_case_name from public.family_appointments a join public.profiles p on p.id=a.family_id
    where a.psychologist_id=auth.uid() and a.child_interest_case_id is null and a.family_id<>c.family_id
      and ((a.appointment_date>=current_date and a.attended_at is null)
        or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id)))
      and not exists(select 1 from public.child_interest_cases done where done.family_id=a.family_id and done.status='finalizado') limit 1; end if;
  if active_case_name is null then select 'la evaluación de la familia '||coalesce(p.full_name,'') into active_case_name from public.family_psych_reports r join public.profiles p on p.id=r.family_id
    where r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada') and r.family_id<>c.family_id
      and not exists(select 1 from public.child_interest_cases done where done.family_id=r.family_id and done.status='finalizado') limit 1; end if;
  if active_case_name is not null then raise exception 'Primero finaliza % antes de tomar otro caso.',active_case_name using errcode='23514'; end if;
  if exists(select 1 from public.family_cases f where f.family_id=c.family_id and f.status='aprobada' and f.psychologist_case_closed_at is null and f.psychologist_id is not null and f.psychologist_id<>auth.uid()
    and not exists(select 1 from public.child_interest_cases done where done.family_id=f.family_id and done.status='finalizado')) then
    raise exception 'El expediente familiar ya está asignado a otro psicólogo.' using errcode='23514';
  end if;
  perform set_config('pathhome.psychologist_assignment','on',true);
  with released as (
    update public.family_cases f set psychologist_id=null,psychologist_assigned_at=null
    where f.psychologist_id=auth.uid() and f.status='aprobada' and f.psychologist_case_closed_at is null and f.family_id<>c.family_id
      and not exists(select 1 from public.child_interest_cases x where x.family_id=f.family_id and x.status<>'finalizado')
      and not exists(select 1 from public.family_psych_reports r where r.family_id=f.family_id and r.psychologist_id=auth.uid() and r.status in ('pendiente','rechazada'))
      and not exists(select 1 from public.family_appointments a where a.family_id=f.family_id and a.psychologist_id=auth.uid() and a.child_interest_case_id is null
        and ((a.appointment_date>=current_date and a.attended_at is null)
          or (a.attended_at is not null and not exists(select 1 from public.family_psych_reports r where r.appointment_id=a.id))))
    returning f.family_id
  )
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
  select released.family_id,released.family_id,'sistema','Expediente disponible para reasignación',
    'El expediente sigue aprobado, pero el psicólogo asignado no había iniciado citas ni informes. La institución podrá asignarlo a otro psicólogo.'
  from released;
  update public.family_cases set psychologist_id=auth.uid(),psychologist_assigned_at=coalesce(psychologist_assigned_at,now())
    where family_id=c.family_id and status='aprobada' and psychologist_case_closed_at is null and psychologist_id is null;
  update public.child_interest_cases set psychologist_id=auth.uid(),updated_at=now() where id=target_case_id and psychologist_id is null;
  if not found then raise exception 'El caso ya fue asignado o no está disponible.'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  update public.family_appointments set psychologist_id=auth.uid() where child_interest_case_id=target_case_id and appointment_type='visita_inicial' and psychologist_id is null;
  select exists(select 1 from public.child_case_reports where case_id=target_case_id and report_type='visita_inicial' and status='pendiente_revision') into pending_report;
  if pending_report then insert into public.family_notifications(family_id,related_family_id,category,title,message)
    values(auth.uid(),c.family_id,'sistema','Informe institucional pendiente de revisión','La institución ya envió el informe de la visita inicial para tu caso.'); end if;
end;
$$;

create or replace function public.psychologist_close_child_case(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare family_to_release uuid;
begin
  if not public.is_pathhome_psychologist() then raise exception 'Solo un psicólogo validado puede cerrar casos.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,531));
  update public.child_interest_cases set status='finalizado',closed_at=now(),updated_at=now()
    where id=target_case_id and psychologist_id=auth.uid() and status='entrega_confirmada' and delivery_confirmed_at is not null returning family_id into family_to_release;
  if family_to_release is null then raise exception 'El caso solo se cierra después de confirmar la entrega.' using errcode='42501'; end if;
  perform set_config('pathhome.psychologist_assignment','on',true);
  update public.family_cases set psychologist_id=null,psychologist_case_closed_at=now()
    where family_id=family_to_release and psychologist_id=auth.uid() and status='aprobada';
  insert into public.family_notifications(family_id,related_family_id,category,title,message)
    values(family_to_release,family_to_release,'sistema','Proceso finalizado','La entrega fue confirmada y el caso se cerró.');
  insert into public.institution_notifications(institution_id,related_family_id,category,title,message)
    select institution_id,family_id,'sistema','Proceso finalizado','El psicólogo confirmó la entrega y cerró el caso.' from public.child_interest_cases where id=target_case_id;
end;
$$;

drop policy if exists "Psychologists schedule approved families" on public.family_appointments;
create policy "Psychologists schedule approved families" on public.family_appointments for insert to authenticated
  with check (child_interest_case_id is null and psychologist_id=auth.uid() and public.is_pathhome_psychologist()
    and exists(select 1 from public.family_cases c where c.family_id=family_appointments.family_id and c.status='aprobada' and c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null));
drop policy if exists "Psychologists update their scheduled appointments" on public.family_appointments;
create policy "Psychologists update their scheduled appointments" on public.family_appointments for update to authenticated
  using (psychologist_id=auth.uid() and child_interest_case_id is null)
  with check (psychologist_id=auth.uid() and child_interest_case_id is null and public.is_pathhome_psychologist()
    and exists(select 1 from public.family_cases c where c.family_id=family_appointments.family_id and c.status='aprobada' and c.psychologist_id=auth.uid() and c.psychologist_case_closed_at is null));

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='family_cases') then
    alter publication supabase_realtime add table public.family_cases;
  end if;
end $$;
