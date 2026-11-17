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

    const [{ data: profile }, { data: documents }, { data: caseData }, { data: appointments }, { data: latestReportOutcome }] = await Promise.all([
      supabase.from('profiles').select('account_type').eq('id', authData.user.id).maybeSingle(),
      supabase.from('family_documents').select('document_type, created_at').eq('family_id', authData.user.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('family_cases').select('status').eq('family_id', authData.user.id).maybeSingle(),
      supabase.from('family_appointments').select('title, appointment_date, appointment_time, attended_at').eq('family_id', authData.user.id).order('appointment_date', { ascending: true }).limit(10),
      supabase.rpc('family_latest_report_outcome'),
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
      citas_realizadas: (appointments ?? []).filter((appointment) => Boolean(appointment.attended_at)).map((appointment) => ({
        titulo: appointment.title,
        fecha: appointment.appointment_date,
        asistencia_confirmada: true,
      })),
      proximas_citas: (appointments ?? []).filter((appointment) => !appointment.attended_at).map((appointment) => ({
        titulo: appointment.title,
        fecha: appointment.appointment_date,
        hora: appointment.appointment_time,
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
          systemInstruction: { parts: [{ text: `Eres el asistente informativo de PathHome y respondes en español claro, amable y breve. Ayudas a las familias a entender sus documentos, citas y etapas del proceso, incluidas la evaluación psicológica y la decisión institucional sobre el acceso al catálogo. Usa exclusivamente los datos proporcionados en el contexto; nunca inventes estados, decisiones, motivos, reglas ni plazos. Si preguntan por el resultado, explica si la institución aceptó o rechazó el informe y comunica únicamente el motivo institucional registrado. El catálogo está habilitado solamente cuando el resultado dice aceptada; una decisión rechazada significa que no hay acceso y puede requerirse una nueva evaluación. Si no hay resultado, dilo claramente y no infieras aceptación o rechazo. Distingue las citas futuras de las citas cuya asistencia ya fue confirmada. La institución toma la decisión de aptitud a partir del informe profesional; tú no tomas decisiones. Trata documentos y datos del proceso como confidenciales. No solicites contraseñas, datos financieros, números de identidad ni copias de documentos por el chat. Si la información no basta, reconoce el límite y recomienda contactar a la institución. El contexto familiar es privado y solo debe usarse para contestar a esta familia: ${JSON.stringify(familyContext)}` }] },
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
