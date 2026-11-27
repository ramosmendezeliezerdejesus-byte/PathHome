-- Notifica a cada familia los cambios que se muestran en el recuadro del inicio.
-- Ejecutar después de family_notifications.sql y child_interest_workflow.sql.

create or replace function public.notify_family_child_case_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_title text;
  notification_message text;
  correction_reason text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  case new.status
    when 'interes_recibido' then
      notification_title := 'Interés recibido';
      notification_message := 'La institución recibió tu interés por el niño o la niña. Espera a que programe la visita inicial.';
    when 'informe_visita_pendiente' then
      notification_title := 'Asistencia confirmada';
      notification_message := 'La institución confirmó tu asistencia a la visita inicial. Espera a que envíe el informe al psicólogo.';
    when 'informe_visita_revision' then
      notification_title := 'Informe enviado al psicólogo';
      notification_message := 'La institución ya envió el informe de la visita inicial al psicólogo. Espera a que lo revise.';
    when 'informe_visita_corregir' then
      select r.decision_reason into correction_reason
      from public.child_case_reports r
      where r.case_id = new.id and r.report_type = 'visita_inicial'
      order by r.updated_at desc limit 1;
      notification_title := 'El informe necesita una corrección';
      notification_message := case when nullif(trim(correction_reason), '') is null
        then 'El psicólogo solicitó una corrección del informe. La institución actualizará la información.'
        else 'El psicólogo solicitó corregir el informe: ' || trim(correction_reason)
      end;
    when 'visita_hogar_disponible' then
      notification_title := 'Informe aceptado por el psicólogo';
      notification_message := 'El psicólogo aceptó el informe de la visita inicial. El siguiente paso es coordinar la visita al hogar.';
    when 'evaluacion_hogar_pendiente' then
      notification_title := 'Visita al hogar realizada';
      notification_message := 'La visita al hogar se confirmó. Espera a que el psicólogo envíe la evaluación a la institución.';
    when 'evaluacion_hogar_revision' then
      notification_title := 'Evaluación enviada a la institución';
      notification_message := 'El psicólogo envió la evaluación del hogar. La institución revisará el resultado y te informará.';
    else
      -- Las citas, las decisiones institucionales, la entrega y el cierre
      -- ya generan su propia notificación desde sus flujos correspondientes.
      return new;
  end case;

  insert into public.family_notifications(family_id, related_family_id, category, title, message)
  values(new.family_id, new.family_id, 'sistema', notification_title, notification_message);
  return new;
end;
$$;

revoke all on function public.notify_family_child_case_stage() from public, anon, authenticated;
drop trigger if exists family_child_case_stage_notification on public.child_interest_cases;
create trigger family_child_case_stage_notification
  after insert or update of status on public.child_interest_cases
  for each row execute function public.notify_family_child_case_stage();
