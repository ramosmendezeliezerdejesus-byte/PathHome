import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const requiredDocuments = [
  {
    nombre: 'Cédula de identidad',
    motivo: 'Se solicita para verificar la identidad de la persona solicitante, confirmar que sus datos personales sean correctos e identificar a las personas responsables de la solicitud.',
  },
  {
    nombre: 'Informe médico',
    motivo: 'Se solicita para conocer el estado general de salud de la persona solicitante y comprobar que cuenta con condiciones de salud compatibles con las responsabilidades del proceso de adopción. Su contenido debe evaluarse de manera confidencial.',
  },
  {
    nombre: 'Formulario de solicitud',
    motivo: 'Se utiliza para recopilar los datos personales, familiares y de contacto de los solicitantes, además de conocer su interés en adoptar. Permite iniciar y organizar formalmente el proceso.',
  },
  {
    nombre: 'Certificado de antecedentes penales',
    motivo: 'Se solicita para verificar si la persona solicitante tiene antecedentes penales. Esta información ayuda a evaluar la seguridad y la idoneidad de los solicitantes durante el proceso de adopción.',
  },
  {
    nombre: 'Comprobante de ingresos',
    motivo: 'Se solicita para conocer la situación económica de los solicitantes y evaluar si cuentan con los recursos necesarios para asumir las responsabilidades y necesidades de un niño, niña o adolescente.',
  },
];

const childInterestStageNames: Record<string, string> = {
  interes_recibido: 'interés recibido por la institución',
  cita_inicial_programada: 'visita inicial programada',
  informe_visita_pendiente: 'informe de la visita inicial pendiente',
  informe_visita_revision: 'informe de la visita inicial en revisión',
  informe_visita_corregir: 'informe de la visita inicial requiere corrección',
  visita_hogar_disponible: 'visita al hogar disponible para programar',
  cita_hogar_programada: 'visita al hogar programada',
  evaluacion_hogar_pendiente: 'evaluación del hogar pendiente',
  evaluacion_hogar_revision: 'evaluación del hogar en revisión institucional',
  evaluacion_hogar_no_favorable: 'evaluación del hogar no favorable; caso abierto',
  entrega_disponible: 'etapa de entrega disponible para coordinar',
  cita_entrega_programada: 'cita de entrega programada; falta confirmar la entrega',
  entrega_confirmada: 'entrega confirmada, pendiente de cierre del caso',
  finalizado: 'proceso finalizado',
};

const childInterestStageGuidance: Record<string, string> = {
  interes_recibido: 'La familia ya eligió a este niño. Debe esperar a que la institución programe la visita inicial.',
  cita_inicial_programada: 'La institución programó la visita inicial. Si la cita ya se realizó, la familia debe esperar a que la institución envíe el informe al psicólogo.',
  informe_visita_pendiente: 'La visita inicial ya se realizó y la familia confirmó su asistencia. La familia espera que la institución envíe el informe al psicólogo.',
  informe_visita_revision: 'La institución envió el informe al psicólogo; la familia espera que el psicólogo lo revise y acepte.',
  informe_visita_corregir: 'El psicólogo solicitó una corrección del informe a la institución. La familia debe esperar la actualización.',
  visita_hogar_disponible: 'El psicólogo aceptó el informe. La familia debe registrar o confirmar la dirección del hogar en Datos del hogar para coordinar la visita.',
  cita_hogar_programada: 'El psicólogo programó la visita al hogar. La cita usa la dirección que registró la familia; se debe mostrar fecha, hora y dirección. El botón Cómo llegar abre Google Maps si hay ubicación.',
  evaluacion_hogar_pendiente: 'La visita al hogar se realizó; la familia espera que el psicólogo envíe su evaluación a la institución.',
  evaluacion_hogar_revision: 'El psicólogo envió la evaluación del hogar; la familia espera la decisión institucional.',
  evaluacion_hogar_no_favorable: 'La institución indicó que se requiere seguimiento. El caso sigue abierto; explica solo las observaciones registradas.',
  entrega_disponible: 'La evaluación fue favorable. La familia espera que se programe una cita para la entrega o para recoger al niño.',
  cita_entrega_programada: 'Hay una cita de entrega programada. La familia puede revisar la fecha, hora y dirección y abrir Google Maps si hay ubicación. La cita aún no significa que el proceso terminó.',
  entrega_confirmada: 'La entrega ya fue confirmada y el psicólogo debe cerrar el caso.',
  finalizado: 'El proceso de vinculación fue cerrado.',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Inicia sesión para usar el asistente.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
      console.error('Falta configurar SUPABASE_URL, SUPABASE_ANON_KEY o GEMINI_API_KEY.');
      return json({ error: 'El asistente aún no está configurado en el servidor.' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Tu sesión no es válida. Vuelve a iniciar sesión.' }, 401);

    const body = await request.json();
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message) return json({ error: 'Escribe una pregunta para continuar.' }, 400);

    const [{ data: profile }, { data: documents }, { data: caseData }, { data: appointments }, { data: latestReportOutcome }, { data: childInterestCases }, { data: notifications }] = await Promise.all([
      supabase.from('profiles').select('account_type, home_address').eq('id', authData.user.id).maybeSingle(),
      supabase.from('family_documents').select('document_type, created_at').eq('family_id', authData.user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('family_cases').select('status, psychologist_id').eq('family_id', authData.user.id).maybeSingle(),
      supabase.from('family_appointments').select('title, appointment_date, appointment_time, appointment_location, attended_at, appointment_type, child_interest_case_id').eq('family_id', authData.user.id).order('appointment_date', { ascending: true }).limit(20),
      supabase.rpc('family_latest_report_outcome'),
      supabase.rpc('child_case_list'),
      supabase.from('family_notifications').select('category, title, message, created_at').eq('family_id', authData.user.id).order('created_at', { ascending: false }).limit(10),
    ]);
    if (profile?.account_type !== 'familia') return json({ error: 'Este asistente está disponible para cuentas familiares.' }, 403);

    const uploadedNames = new Set((documents ?? []).map((document) => document.document_type.trim().toLocaleLowerCase('es')));
    const reportOutcome = Array.isArray(latestReportOutcome) ? latestReportOutcome[0] ?? null : null;
    const familyContext = {
      documentos_requeridos: requiredDocuments.map((document) => ({
        ...document,
        enviado: uploadedNames.has(document.nombre.toLocaleLowerCase('es')),
      })),
      aclaracion_documentos: 'Estos documentos forman parte de la evaluación del proceso de adopción. Entregarlos no garantiza la aprobación de la solicitud; cada documento será revisado por el personal correspondiente y tratado de manera confidencial.',
      estado_expediente: caseData?.status ?? 'sin expediente creado',
      psicologo_asignado: Boolean(caseData?.psychologist_id),
      citas_realizadas: (appointments ?? []).filter((appointment) => Boolean(appointment.attended_at)).map((appointment) => ({
        titulo: appointment.title,
        fecha: appointment.appointment_date,
        asistencia_confirmada: true,
      })),
      proximas_citas: (appointments ?? []).filter((appointment) => !appointment.attended_at).map((appointment) => ({
        titulo: appointment.title,
        tipo: appointment.appointment_type ?? 'psicologica',
        pertenece_a_proceso_de_vinculacion: Boolean(appointment.child_interest_case_id),
        fecha: appointment.appointment_date,
        hora: appointment.appointment_time,
        direccion: appointment.appointment_location,
      })),
      direccion_del_hogar: {
        registrada: Boolean(profile?.home_address?.trim()),
        instrucciones: 'La familia la registra o actualiza en Datos del hogar. El psicólogo usa esa dirección para programar la visita al hogar.',
      },
      procesos_de_vinculacion: (childInterestCases ?? []).map((item) => ({
        estado: item.status,
        etapa: childInterestStageNames[item.status] ?? 'etapa en proceso',
        siguiente_paso: childInterestStageGuidance[item.status] ?? 'Consulta el estado y las notificaciones para conocer el siguiente paso.',
        niño: item.child_name,
        edad: item.child_age,
        decision_institucional: item.institution_decision,
        observaciones_institucionales: item.institution_observations,
        cita: item.appointment_id ? {
          tipo: item.appointment_type,
          fecha: item.appointment_date,
          hora: item.appointment_time,
          direccion: item.appointment_location,
          realizada: Boolean(item.attended_at),
        } : null,
        informe: item.report_status ? { estado: item.report_status, motivo: item.report_reason } : null,
        entrega_confirmada: item.status === 'entrega_confirmada' || item.status === 'finalizado',
        fecha_inicio: item.created_at,
      })),
      notificaciones_recientes: (notifications ?? []).map((item) => ({
        categoria: item.category,
        titulo: item.title,
        mensaje: item.message,
        fecha: item.created_at,
      })),
      evaluacion_psicologica: {
        estado: reportOutcome?.status ?? ((appointments ?? []).some((appointment) => Boolean(appointment.attended_at)) ? 'informe_en_preparacion' : 'pendiente'),
        resultado: reportOutcome?.status === 'aceptada' ? 'apta_para_catalogo' : reportOutcome?.status === 'rechazada' ? 'requiere_nueva_evaluacion' : reportOutcome?.status === 'pendiente' ? 'pendiente_de_decision_institucional' : 'sin_resultado',
        motivo_institucional: reportOutcome?.reason ?? null,
        fecha_decision: reportOutcome?.decided_at ?? null,
      },
      acceso_catalogo: {
        habilitado: reportOutcome?.status === 'aceptada',
        estado: reportOutcome?.status === 'aceptada' ? 'habilitado' : reportOutcome?.status === 'rechazada' ? 'no_habilitado' : 'pendiente',
      },
    };

    const rawHistory = Array.isArray(body?.history)
      ? body.history.slice(-8).flatMap((item: unknown) => {
          if (!item || typeof item !== 'object') return [];
          const record = item as { role?: unknown; text?: unknown };
          if ((record.role !== 'user' && record.role !== 'assistant') || typeof record.text !== 'string') return [];
          return [{ role: record.role === 'assistant' ? 'model' : 'user', parts: [{ text: record.text.slice(0, 1000) }] }];
        })
      : [];
    const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const item of rawHistory) {
      const previous = history.at(-1);
      const text = item.parts[0].text;
      if (previous?.role === item.role) previous.parts[0].text += `\n${text}`;
      else history.push(item);
    }
    while (history[0]?.role === 'model') history.shift();
    if (history.at(-1)?.role === 'user') history.at(-1)!.parts[0].text += `\n${message}`;
    else history.push({ role: 'user', parts: [{ text: message }] });

    let geminiResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `Eres el asistente informativo de PathHome para familias. Responde en español claro, amable y breve. Ayuda con documentos, citas, notificaciones, evaluación psicológica, catálogo y vinculación con el niño elegido. Usa exclusivamente el contexto familiar y estas reglas confirmadas; nunca inventes estados, decisiones, motivos, fechas ni plazos.

Antes del catálogo: cuando la institución aprueba los documentos, el expediente aparece a los psicólogos verificados. Uno toma el caso y queda a cargo de la evaluación psicológica. La familia debe revisar las citas y notificaciones para continuar. El catálogo solo se habilita cuando la evaluación psicológica aparece como aceptada. Si está rechazada, no hay acceso al catálogo y puede requerirse otra evaluación; si no hay resultado, dilo claramente.

Elección en el catálogo: la familia elige un solo niño. Antes de enviar el interés, la aplicación pide confirmar que desea elegirlo y avisa que después no podrá volver al catálogo para elegir otro. Al aceptar, vuelve al inicio; en el recuadro de seguimiento aparece el niño elegido y que debe esperar la visita inicial de la institución. El psicólogo que tomó el expediente familiar continúa a cargo de las etapas de vinculación. No prometas que se puede cambiar o elegir otro niño desde el catálogo.

Vinculación: explica el siguiente paso específico indicado por el estado de cada caso. El flujo puede pasar por visita inicial de la institución, envío de su informe al psicólogo, revisión o corrección del informe, visita del psicólogo al hogar, evaluación del hogar, decisión institucional, cita de entrega/recogida y cierre. Tras confirmar asistencia a la visita inicial, la familia espera el informe; cuando la institución lo envía, espera la revisión del psicólogo. Tras la visita al hogar, espera la evaluación del psicólogo y luego la decisión institucional. Solo comunica el estado de la familia que aparece en contexto.

Dirección y citas: la familia registra su domicilio en la sección Datos del hogar. Para la visita al hogar el psicólogo usa esa dirección. En Mi proceso y en el recuadro de Inicio se muestra el estado; al programarse una cita se muestran fecha, hora y dirección disponibles. Si hay dirección, el botón Cómo llegar abre Google Maps. Distingue citas futuras de citas realizadas y explica claramente el tipo. La cita de entrega no termina por sí sola el proceso; se requiere confirmar la entrega y cerrar el caso.

Notificaciones y seguimiento: las notificaciones avisan cambios del proceso y nuevas citas; Mi proceso muestra las etapas hasta Catálogo de niños y, si hay una elección, el recuadro de seguimiento de ese niño con el paso actual y la cita cuando exista. Recomienda revisar Inicio, Mi proceso y Notificaciones, sin afirmar que se envió un aviso si no aparece en los datos.

La institución y el psicólogo toman las decisiones; tú no apruebas solicitudes, evaluaciones ni asistencias, y no puedes modificar citas ni datos. Trata los datos como confidenciales. No solicites contraseñas, información financiera, números de identidad ni copias de documentos por el chat. Si falta información, dilo y recomienda consultar a la institución. El contexto es privado y solo debe usarse para responder a esta familia: ${JSON.stringify(familyContext)}` }] },
          contents: history,
          generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
        }),
      });
      if (geminiResponse.status !== 503 || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
    if (!geminiResponse.ok) {
      console.error('Gemini respondió con estado', geminiResponse.status);
      const errorMessage = geminiResponse.status === 503
        ? 'Gemini está temporalmente ocupado. Espera unos segundos e inténtalo de nuevo.'
        : 'No se pudo obtener una respuesta ahora. Inténtalo de nuevo en un momento.';
      return json({ error: errorMessage }, 502);
    }
    const result = await geminiResponse.json();
    const reply = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('').trim();
    if (!reply) return json({ error: 'El asistente no pudo preparar una respuesta. Inténtalo de nuevo.' }, 502);
    return json({ reply });
  } catch (error) {
    console.error('Error en family-assistant:', error);
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return json({ error: timedOut ? 'Gemini está tardando más de lo normal. Espera unos segundos e inténtalo de nuevo.' : 'Ocurrió un error al consultar al asistente. Inténtalo de nuevo.' }, timedOut ? 504 : 500);
  }
});
