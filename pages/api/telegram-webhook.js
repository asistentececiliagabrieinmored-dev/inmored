import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../../lib/supabaseAdmin';
import { buscarRequerimientosCoincidentes } from '../../lib/matching';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const RETENCION_DIAS_DEFECTO = 30; // fallback cuando no se identifica el tipo de transacción
const RETENCION_DIAS_VENTA_DEFECTO = 60;
const RETENCION_DIAS_ALQUILER_DEFECTO = 30;

const anthropic = new Anthropic();

const nullableString = (description) => ({
  anyOf: [{ type: 'string', description }, { type: 'null' }],
});
const nullableNumber = (description) => ({
  anyOf: [{ type: 'number', description }, { type: 'null' }],
});

const ESQUEMA_REFERENCIA = {
  type: 'object',
  properties: {
    tipo_inmueble: nullableString('Tipo de inmueble mencionado: casa, departamento, terreno, oficina, local, etc.'),
    tipo_transaccion: nullableString('Tipo de transacción: venta, alquiler o anticrético.'),
    zona: nullableString('Zona o barrio de Santa Cruz de la Sierra mencionado.'),
    ubicacion: nullableString('Dirección o referencia de ubicación exacta, si se menciona.'),
    precio: nullableNumber(
      'Precio del inmueble tal cual aparece en el mensaje, solo el valor numérico sin símbolos. ' +
        'No convertir de moneda: si dice "Bs. 22.000" el valor es 22000, no una conversión a dólares.'
    ),
    moneda: {
      anyOf: [
        {
          type: 'string',
          enum: ['usd', 'bob'],
          description: 'Moneda del precio: "usd" si está en dólares americanos, "bob" si está en bolivianos (Bs.).',
        },
        { type: 'null' },
      ],
    },
    dimensiones: nullableString('Superficie o dimensiones mencionadas (ej: "500 m2", "12x30").'),
    dormitorios: nullableNumber('Cantidad de dormitorios mencionada, solo el número entero.'),
    contacto_nombre: nullableString('Nombre de la persona de contacto, si se menciona.'),
    contacto_telefono: nullableString('Teléfono de contacto, si se menciona.'),
    descripcion: { type: 'string', description: 'Resumen breve (1-2 frases) del inmueble, en español.' },
  },
  required: [
    'tipo_inmueble',
    'tipo_transaccion',
    'zona',
    'ubicacion',
    'precio',
    'dimensiones',
    'contacto_nombre',
    'contacto_telefono',
    'descripcion',
    'moneda',
    'dormitorios',
  ],
  additionalProperties: false,
};

async function enviarMensaje(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
}

function encontrarCoincidencia(valor, catalogo) {
  if (!valor) return null;
  const normalizado = valor.trim().toLowerCase();
  const exacto = catalogo.find((c) => c.nombre.toLowerCase() === normalizado);
  if (exacto) return exacto.id;
  const parcial = catalogo.find(
    (c) => normalizado.includes(c.nombre.toLowerCase()) || c.nombre.toLowerCase().includes(normalizado)
  );
  return parcial ? parcial.id : null;
}

async function extraerDatosReferencia(texto) {
  const respuesta = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system:
      'Extraés datos estructurados de mensajes de WhatsApp reenviados que describen inmuebles ' +
      'en venta, alquiler o anticrético en Santa Cruz de la Sierra, Bolivia. Si un dato no aparece ' +
      'en el texto, dejalo en null. No inventes información que no esté en el mensaje.',
    messages: [{ role: 'user', content: texto }],
    output_config: {
      format: { type: 'json_schema', schema: ESQUEMA_REFERENCIA },
    },
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === 'text');
  return bloqueTexto ? JSON.parse(bloqueTexto.text) : null;
}

async function manejarActivacion(chatId, texto, usuarioExistente) {
  const { data: codigoFila } = await supabaseAdmin
    .from('codigos_activacion_telegram')
    .select('id, usuario_id, dias_acceso, fecha_expiracion, usado')
    .eq('codigo', texto)
    .maybeSingle();

  if (!codigoFila) {
    await enviarMensaje(
      chatId,
      usuarioExistente
        ? 'Tu acceso venció. Pedile a Romano un código de activación nuevo y enviámelo acá.'
        : 'Hola 👋 Para activar tu acceso, enviame el código de activación que te dio Romano.'
    );
    return;
  }

  if (codigoFila.usado) {
    await enviarMensaje(chatId, 'Ese código ya fue usado. Pedí uno nuevo.');
    return;
  }

  if (new Date(codigoFila.fecha_expiracion) < new Date()) {
    await enviarMensaje(chatId, 'Ese código venció antes de que lo usaras. Pedí uno nuevo.');
    return;
  }

  const nuevaFechaAcceso = new Date(Date.now() + codigoFila.dias_acceso * 24 * 60 * 60 * 1000);

  const { error: errorUsuario } = await supabaseAdmin
    .from('usuarios')
    .update({
      telegram_chat_id: chatId,
      telegram_activo: true,
      telegram_acceso_hasta: nuevaFechaAcceso.toISOString(),
    })
    .eq('id', codigoFila.usuario_id);

  if (errorUsuario) {
    await enviarMensaje(chatId, 'Hubo un error activando tu acceso. Avisale a Romano.');
    return;
  }

  await supabaseAdmin
    .from('codigos_activacion_telegram')
    .update({ usado: true, fecha_uso: new Date().toISOString() })
    .eq('id', codigoFila.id);

  await enviarMensaje(
    chatId,
    `Listo, tu acceso quedó activado hasta el ${nuevaFechaAcceso.toLocaleDateString('es-BO')}. ` +
      'A partir de ahora, reenviame acá los inmuebles que veas en los grupos de WhatsApp y los guardo automáticamente.'
  );
}

async function procesarReferencia(usuario, chatId, mensaje) {
  const texto = mensaje.text.trim();

  const [{ data: tiposInmueble }, { data: tiposTransaccion }, { data: zonas }, { data: configFilas }] =
    await Promise.all([
      supabaseAdmin.from('tipos_inmueble').select('id, nombre'),
      supabaseAdmin.from('tipos_transaccion').select('id, nombre'),
      supabaseAdmin.from('zonas').select('id, nombre'),
      supabaseAdmin
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', [
          'retencion_dias_referencias_venta',
          'retencion_dias_referencias_alquiler_anticretico',
          'retencion_dias_referencias_externas',
        ]),
    ]);

  const configPorClave = Object.fromEntries((configFilas || []).map((f) => [f.clave, f.valor]));

  let datos = null;
  try {
    datos = await extraerDatosReferencia(texto);
  } catch (err) {
    console.error('Error llamando a Claude:', err);
  }

  const tipoInmuebleId = encontrarCoincidencia(datos?.tipo_inmueble, tiposInmueble || []);
  const tipoTransaccionId = encontrarCoincidencia(datos?.tipo_transaccion, tiposTransaccion || []);
  const zonaId = encontrarCoincidencia(datos?.zona, zonas || []);

  const tipoTransaccionNombre = (tiposTransaccion || [])
    .find((t) => t.id === tipoTransaccionId)
    ?.nombre?.toLowerCase();

  let diasRetencion;
  if (tipoTransaccionNombre === 'venta') {
    diasRetencion = Number(configPorClave.retencion_dias_referencias_venta) || RETENCION_DIAS_VENTA_DEFECTO;
  } else if (tipoTransaccionNombre === 'alquiler' || tipoTransaccionNombre === 'anticretico') {
    diasRetencion =
      Number(configPorClave.retencion_dias_referencias_alquiler_anticretico) || RETENCION_DIAS_ALQUILER_DEFECTO;
  } else {
    diasRetencion = Number(configPorClave.retencion_dias_referencias_externas) || RETENCION_DIAS_DEFECTO;
  }

  const fechaExpiracion = new Date(Date.now() + diasRetencion * 24 * 60 * 60 * 1000);

  const { error: errorInsert } = await supabaseAdmin.from('referencias_externas').insert({
    origen: 'telegram_bot',
    cargado_por_usuario_id: usuario.id,
    telegram_chat_id: chatId,
    telegram_message_id: String(mensaje.message_id),
    texto_original: texto,
    tipo_inmueble_id: tipoInmuebleId,
    tipo_transaccion_id: tipoTransaccionId,
    zona_id: zonaId,
    ubicacion: datos?.ubicacion || null,
    precio: datos?.precio || null,
    moneda: datos?.moneda || null,
    dimensiones: datos?.dimensiones || null,
    dormitorios: datos?.dormitorios || null,
    descripcion: datos?.descripcion || texto.slice(0, 300),
    contacto_nombre: datos?.contacto_nombre || null,
    contacto_telefono: datos?.contacto_telefono || null,
    fecha_expiracion: fechaExpiracion.toISOString(),
  });

  if (errorInsert) {
    console.error('Error guardando referencia externa:', errorInsert);
    await enviarMensaje(chatId, 'No pude guardar esa referencia. Probá reenviarla de nuevo en un rato.');
    return;
  }

  try {
    const requerimientosCoincidentes = await buscarRequerimientosCoincidentes(supabaseAdmin, {
      tipoInmuebleId,
      tipoTransaccionId,
      zonaId,
      precio: datos?.precio || null,
      moneda: datos?.moneda || null,
      dormitorios: datos?.dormitorios || null,
    });

    for (const req of requerimientosCoincidentes) {
      const { data: asesor } = await supabaseAdmin
        .from('usuarios')
        .select('telegram_chat_id, telegram_activo')
        .eq('id', req.asesor_id)
        .maybeSingle();

      if (asesor?.telegram_activo && asesor.telegram_chat_id) {
        await enviarMensaje(
          asesor.telegram_chat_id,
          `🔔 Nueva referencia que podría interesarle a tu cliente "${req.cliente_nombre}":\n\n${
            datos?.descripcion || texto.slice(0, 200)
          }`
        );
      }
    }
  } catch (err) {
    console.error('Error buscando requerimientos coincidentes:', err);
  }

  const precioFormateado = datos?.precio
    ? `${datos.moneda === 'bob' ? 'Bs.' : '$us'} ${datos.precio}`
    : null;

  const resumen = [
    datos?.tipo_inmueble ? `Tipo: ${datos.tipo_inmueble}` : null,
    datos?.tipo_transaccion ? `Transacción: ${datos.tipo_transaccion}` : null,
    datos?.zona ? `Zona: ${datos.zona}` : null,
    precioFormateado ? `Precio: ${precioFormateado}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  await enviarMensaje(
    chatId,
    resumen
      ? `Guardado ✅\n${resumen}`
      : 'Guardado ✅ (no pude identificar todos los datos, pero el texto completo quedó guardado).'
  );
}

async function manejarComando(chatId, texto, usuario) {
  const comando = texto.split(/\s+/)[0].toLowerCase();

  if (comando === '/ayuda' || comando === '/start') {
    await enviarMensaje(
      chatId,
      'Hola 👋 Soy el bot de InmoRed.\n\n' +
        (usuario?.telegram_activo
          ? 'Ya tenés tu acceso activo. Reenviame los inmuebles que veas en los grupos de WhatsApp y los guardo automáticamente.'
          : 'Para activar tu acceso, enviame el código de activación que te dio Romano.') +
        '\n\nComandos disponibles:\n/ayuda — este mensaje\n/estado — ver si tu acceso está activo'
    );
    return;
  }

  if (comando === '/estado') {
    const vigente =
      usuario?.telegram_activo &&
      usuario.telegram_acceso_hasta &&
      new Date(usuario.telegram_acceso_hasta) > new Date();

    await enviarMensaje(
      chatId,
      vigente
        ? `Tu acceso está activo hasta el ${new Date(usuario.telegram_acceso_hasta).toLocaleDateString('es-BO')}.`
        : 'Todavía no activaste tu acceso. Enviame el código de activación que te dio Romano.'
    );
    return;
  }

  await enviarMensaje(chatId, 'No reconozco ese comando. Escribí /ayuda para ver las opciones.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    res.status(401).end();
    return;
  }

  const mensaje = req.body?.message;

  if (!mensaje || !mensaje.text) {
    res.status(200).end();
    return;
  }

  const chatId = String(mensaje.chat.id);
  const texto = mensaje.text.trim();

  try {
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, telegram_activo, telegram_acceso_hasta')
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    if (texto.startsWith('/')) {
      await manejarComando(chatId, texto, usuario);
      res.status(200).end();
      return;
    }

    const tieneAccesoVigente =
      usuario &&
      usuario.telegram_activo &&
      usuario.telegram_acceso_hasta &&
      new Date(usuario.telegram_acceso_hasta) > new Date();

    if (!tieneAccesoVigente) {
      await manejarActivacion(chatId, texto, usuario);
      res.status(200).end();
      return;
    }

    await procesarReferencia(usuario, chatId, mensaje);
    res.status(200).end();
  } catch (err) {
    console.error('Error en telegram-webhook:', err);
    res.status(200).end();
  }
}
