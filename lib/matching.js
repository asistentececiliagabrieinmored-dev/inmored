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

// Arma el texto del criterio de ubicación juntando las zonas aceptadas y la
// ubicación específica (si hay). Se usa cuando la zona no se pudo comparar
// por ID porque el candidato no tiene zona asignada (ej: una referencia que
// solo dice "avenida Alemana"): la IA decide si esa ubicación cae dentro de
// las zonas pedidas, en vez de dejarla pasar sin revisar.
function describirCriterioUbicacion(nombresZonas, ubicacionTexto) {
  const partes = [];
  if (nombresZonas && nombresZonas.length > 0) partes.push(`zona(s): ${nombresZonas.join(', ')}`);
  if (ubicacionTexto) partes.push(ubicacionTexto);
  return partes.join(' — ');
}

// Respaldo por texto cuando falla la IA: coincide si el texto menciona la
// ubicación específica o alguna de las zonas aceptadas.
function coincideConAlgunCriterio(ubicacionCandidato, nombresZonas, ubicacionTexto) {
  if (ubicacionTexto) return ubicacionCoincideConTexto(ubicacionCandidato, ubicacionTexto);
  return (nombresZonas || []).some((nombre) => ubicacionCoincideConTexto(ubicacionCandidato, nombre));
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
      'pero no incluyas ubicaciones claramente distintas o en otra zona de la ciudad. Si el criterio nombra ' +
      'zonas (ej: "Zona Sur", "Equipetrol"), incluí solo ubicaciones que realmente estén dentro o pegadas a ' +
      'esas zonas — por ejemplo, la avenida Alemana está en la zona norte, así que no coincide con Zona Sur.',
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
async function filtrarCandidatosPorUbicacion(criterioTexto, candidatos, respaldoPorTexto) {
  if (!criterioTexto || candidatos.length === 0) return candidatos;

  try {
    const clavesRelevantes = await idsRelevantesPorUbicacionIA(criterioTexto, candidatos);
    return candidatos.filter((c) => clavesRelevantes.has(c.clave));
  } catch (err) {
    console.error('Error evaluando relevancia de ubicación con IA, usando respaldo por texto:', err);
    return candidatos.filter(respaldoPorTexto || ((c) => ubicacionCoincideConTexto(c.ubicacion, criterioTexto)));
  }
}

// Convierte una fila de `requerimientos` (más sus zonas) en los criterios
// que espera buscarCoincidenciasParaRequerimiento.
export function criteriosDesdeRequerimiento(requerimiento, zonaIds) {
  return {
    tipoInmuebleId: requerimiento.tipo_inmueble_id,
    tipoTransaccionId: requerimiento.tipo_transaccion_id,
    zonaIds,
    ubicacionReferencia: requerimiento.ubicacion_referencia,
    presupuestoMin: requerimiento.presupuesto_min,
    presupuestoMax: requerimiento.presupuesto_max,
    dormitoriosMin: requerimiento.dormitorios_min,
  };
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
    .select(
      'id, nombre, ubicacion, precio_venta, dormitorios, banos, dimensiones, zona_id, ' +
        'tipo_transaccion:tipos_transaccion(nombre), captador:usuarios(nombre, telefono)'
    )
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
    .select(
      'id, ubicacion, precio, moneda, dimensiones, dormitorios, contacto_nombre, contacto_telefono, ' +
        'descripcion, zona_id, tipo_transaccion:tipos_transaccion(nombre), cargado_por:usuarios(nombre, telefono)'
    )
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

  const hayZonas = zonaIds && zonaIds.length > 0;
  let nombresZonas = [];
  if (hayZonas) {
    const { data: zonasData } = await client.from('zonas').select('nombre').in('id', zonaIds);
    nombresZonas = (zonasData || []).map((z) => z.nombre);
  }

  // Un candidato necesita revisión de ubicación si hay texto de ubicación
  // específica, o si el requerimiento pide zonas y el candidato no tiene zona
  // asignada (pasó el filtro de zona solo por tener zona_id null).
  const necesitaRevision = (candidato) => Boolean(ubicacionReferencia) || (hayZonas && !candidato.zona_id);

  const candidatosConClave = [
    ...(inmueblesPreFiltrados || [])
      .filter(necesitaRevision)
      .map((i) => ({ clave: `inmueble-${i.id}`, ubicacion: i.ubicacion })),
    ...referenciasPreFiltradas.filter(necesitaRevision).map((r) => ({
      clave: `referencia-${r.id}`,
      ubicacion: r.ubicacion,
      descripcion: r.descripcion,
    })),
  ];

  if (candidatosConClave.length === 0) {
    return { inmuebles: inmueblesPreFiltrados || [], referencias: referenciasPreFiltradas };
  }

  const criterioTexto = describirCriterioUbicacion(ubicacionReferencia ? [] : nombresZonas, ubicacionReferencia);
  const candidatosRelevantes = await filtrarCandidatosPorUbicacion(criterioTexto, candidatosConClave, (c) =>
    coincideConAlgunCriterio(c.ubicacion, nombresZonas, ubicacionReferencia)
  );
  const clavesRelevantes = new Set(candidatosRelevantes.map((c) => c.clave));

  return {
    inmuebles: (inmueblesPreFiltrados || []).filter(
      (i) => !necesitaRevision(i) || clavesRelevantes.has(`inmueble-${i.id}`)
    ),
    referencias: referenciasPreFiltradas.filter(
      (r) => !necesitaRevision(r) || clavesRelevantes.has(`referencia-${r.id}`)
    ),
  };
}

// Arma el bloque de detalle de una coincidencia (contacto, transacción, precio,
// ubicación y datos de superficie/ambientes), compartido entre inmuebles
// propios y referencias externas — solo cambia de dónde sale cada dato.
function formatearDetalleCoincidencia({
  titulo,
  contactoTexto,
  cargadoPorTexto,
  transaccionTexto,
  precioTexto,
  ubicacion,
  dimensiones,
  dormitorios,
  banos,
}) {
  // dimensiones es texto libre (ej: "500 m2", "12x30"), no un número puro, así
  // que se muestra tal cual quedó cargado en vez de agregarle una unidad.
  const ambientesTexto = [
    dimensiones ? `Dimensiones: ${dimensiones}` : null,
    dormitorios ? `${dormitorios} dorm.` : null,
    banos ? `${banos} baños` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const detalle = [
    `Captador: ${contactoTexto}`,
    cargadoPorTexto ? `Cargada por: ${cargadoPorTexto}` : null,
    transaccionTexto ? `Transacción: ${transaccionTexto}` : null,
    `Precio: ${precioTexto}`,
    `Ubicación: ${ubicacion || 'no informada'}`,
    ambientesTexto || null,
  ]
    .filter(Boolean)
    .map((linea) => `   ${linea}`)
    .join('\n');

  return `• ${titulo}\n${detalle}`;
}

// Arma el texto del aviso (web y Telegram usan el mismo formato).
// En Telegram se muestran como máximo estas coincidencias (inmuebles propios
// primero); un requerimiento muy abierto puede traer decenas y llenar el chat.
const MAXIMO_COINCIDENCIAS_MOSTRADAS = 10;

export function formatearResumenCoincidencias(nombreRequerimiento, todosInmuebles, todasReferencias) {
  const total = todosInmuebles.length + todasReferencias.length;
  const inmuebles = todosInmuebles.slice(0, MAXIMO_COINCIDENCIAS_MOSTRADAS);
  const referencias = todasReferencias.slice(0, MAXIMO_COINCIDENCIAS_MOSTRADAS - inmuebles.length);
  const noMostradas = total - inmuebles.length - referencias.length;

  const lineas = [
    total > 0
      ? `🔔 Encontramos ${total} coincidencia(s) para: "${nombreRequerimiento}"`
      : `Requerimiento guardado: "${nombreRequerimiento}". Todavía no hay coincidencias, te avisamos apenas aparezca algo.`,
  ];

  inmuebles.forEach((i) => {
    lineas.push(
      formatearDetalleCoincidencia({
        titulo: `[Propio] ${i.nombre || i.ubicacion || `Inmueble #${i.id}`}`,
        contactoTexto: i.captador?.nombre
          ? `${i.captador.nombre}${i.captador.telefono ? ` (${i.captador.telefono})` : ''}`
          : 'sin asesor asignado',
        transaccionTexto: i.tipo_transaccion?.nombre,
        precioTexto: i.precio_venta != null ? `$us ${i.precio_venta}` : 'no informado',
        ubicacion: i.ubicacion,
        dimensiones: i.dimensiones,
        dormitorios: i.dormitorios,
        banos: i.banos,
      })
    );
  });

  referencias.forEach((r) => lineas.push(formatearDetalleReferencia(r)));

  if (noMostradas > 0) {
    lineas.push(
      `…y ${noMostradas} coincidencia(s) más. Para ver la lista completa, abrí este requerimiento en la web ` +
        '(sección Requerimientos) y tocá Guardar.'
    );
  }

  return lineas.join('\n');
}

function nombreConTelefono(nombre, telefono) {
  if (nombre && telefono) return `${nombre} (${telefono})`;
  return nombre || telefono || null;
}

// Detalle de una referencia externa. El captador es quien publicó el anuncio
// (nombre/teléfono extraídos del mensaje de WhatsApp); "Cargada por" es el
// asesor de InmoRed que la reenvió al bot, útil cuando el anuncio no traía
// contacto. r.cargado_por viene del join con usuarios (puede faltar).
export function formatearDetalleReferencia(r) {
  return formatearDetalleCoincidencia({
    titulo: `[Referencia] ${r.ubicacion || r.descripcion?.slice(0, 60) || 'Sin ubicación'}`,
    contactoTexto: nombreConTelefono(r.contacto_nombre, r.contacto_telefono) || 'no informado en el anuncio',
    cargadoPorTexto: nombreConTelefono(r.cargado_por?.nombre, r.cargado_por?.telefono),
    transaccionTexto: r.tipo_transaccion?.nombre,
    precioTexto: r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'no informado',
    ubicacion: r.ubicacion,
    dimensiones: r.dimensiones,
    dormitorios: r.dormitorios,
    // Las referencias externas no tienen columna de baños todavía (dato
    // que no se extrae de los mensajes de WhatsApp/Telegram).
    banos: null,
  });
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

  // Un requerimiento necesita revisión de ubicación si tiene ubicación
  // específica, o si pide zonas y esta referencia no tiene zona asignada
  // (ej: "avenida Alemana" no es una zona del catálogo) — en ese caso no se
  // puede comparar por ID y hay que juzgar si la ubicación cae en esas zonas.
  const { data: catalogoZonas } = await client.from('zonas').select('id, nombre');
  const nombrePorZona = new Map((catalogoZonas || []).map((z) => [z.id, z.nombre]));
  const zonasDe = (req) => zonasPorRequerimiento.get(req.id) || [];
  const nombresZonasDe = (req) => zonasDe(req).map((id) => nombrePorZona.get(id)).filter(Boolean);

  const necesitaRevision = (req) => Boolean(req.ubicacion_referencia) || (!zonaId && zonasDe(req).length > 0);

  const conCriterio = preCandidatos.filter(necesitaRevision);
  const sinCriterio = preCandidatos.filter((req) => !necesitaRevision(req));

  let idsConUbicacionOk = new Set(sinCriterio.map((req) => req.id));

  // El criterio cambia por requerimiento, así que se agrupan todos los que
  // necesitan revisión en una sola llamada a la IA, comparándolos contra la
  // ubicación de esta referencia nueva.
  if (conCriterio.length > 0 && ubicacion) {
    try {
      const candidatosConClave = conCriterio.map((req) => ({
        clave: String(req.id),
        ubicacion: describirCriterioUbicacion(
          req.ubicacion_referencia ? [] : nombresZonasDe(req),
          req.ubicacion_referencia
        ),
      }));
      const clavesRelevantes = await idsRelevantesPorUbicacionIA(ubicacion, candidatosConClave);
      conCriterio.forEach((req) => {
        if (clavesRelevantes.has(String(req.id))) idsConUbicacionOk.add(req.id);
      });
    } catch (err) {
      console.error('Error evaluando relevancia de ubicación con IA, usando respaldo por texto:', err);
      conCriterio.forEach((req) => {
        if (coincideConAlgunCriterio(ubicacion, nombresZonasDe(req), req.ubicacion_referencia)) {
          idsConUbicacionOk.add(req.id);
        }
      });
    }
  }
  // Si hay requerimientos que necesitan revisión pero la referencia nueva no
  // tiene ubicación identificada, quedan sin marcar como coincidencia — no se
  // puede afirmar que esté en la zona/ubicación pedida sin ese dato.

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
