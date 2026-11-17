-- Add a trusted link from a psychologist's approval notice to the accepted family.
alter table public.family_notifications
  add column if not exists related_family_id uuid references public.profiles(id) on delete set null;

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
    insert into public.family_notifications (family_id, related_family_id, category, title, message)
    select professional.id, new.family_id, 'sistema', 'Familia lista para evaluación',
      'El expediente de ' || family.full_name || ' fue aceptado por el administrador. Puedes agendarle una cita.'
    from public.profiles professional
    cross join public.profiles family
    where professional.account_type = 'profesional'
      and family.id = new.family_id;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_family_case_review() from public, anon, authenticated;
