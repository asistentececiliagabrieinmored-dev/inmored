// Lógica de cruce entre requerimientos (lo que buscan los clientes) e
// inventario disponible: primero inmuebles propios de InmoRed, después
// referencias externas que llegan por el bot de Telegram.
//
// Primero se filtra por base de datos (tipo, transacción, zona, presupuesto,
// dormitorios). Muchas referencias externas llegan con tipo, transacción o
// zona sin resolver (null): esas no se descartan de entrada, pero tampoco se
// aceptan a ciegas — Claude Haiku revisa cada par requerimiento/candidato
// contra TODOS los criterios pedidos, deduciendo lo que falta desde la
// descripción. También revisa la ubicación específica cuando el requerimiento
// la tiene (ej: "avenida Beni"). Solo se llama a la IA sobre los candidatos
// que lo necesitan, así el costo es proporcional a los casos dudosos. Si la
// llamada falla, se usa como respaldo una comparación de texto simple (sin
// acentos, sin abreviaturas) para no dejar el matching sin funcionar.

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

function textoIncluye(texto, buscado) {
  if (!buscado) return true;
  if (!texto) return false;
  return normalizarTexto(texto).includes(normalizarTexto(buscado));
}

// Catálogos id → nombre, para describir candidatos y requerimientos en texto
// (a la IA y en los avisos) sin depender de joins en cada consulta.
async function cargarCatalogos(client) {
  const [{ data: tipos }, { data: transacciones }, { data: zonas }] = await Promise.all([
    client.from('tipos_inmueble').select('id, nombre'),
    client.from('tipos_transaccion').select('id, nombre'),
    client.from('zonas').select('id, nombre'),
  ]);
  const aMapa = (filas) => new Map((filas || []).map((f) => [f.id, f.nombre]));
  return { tipos: aMapa(tipos), transacciones: aMapa(transacciones), zonas: aMapa(zonas) };
}

// Lo que pide un requerimiento, solo con los criterios que tiene cargados.
function describirRequerimiento({ tipoNombre, transaccionNombre, nombresZonas, ubicacionReferencia }) {
  const partes = [
    tipoNombre ? `tipo de inmueble: ${tipoNombre}` : null,
    transaccionNombre ? `transacción: ${transaccionNombre}` : null,
    nombresZonas && nombresZonas.length > 0 ? `zona(s): ${nombresZonas.join(', ')}` : null,
    ubicacionReferencia ? `ubicación: ${ubicacionReferencia}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join('; ') : 'sin criterios específicos';
}

function describirCandidato({ tipoNombre, transaccionNombre, zonaNombre, ubicacion, descripcion }) {
  return [
    `tipo: ${tipoNombre || 'sin dato'}`,
    `transacción: ${transaccionNombre || 'sin dato'}`,
    `zona: ${zonaNombre || 'sin dato'}`,
    `ubicación: ${ubicacion || 'sin dato'}`,
    descripcion ? `descripción: ${descripcion.slice(0, 250)}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}

const ESQUEMA_CLAVES_COINCIDENTES = {
  type: 'object',
  properties: {
    clavesCoincidentes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Claves (tal cual aparecen entre corchetes) de los pares que sí son coincidencia.',
    },
  },
  required: ['clavesCoincidentes'],
  additionalProperties: false,
};

// Cuántos pares se mandan por llamada: con listas largas la respuesta podía
// cortarse y el JSON quedaba inválido. Los lotes corren en paralelo.
const TAMANO_LOTE_IA = 25;

async function evaluarLoteIA(pares) {
  const lista = pares
    .map((p) => `[${p.clave}]\n  El cliente busca: ${p.requerimiento}\n  Inmueble: ${p.candidato}`)
    .join('\n\n');

  const respuesta = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system:
      'Evaluás si inmuebles disponibles en Santa Cruz de la Sierra, Bolivia, corresponden a lo que busca un ' +
      'cliente. En cada par, compará TODOS los criterios que el cliente indicó (tipo de inmueble, transacción, ' +
      'zonas, ubicación); los que no indicó no importan.\n' +
      '- Tipo de inmueble y transacción deben coincidir. Si el inmueble dice "sin dato", deducilo de la ' +
      'descripción; si no se puede deducir o la contradice, NO es coincidencia. Aceptá equivalencias razonables ' +
      '(ej: "depto" = departamento; un terreno con galpón construido sirve a quien busca galpón).\n' +
      '- Zona y ubicación: el inmueble debe estar dentro o pegado a las zonas o la ubicación pedidas. Usá tu ' +
      'conocimiento de la ciudad (zonas, anillos, avenidas, barrios): por ejemplo, la avenida Alemana está en la ' +
      'zona norte, así que no coincide con Zona Sur. Considerá abreviaturas (Av./Avenida, C//Calle), errores de ' +
      'tipeo y acentos. Si el inmueble no tiene zona ni ubicación y la descripción no permite deducirla, NO es ' +
      'coincidencia.\n' +
      '- Sé estricto: ante la duda, excluí.',
    messages: [
      {
        role: 'user',
        content: `${lista}\n\nDevolvé las claves de los pares donde el inmueble sí corresponde a lo que busca el cliente.`,
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: ESQUEMA_CLAVES_COINCIDENTES },
    },
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === 'text');
  if (!bloqueTexto) throw new Error('Claude no devolvió una respuesta de texto.');
  return JSON.parse(bloqueTexto.text).clavesCoincidentes;
}

// pares: [{ clave, requerimiento, candidato, respaldo }]. Devuelve el set de
// claves aceptadas. Si la IA falla en un lote, ese lote usa la función
// `respaldo` de cada par (comparación de texto).
async function evaluarParesIA(pares) {
  const lotes = [];
  for (let i = 0; i < pares.length; i += TAMANO_LOTE_IA) lotes.push(pares.slice(i, i + TAMANO_LOTE_IA));

  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      try {
        return await evaluarLoteIA(lote);
      } catch (err) {
        console.error('Error evaluando coincidencias con IA, usando respaldo por texto:', err);
        return lote.filter((p) => p.respaldo()).map((p) => p.clave);
      }
    })
  );
  return new Set(resultados.flat());
}

// Respaldo por texto cuando falla la IA: cada criterio pedido que el
// candidato no tiene resuelto por ID tiene que aparecer en su texto.
function cumpleCriteriosPorTexto(textoCandidato, { tipoNombre, transaccionNombre, nombresZonas, ubicacionReferencia }) {
  if (tipoNombre && !textoIncluye(textoCandidato, tipoNombre)) return false;
  if (transaccionNombre && !textoIncluye(textoCandidato, transaccionNombre)) return false;
  if (nombresZonas && nombresZonas.length > 0 && !nombresZonas.some((z) => textoIncluye(textoCandidato, z))) {
    return false;
  }
  if (ubicacionReferencia && !textoIncluye(textoCandidato, ubicacionReferencia)) return false;
  return true;
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

  const hayZonas = Boolean(zonaIds && zonaIds.length > 0);

  let queryInmuebles = client
    .from('inmuebles')
    .select(
      'id, nombre, ubicacion, precio_venta, dormitorios, banos, dimensiones, zona_id, tipo_inmueble_id, ' +
        'tipo_transaccion_id, captador:usuarios(nombre, telefono)'
    )
    .in('estado', ['disponible', 'en_proceso']);

  // Un candidato con tipo/transacción/zona sin resolver (null) no se descarta
  // acá: queda para que lo revise la IA más abajo.
  if (tipoInmuebleId) queryInmuebles = queryInmuebles.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  if (tipoTransaccionId) {
    queryInmuebles = queryInmuebles.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);
  }
  if (hayZonas) queryInmuebles = queryInmuebles.or(`zona_id.in.(${zonaIds.join(',')}),zona_id.is.null`);
  if (presupuestoMin) queryInmuebles = queryInmuebles.gte('precio_venta', presupuestoMin);
  if (presupuestoMax) queryInmuebles = queryInmuebles.lte('precio_venta', presupuestoMax);
  if (dormitoriosMin) queryInmuebles = queryInmuebles.gte('dormitorios', dormitoriosMin);

  let queryReferencias = client
    .from('referencias_externas')
    .select(
      'id, ubicacion, precio, moneda, dimensiones, dormitorios, contacto_nombre, contacto_telefono, ' +
        'descripcion, zona_id, tipo_inmueble_id, tipo_transaccion_id, cargado_por:usuarios(nombre, telefono)'
    )
    .eq('activa', true)
    .gt('fecha_expiracion', new Date().toISOString());

  if (tipoInmuebleId) {
    queryReferencias = queryReferencias.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  }
  if (tipoTransaccionId) {
    queryReferencias = queryReferencias.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);
  }
  if (hayZonas) {
    queryReferencias = queryReferencias.or(`zona_id.in.(${zonaIds.join(',')}),zona_id.is.null`);
  }
  if (dormitoriosMin) queryReferencias = queryReferencias.gte('dormitorios', dormitoriosMin);

  const [{ data: inmueblesDb }, { data: referenciasDb }, catalogos] = await Promise.all([
    queryInmuebles,
    queryReferencias,
    cargarCatalogos(client),
  ]);

  // El precio de la referencia solo se compara contra el presupuesto cuando
  // está en dólares. No convertimos automáticamente bolivianos a dólares, así
  // que esas referencias quedan igual en la lista para que el asesor decida.
  const referenciasPorPrecio = (referenciasDb || []).filter((r) => {
    if (r.moneda !== 'usd' || !r.precio) return true;
    if (presupuestoMin && r.precio < presupuestoMin) return false;
    if (presupuestoMax && r.precio > presupuestoMax) return false;
    return true;
  });

  // Se agregan los nombres de tipo/transacción/zona para la IA y los avisos.
  const conNombres = (c) => ({
    ...c,
    tipo_inmueble_nombre: catalogos.tipos.get(c.tipo_inmueble_id) || null,
    tipo_transaccion_nombre: catalogos.transacciones.get(c.tipo_transaccion_id) || null,
    zona_nombre: catalogos.zonas.get(c.zona_id) || null,
  });
  const inmuebles = (inmueblesDb || []).map(conNombres);
  const referencias = referenciasPorPrecio.map(conNombres);

  const pedido = {
    tipoNombre: catalogos.tipos.get(tipoInmuebleId) || null,
    transaccionNombre: catalogos.transacciones.get(tipoTransaccionId) || null,
    nombresZonas: (zonaIds || []).map((id) => catalogos.zonas.get(id)).filter(Boolean),
    ubicacionReferencia: ubicacionReferencia || null,
  };
  const textoPedido = describirRequerimiento(pedido);

  // Necesita revisión si hay ubicación específica, o si algún criterio pedido
  // no se pudo comparar por ID porque el candidato lo tiene sin resolver.
  const necesitaRevision = (c) =>
    Boolean(ubicacionReferencia) ||
    (tipoInmuebleId && !c.tipo_inmueble_id) ||
    (tipoTransaccionId && !c.tipo_transaccion_id) ||
    (hayZonas && !c.zona_id);

  const armarPar = (clave, c, descripcion) => ({
    clave,
    requerimiento: textoPedido,
    candidato: describirCandidato({
      tipoNombre: c.tipo_inmueble_nombre,
      transaccionNombre: c.tipo_transaccion_nombre,
      zonaNombre: c.zona_nombre,
      ubicacion: c.ubicacion,
      descripcion,
    }),
    // En el respaldo solo se exige por texto lo que no está resuelto por ID.
    respaldo: () =>
      cumpleCriteriosPorTexto([c.ubicacion, c.zona_nombre, descripcion].filter(Boolean).join(' '), {
        tipoNombre: c.tipo_inmueble_id ? null : pedido.tipoNombre,
        transaccionNombre: c.tipo_transaccion_id ? null : pedido.transaccionNombre,
        nombresZonas: c.zona_id ? [] : pedido.nombresZonas,
        ubicacionReferencia: pedido.ubicacionReferencia,
      }),
  });

  const pares = [
    ...inmuebles.filter(necesitaRevision).map((i) => armarPar(`inmueble-${i.id}`, i, i.nombre)),
    ...referencias.filter(necesitaRevision).map((r) => armarPar(`referencia-${r.id}`, r, r.descripcion)),
  ];

  const clavesAceptadas = pares.length > 0 ? await evaluarParesIA(pares) : new Set();

  return {
    inmuebles: inmuebles.filter((i) => !necesitaRevision(i) || clavesAceptadas.has(`inmueble-${i.id}`)),
    referencias: referencias.filter((r) => !necesitaRevision(r) || clavesAceptadas.has(`referencia-${r.id}`)),
  };
}

// Arma el bloque de detalle de una coincidencia (tipo, contacto, precio,
// zona/ubicación y datos de superficie/ambientes), compartido entre inmuebles
// propios y referencias externas — solo cambia de dónde sale cada dato.
function formatearDetalleCoincidencia({
  titulo,
  tipoTexto,
  transaccionTexto,
  contactoTexto,
  cargadoPorTexto,
  precioTexto,
  zonaTexto,
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
    `Tipo: ${tipoTexto || 'sin identificar'} — ${transaccionTexto || 'transacción sin identificar'}`,
    `Zona: ${zonaTexto || 'sin identificar'}`,
    `Ubicación: ${ubicacion || 'no informada'}`,
    `Precio: ${precioTexto}`,
    ambientesTexto || null,
    `Captador: ${contactoTexto}`,
    cargadoPorTexto ? `Cargada por: ${cargadoPorTexto}` : null,
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
        tipoTexto: i.tipo_inmueble_nombre,
        transaccionTexto: i.tipo_transaccion_nombre,
        contactoTexto: nombreConTelefono(i.captador?.nombre, i.captador?.telefono) || 'sin asesor asignado',
        precioTexto: i.precio_venta != null ? `$us ${i.precio_venta}` : 'no informado',
        zonaTexto: i.zona_nombre,
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
    tipoTexto: r.tipo_inmueble_nombre,
    transaccionTexto: r.tipo_transaccion_nombre,
    contactoTexto: nombreConTelefono(r.contacto_nombre, r.contacto_telefono) || 'no informado en el anuncio',
    cargadoPorTexto: nombreConTelefono(r.cargado_por?.nombre, r.cargado_por?.telefono),
    precioTexto: r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'no informado',
    zonaTexto: r.zona_nombre,
    ubicacion: r.ubicacion,
    dimensiones: r.dimensiones,
    dormitorios: r.dormitorios,
    // Las referencias externas no tienen columna de baños todavía (dato
    // que no se extrae de los mensajes de WhatsApp/Telegram).
    banos: null,
  });
}

export async function buscarRequerimientosCoincidentes(client, criterios) {
  const { tipoInmuebleId, tipoTransaccionId, zonaId, ubicacion, descripcion, precio, moneda, dormitorios } =
    criterios;

  let query = client
    .from('requerimientos')
    .select(
      'id, asesor_id, nombre_requerimiento, tipo_inmueble_id, tipo_transaccion_id, ubicacion_referencia, ' +
        'presupuesto_min, presupuesto_max, dormitorios_min'
    )
    .eq('estado', 'activo');

  // Un requerimiento con tipo_inmueble_id/tipo_transaccion_id en null acepta
  // cualquier tipo (así lo define el formulario), así que no se descarta.
  if (tipoInmuebleId) query = query.or(`tipo_inmueble_id.eq.${tipoInmuebleId},tipo_inmueble_id.is.null`);
  if (tipoTransaccionId) query = query.or(`tipo_transaccion_id.eq.${tipoTransaccionId},tipo_transaccion_id.is.null`);

  const [{ data: candidatos }, { data: todasZonas }, catalogos] = await Promise.all([
    query,
    client.from('requerimiento_zonas').select('requerimiento_id, zona_id'),
    cargarCatalogos(client),
  ]);
  if (!candidatos || candidatos.length === 0) return [];

  const zonasPorRequerimiento = new Map();
  (todasZonas || []).forEach((fila) => {
    if (!zonasPorRequerimiento.has(fila.requerimiento_id)) zonasPorRequerimiento.set(fila.requerimiento_id, []);
    zonasPorRequerimiento.get(fila.requerimiento_id).push(fila.zona_id);
  });
  const zonasDe = (req) => zonasPorRequerimiento.get(req.id) || [];

  const preCandidatos = candidatos.filter((req) => {
    if (moneda === 'usd' && precio) {
      if (req.presupuesto_min && precio < req.presupuesto_min) return false;
      if (req.presupuesto_max && precio > req.presupuesto_max) return false;
    }
    if (req.dormitorios_min && dormitorios && dormitorios < req.dormitorios_min) return false;
    // Si la referencia nueva no tiene zona identificada (zonaId null), no se
    // descarta por zona — queda para la revisión de la IA.
    const zonasAceptadas = zonasDe(req);
    return zonasAceptadas.length === 0 || !zonaId || zonasAceptadas.includes(zonaId);
  });

  // Necesita revisión si el requerimiento tiene ubicación específica, o si
  // pide algo (tipo/transacción/zona) que esta referencia no tiene resuelto.
  const necesitaRevision = (req) =>
    Boolean(req.ubicacion_referencia) ||
    (req.tipo_inmueble_id && !tipoInmuebleId) ||
    (req.tipo_transaccion_id && !tipoTransaccionId) ||
    (zonasDe(req).length > 0 && !zonaId);

  const textoReferencia = [ubicacion, catalogos.zonas.get(zonaId), descripcion].filter(Boolean).join(' ');
  const candidatoTexto = describirCandidato({
    tipoNombre: catalogos.tipos.get(tipoInmuebleId),
    transaccionNombre: catalogos.transacciones.get(tipoTransaccionId),
    zonaNombre: catalogos.zonas.get(zonaId),
    ubicacion,
    descripcion,
  });

  const pares = preCandidatos.filter(necesitaRevision).map((req) => {
    const pedido = {
      tipoNombre: catalogos.tipos.get(req.tipo_inmueble_id) || null,
      transaccionNombre: catalogos.transacciones.get(req.tipo_transaccion_id) || null,
      nombresZonas: zonasDe(req).map((id) => catalogos.zonas.get(id)).filter(Boolean),
      ubicacionReferencia: req.ubicacion_referencia || null,
    };
    return {
      clave: String(req.id),
      requerimiento: describirRequerimiento(pedido),
      candidato: candidatoTexto,
      respaldo: () =>
        cumpleCriteriosPorTexto(textoReferencia, {
          tipoNombre: tipoInmuebleId ? null : pedido.tipoNombre,
          transaccionNombre: tipoTransaccionId ? null : pedido.transaccionNombre,
          nombresZonas: zonaId ? [] : pedido.nombresZonas,
          ubicacionReferencia: pedido.ubicacionReferencia,
        }),
    };
  });

  const clavesAceptadas = pares.length > 0 ? await evaluarParesIA(pares) : new Set();

  return preCandidatos.filter((req) => !necesitaRevision(req) || clavesAceptadas.has(String(req.id)));
}
