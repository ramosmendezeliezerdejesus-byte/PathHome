-- Repara los triggers de notificaciones sin volver a crear tablas ni borrar datos.
-- Ejecutar en Supabase si ya se había aplicado family_notifications.sql.
create or replace function public.notify_family_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.name is not distinct from new.name
    and old.document_type is not distinct from new.document_type
    and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  insert into public.family_notifications (family_id, category, title, message)
  values (
    new.family_id,
    'documento',
    case when tg_op = 'INSERT' then 'Documento recibido' else 'Documento actualizado' end,
    new.document_type || case when tg_op = 'INSERT' then ' se agregó' else ' se actualizó' end || ' en tu expediente.'
  );
  return new;
end;
$$;

create or replace function public.notify_family_case_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('aprobada', 'rechazada')
    or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  insert into public.family_notifications (family_id, category, title, message)
  values (
    new.family_id,
    'sistema',
    case when new.status = 'aprobada' then 'Familia aceptada' else 'Revisión del expediente' end,
    case when new.status = 'aprobada'
      then 'El administrador aceptó tu expediente. El psicólogo podrá agendar una cita.'
      else 'El administrador revisó tu expediente. Consulta tus documentos para ver qué debes actualizar.'
    end
  );

  if new.status = 'aprobada' then
    insert into public.family_notifications (family_id, category, title, message)
    select p.id, 'sistema', 'Familia lista para evaluación',
      'Un expediente fue aceptado por el administrador y está disponible para agendar una cita.'
    from public.profiles p
    where p.account_type = 'profesional';
  end if;
  return new;
end;
$$;
