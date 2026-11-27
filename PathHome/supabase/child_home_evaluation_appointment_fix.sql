-- Corrige la relación entre el informe de evaluación del hogar y su cita.
-- El informe es de tipo evaluacion_hogar, pero su cita asociada es visita_hogar.

create or replace function public.child_case_submit_report(target_case_id uuid, observations text, strengths text, concerns text, recommendation text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.child_interest_cases%rowtype; a public.family_appointments%rowtype; kind text; report_uuid uuid;
begin
  select * into c from public.child_interest_cases where id=target_case_id for update;
  if not found then raise exception 'Caso no encontrado.'; end if;
  if c.institution_id=auth.uid() and public.is_pathhome_institution() and c.status in ('informe_visita_pendiente','informe_visita_corregir') then kind:='visita_inicial';
  elsif c.psychologist_id=auth.uid() and public.is_pathhome_psychologist() and c.status='evaluacion_hogar_pendiente' then kind:='evaluacion_hogar';
  else raise exception 'No puedes enviar un informe en la etapa actual.' using errcode='42501'; end if;
  if nullif(trim(coalesce(observations,'')),'') is null or nullif(trim(coalesce(recommendation,'')),'') is null then raise exception 'Completa las observaciones y la recomendación.'; end if;
  select * into a from public.family_appointments
    where child_interest_case_id=c.id
      and appointment_type=case kind when 'visita_inicial' then 'visita_inicial' when 'evaluacion_hogar' then 'visita_hogar' end
    order by created_at desc limit 1;
  if not found then raise exception 'No se encontró la cita de esta etapa.'; end if;
  insert into public.child_case_reports(case_id,appointment_id,author_id,report_type,observations,strengths,concerns,recommendation)
  values(c.id,a.id,auth.uid(),kind,trim(observations),trim(coalesce(strengths,'')),trim(coalesce(concerns,'')),trim(recommendation)) returning id into report_uuid;
  update public.child_interest_cases set status=case kind when 'visita_inicial' then 'informe_visita_revision' else 'evaluacion_hogar_revision' end,updated_at=now() where id=c.id;
  if kind='visita_inicial' then
    if c.psychologist_id is not null then insert into public.family_notifications(family_id,related_family_id,category,title,message) values(c.psychologist_id,c.family_id,'sistema','Informe institucional disponible','La institución envió el informe de la visita inicial para tu revisión.'); end if;
  else
    insert into public.institution_notifications(institution_id,related_family_id,category,title,message) values(c.institution_id,c.family_id,'informe','Evaluación del hogar recibida','El psicólogo responsable envió la evaluación del hogar.');
  end if;
  return report_uuid;
end; $$;

revoke all on function public.child_case_submit_report(uuid,text,text,text,text) from public,anon;
grant execute on function public.child_case_submit_report(uuid,text,text,text,text) to authenticated;
