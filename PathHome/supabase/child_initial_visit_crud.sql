-- CRUD seguro para que la institución responsable edite o cancele la visita inicial.
-- Ejecutar después de child_interest_workflow.sql.

create or replace function public.institution_update_initial_visit(target_case_id uuid, target_date date, target_time time, target_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; a public.family_appointments%rowtype;
begin
  if not public.is_pathhome_institution() then raise exception 'Solo una institución validada puede editar esta cita.' using errcode='42501'; end if;
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found or c.institution_id<>auth.uid() or c.status<>'cita_inicial_programada' then raise exception 'La cita ya no se puede editar.' using errcode='42501'; end if;
  if target_date < current_date then raise exception 'Selecciona una fecha de hoy o futura.' using errcode='22007'; end if;
  select * into a from public.family_appointments where child_interest_case_id=c.id and appointment_type='visita_inicial' for update;
  if not found or a.attended_at is not null then raise exception 'La cita ya fue atendida o no está disponible.' using errcode='42501'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  update public.family_appointments set appointment_date=target_date,appointment_time=target_time,note=nullif(trim(target_note),'') where id=a.id;
end; $$;

create or replace function public.institution_delete_initial_visit(target_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; a public.family_appointments%rowtype;
begin
  if not public.is_pathhome_institution() then raise exception 'Solo una institución validada puede cancelar esta cita.' using errcode='42501'; end if;
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found or c.institution_id<>auth.uid() or c.status<>'cita_inicial_programada' then raise exception 'La cita ya no se puede cancelar.' using errcode='42501'; end if;
  select * into a from public.family_appointments where child_interest_case_id=c.id and appointment_type='visita_inicial' for update;
  if not found or a.attended_at is not null then raise exception 'La cita ya fue atendida o no está disponible.' using errcode='42501'; end if;
  if exists(select 1 from public.child_case_reports where appointment_id=a.id) then raise exception 'La cita ya tiene un informe asociado y no se puede cancelar.' using errcode='42501'; end if;
  perform set_config('pathhome.child_case_write','on',true);
  delete from public.family_appointments where id=a.id;
  update public.child_interest_cases set status='interes_recibido',updated_at=now() where id=c.id;
end; $$;

revoke all on function public.institution_update_initial_visit(uuid,date,time,text),public.institution_delete_initial_visit(uuid) from public,anon;
grant execute on function public.institution_update_initial_visit(uuid,date,time,text),public.institution_delete_initial_visit(uuid) to authenticated;
