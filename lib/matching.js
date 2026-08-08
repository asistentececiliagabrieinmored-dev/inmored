// Lógica de cruce entre requerimientos (lo que buscan los clientes) e
// inventario disponible: primero inmuebles propios de InmoRed, después
// referencias externas que llegan por el bot de Telegram.
//
// El filtro de ubicación usa Claude Haiku para juzgar si el texto libre del
// requerimiento (ej: "avenida Beni") coincide razonablemente con la ubicación
// de cada candidato. Solo se llama a la IA sobre los candidatos que ya
// pasaron los filtros baratos (tipo, zona, presupuesto, dormitorios), y solo
// cuando hay un criterio de ubicación para evaluar. Si la llamada a Claude
// falla, se usa como respaldo una comparación de texto simple (sin acentos,
// sin abreviaturas) para no dejar el matching sin funcionar.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const CODIGO_INICIO_MARCAS = 0x0300;
const CODIGO_FIN_MARCAS = 0x036f;

function quitarAcentos(texto) {
  return Array.from(texto.normalize('NFD'))
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0);
      return codigo < CODIGO_INICIO_MARCAS || codigo > CODIGO_FIN_MARCAS;
    })
    .join('');
}

// Unifica abreviaturas comunes de direcciones (Av./Avda./Avenida, C//Calle)
// para que "Av. Doble Vía" y "Avenida Doble Via" se consideren iguales.
function normalizarAbreviaturas(texto) {
  let resultado = texto.replace(/\bc\//g, 'calle ');
  resultado = resultado.replace(/\./g, '');
  resultado = resultado.replace(/\s+/g, ' ').trim();
  resultado = resultado.replace(/\b(avenida|avda|ave|av)\b/g, 'av');
  resultado = resultado.replace(/\b(calle|c)\b/g, 'calle');
  return resultado;
}

function normalizarTexto(texto) {
  const sinAcentos = quitarAcentos(texto).toLowerCase().trim();
  return normalizarAbreviaturas(sinAcentos);
}

function ubicacionCoincideConTexto(ubicacionCandidato, textoBuscado) {
  if (!textoBuscado) return true;
  if (!ubicacionCandidato) return false;
  return normalizarTexto(ubicacionCandidato).includes(normalizarTexto(textoBuscado));
}

const ESQUEMA_CLAVES_COINCIDENTES = {
  type: 'object',
  properties: {
    clavesCoincidentes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Claves (tal cual aparecen en la lista de candidatos) cuya ubicación coincide razonablemente.',
    },
  },
  required: ['clavesCoincidentes'],
  additionalProperties: false,
};

// candidatos: [{ clave, ubicacion, descripcion? }]. Devuelve el set de claves
// que la IA considera una coincidencia razonable de ubicación.
async function idsRelevantesPorUbicacionIA(criterioTexto, candidatos) {
  const lista = candidatos
    .map(
      (c) =>
        `${c.clave}: ubicación="${c.ubicacion || 'sin dato'}"${
          c.descripcion ? ` — descripción="${c.descripcion.slice(0, 150)}"` : ''
        }`
    )
    .join('\n');

  const respuesta = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system:
      'Evaluás si la ubicación de un inmueble coincide razonablemente con lo que un cliente está buscando ' +
      'en Santa Cruz de la Sierra, Bolivia. Considerá sinónimos, abreviaturas (Av./Avenida, C//Calle), errores ' +
      'de tipeo, acentos, y cercanía real entre zonas/anillos/avenidas conocidas. Sé razonablemente flexible, ' +
      'pero no incluyas ubicaciones claramente distintas o en otra zona de la ciudad.',
    messages: [
      {
        role: 'user',
        content:
          `El cliente busca algo ubicado en o cerca de: "${criterioTexto}"\n\n` +
          `Candidatos:\n${lista}\n\n` +
          'Devolvé las claves de los candidatos cuya ubicación coincide razonablemente con lo que busca el cliente.',
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: ESQUEMA_CLAVES_COINCIDENTES },
    },
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === 'text');
  if (!bloqueTexto) throw new Error('Claude no devolvió una respuesta de texto.');
  const { clavesCoincidentes } = JSON.parse(bloqueTexto.text);
  return new Set(clavesCoincidentes);
}

// Filtra candidatos por ubicación, usando IA cuando hay un criterio de texto
// y respaldándose en comparación de texto simple si la IA falla.
async function filtrarCandidatosPorUbicacion(criterioTexto, candidatos) {
  if (!criterioTexto || candidatos.length === 0) return candidatos;

  try {
    const clavesRelevantes = await idsRelevantesPorUbicacionIA(criterioTexto, candidatos);
    return candidatos.filter((c) => clavesRelevantes.has(c.clave));
  } catch (err) {
    console.error('Error evaluando relevancia de ubicación con IA, usando respaldo por texto:', err);
    return candidatos.filter((c) => ubicacionCoincideConTexto(c.ubicacion, criterioTexto));
  }
}

export async function buscarCoincidenciasParaRequerimiento(client, criterios) {
  const {
    tipoInmuebleId,
    tipoTransaccionId,
    zonaIds,
    ubicacionReferencia,
    presupuestoMin,
    presupuestoMax,
    dormitoriosMin,
  } = criterios;

  let queryInmuebles = client
    .from('inmuebles')
    .select('id, nombre, ubicacion, precio_venta, dormitorios, zona_id, captador:usuarios(nombre, telefono)')
    .in('estado', ['disponible', 'en_proceso']);

  // Un candidato con tipo/zona sin resolver no se descarta: queda pendiente de
  // que lo evalúe el filtro de ubicación (texto/IA) en vez de perderse por un
  // dato que nunca se terminó de cargar (pasa seguido con referencias externas).
  if (tipoInmuebleId) queryInmuebles = queryInmuebles.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  if (tipoTransaccionId) {
    queryInmuebles = queryInmuebles.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);
  }
  if (zonaIds && zonaIds.length > 0) queryInmuebles = queryInmuebles.or(`zona_id.in.(${zonaIds.join(',')}),zona_id.is.null`);
  if (presupuestoMin) queryInmuebles = queryInmuebles.gte('precio_venta', presupuestoMin);
  if (presupuestoMax) queryInmuebles = queryInmuebles.lte('precio_venta', presupuestoMax);
  if (dormitoriosMin) queryInmuebles = queryInmuebles.gte('dormitorios', dormitoriosMin);

  const { data: inmueblesPreFiltrados } = await queryInmuebles;

  let queryReferencias = client
    .from('referencias_externas')
    .select('id, ubicacion, precio, moneda, dimensiones, dormitorios, contacto_nombre, contacto_telefono, descripcion, zona_id')
    .eq('activa', true)
    .gt('fecha_expiracion', new Date().toISOString());

  if (tipoInmuebleId) {
    queryReferencias = queryReferencias.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  }
  if (tipoTransaccionId) {
    queryReferencias = queryReferencias.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);
  }
  if (zonaIds && zonaIds.length > 0) {
    queryReferencias = queryReferencias.or(`zona_id.in.(${zonaIds.join(',')}),zona_id.is.null`);
  }
  if (dormitoriosMin) queryReferencias = queryReferencias.gte('dormitorios', dormitoriosMin);

  const { data: referenciasSinFiltrarPrecio } = await queryReferencias;

  // El precio de la referencia solo se compara contra el presupuesto cuando
  // está en dólares. No convertimos automáticamente bolivianos a dólares, así
  // que esas referencias quedan igual en la lista para que el asesor decida.
  const referenciasPreFiltradas = (referenciasSinFiltrarPrecio || []).filter((r) => {
    if (r.moneda !== 'usd' || !r.precio) return true;
    if (presupuestoMin && r.precio < presupuestoMin) return false;
    if (presupuestoMax && r.precio > presupuestoMax) return false;
    return true;
  });

  if (!ubicacionReferencia) {
    return { inmuebles: inmueblesPreFiltrados || [], referencias: referenciasPreFiltradas };
  }

  const candidatosConClave = [
    ...(inmueblesPreFiltrados || []).map((i) => ({ clave: `inmueble-${i.id}`, ubicacion: i.ubicacion })),
    ...referenciasPreFiltradas.map((r) => ({
      clave: `referencia-${r.id}`,
      ubicacion: r.ubicacion,
      descripcion: r.descripcion,
    })),
  ];

  const candidatosRelevantes = await filtrarCandidatosPorUbicacion(ubicacionReferencia, candidatosConClave);
  const clavesRelevantes = new Set(candidatosRelevantes.map((c) => c.clave));

  return {
    inmuebles: (inmueblesPreFiltrados || []).filter((i) => clavesRelevantes.has(`inmueble-${i.id}`)),
    referencias: referenciasPreFiltradas.filter((r) => clavesRelevantes.has(`referencia-${r.id}`)),
  };
}

// Arma el texto del aviso (web y Telegram usan el mismo formato).
export function formatearResumenCoincidencias(nombreRequerimiento, inmuebles, referencias) {
  const total = inmuebles.length + referencias.length;

  const lineas = [
    total > 0
      ? `🔔 Encontré ${total} coincidencia(s) para "${nombreRequerimiento}":`
      : `Requerimiento guardado: "${nombreRequerimiento}". Todavía no hay coincidencias, te avisamos apenas aparezca algo.`,
  ];

  inmuebles.forEach((i) => {
    const asesorTexto = i.captador?.nombre
      ? `${i.captador.nombre}${i.captador.telefono ? ` (${i.captador.telefono})` : ''}`
      : 'sin asesor asignado';
    lineas.push(
      `• [Propio] ${i.nombre || i.ubicacion || `Inmueble #${i.id}`} — $us ${i.precio_venta ?? '?'} — Asesor: ${asesorTexto}`
    );
  });

  referencias.forEach((r) => {
    const precioTexto = r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'precio no informado';
    const contactoTexto = r.contacto_nombre
      ? `${r.contacto_nombre}${r.contacto_telefono ? ` (${r.contacto_telefono})` : ''}`
      : 'sin contacto';
    lineas.push(
      `• [Referencia] ${r.ubicacion || r.descripcion?.slice(0, 60) || 'Sin ubicación'} — ${precioTexto} — Contacto: ${contactoTexto}`
    );
  });

  return lineas.join('\n');
}

export async function buscarRequerimientosCoincidentes(client, criterios) {
  const { tipoInmuebleId, tipoTransaccionId, zonaId, ubicacion, precio, moneda, dormitorios } = criterios;

  let query = client
    .from('requerimientos')
    .select('id, asesor_id, nombre_requerimiento, ubicacion_referencia, presupuesto_min, presupuesto_max, dormitorios_min')
    .eq('estado', 'activo');

  // Un requerimiento con tipo_inmueble_id/tipo_transaccion_id en null acepta
  // cualquier tipo (así lo define el formulario), así que no se descarta.
  if (tipoInmuebleId) query = query.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  if (tipoTransaccionId) query = query.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);

  const { data: candidatos } = await query;
  if (!candidatos || candidatos.length === 0) return [];

  const { data: todasZonas } = await client.from('requerimiento_zonas').select('requerimiento_id, zona_id');
  const zonasPorRequerimiento = new Map();
  (todasZonas || []).forEach((fila) => {
    if (!zonasPorRequerimiento.has(fila.requerimiento_id)) zonasPorRequerimiento.set(fila.requerimiento_id, []);
    zonasPorRequerimiento.get(fila.requerimiento_id).push(fila.zona_id);
  });

  const preCandidatos = candidatos.filter((req) => {
    const zonasAceptadas = zonasPorRequerimiento.get(req.id) || [];
    // Si la referencia nueva no tiene zona identificada (zonaId null), no se
    // descarta por zona — queda pendiente de lo que diga el filtro de ubicación.
    return zonasAceptadas.length === 0 || !zonaId || zonasAceptadas.includes(zonaId);
  });

  // Para esta dirección, el criterio de ubicación cambia por requerimiento
  // (cada uno tiene su propio ubicacion_referencia), así que se agrupan los
  // que sí tienen criterio en una sola llamada a la IA, comparándolos todos
  // contra la ubicación de esta referencia nueva.
  const conCriterio = preCandidatos.filter((req) => req.ubicacion_referencia);
  const sinCriterio = preCandidatos.filter((req) => !req.ubicacion_referencia);

  let idsConUbicacionOk = new Set(sinCriterio.map((req) => req.id));

  if (conCriterio.length > 0 && ubicacion) {
    try {
      const candidatosConClave = conCriterio.map((req) => ({
        clave: String(req.id),
        ubicacion: req.ubicacion_referencia,
      }));
      const clavesRelevantes = await idsRelevantesPorUbicacionIA(ubicacion, candidatosConClave);
      conCriterio.forEach((req) => {
        if (clavesRelevantes.has(String(req.id))) idsConUbicacionOk.add(req.id);
      });
    } catch (err) {
      console.error('Error evaluando relevancia de ubicación con IA, usando respaldo por texto:', err);
      conCriterio.forEach((req) => {
        if (ubicacionCoincideConTexto(ubicacion, req.ubicacion_referencia)) idsConUbicacionOk.add(req.id);
      });
    }
  }
  // Si hay requerimientos con criterio de ubicación pero la referencia nueva
  // no tiene ubicación identificada, esos requerimientos quedan sin marcar
  // como coincidencia — no se puede evaluar el criterio sin ese dato.

  return preCandidatos.filter((req) => {
    if (!idsConUbicacionOk.has(req.id)) return false;
    if (moneda === 'usd' && precio) {
      if (req.presupuesto_min && precio < req.presupuesto_min) return false;
      if (req.presupuesto_max && precio > req.presupuesto_max) return false;
    }
    if (req.dormitorios_min && dormitorios && dormitorios < req.dormitorios_min) return false;
    return true;
  });
}
