// Lógica de cruce entre requerimientos (lo que buscan los clientes) e
// inventario disponible: primero inmuebles propios de InmoRed, después
// referencias externas que llegan por el bot de Telegram.

const CODIGO_INICIO_MARCAS = 0x0300;
const CODIGO_FIN_MARCAS = 0x036f;

function normalizarTexto(texto) {
  const sinAcentos = Array.from(texto.normalize('NFD'))
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0);
      return codigo < CODIGO_INICIO_MARCAS || codigo > CODIGO_FIN_MARCAS;
    })
    .join('');
  return sinAcentos.toLowerCase().trim();
}

function ubicacionCoincide(ubicacionCandidato, textoBuscado) {
  if (!textoBuscado) return true;
  if (!ubicacionCandidato) return false;
  return normalizarTexto(ubicacionCandidato).includes(normalizarTexto(textoBuscado));
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

  if (tipoInmuebleId) queryInmuebles = queryInmuebles.eq('tipo_inmueble_id', tipoInmuebleId);
  if (tipoTransaccionId) queryInmuebles = queryInmuebles.eq('tipo_transaccion_id', tipoTransaccionId);
  if (zonaIds && zonaIds.length > 0) queryInmuebles = queryInmuebles.in('zona_id', zonaIds);
  if (presupuestoMin) queryInmuebles = queryInmuebles.gte('precio_venta', presupuestoMin);
  if (presupuestoMax) queryInmuebles = queryInmuebles.lte('precio_venta', presupuestoMax);
  if (dormitoriosMin) queryInmuebles = queryInmuebles.gte('dormitorios', dormitoriosMin);

  const { data: inmueblesSinFiltrarUbicacion } = await queryInmuebles;
  const inmuebles = (inmueblesSinFiltrarUbicacion || []).filter((i) =>
    ubicacionCoincide(i.ubicacion, ubicacionReferencia)
  );

  let queryReferencias = client
    .from('referencias_externas')
    .select('id, ubicacion, precio, moneda, dimensiones, dormitorios, contacto_nombre, contacto_telefono, descripcion, zona_id')
    .eq('activa', true)
    .gt('fecha_expiracion', new Date().toISOString());

  if (tipoInmuebleId) queryReferencias = queryReferencias.eq('tipo_inmueble_id', tipoInmuebleId);
  if (tipoTransaccionId) queryReferencias = queryReferencias.eq('tipo_transaccion_id', tipoTransaccionId);
  if (zonaIds && zonaIds.length > 0) queryReferencias = queryReferencias.in('zona_id', zonaIds);
  if (dormitoriosMin) queryReferencias = queryReferencias.gte('dormitorios', dormitoriosMin);

  const { data: referenciasSinFiltrar } = await queryReferencias;

  // El precio de la referencia solo se compara contra el presupuesto cuando
  // está en dólares. No convertimos automáticamente bolivianos a dólares, así
  // que esas referencias quedan igual en la lista para que el asesor decida.
  const referencias = (referenciasSinFiltrar || []).filter((r) => {
    if (!ubicacionCoincide(r.ubicacion, ubicacionReferencia)) return false;
    if (r.moneda !== 'usd' || !r.precio) return true;
    if (presupuestoMin && r.precio < presupuestoMin) return false;
    if (presupuestoMax && r.precio > presupuestoMax) return false;
    return true;
  });

  return { inmuebles, referencias };
}

export async function buscarRequerimientosCoincidentes(client, criterios) {
  const { tipoInmuebleId, tipoTransaccionId, zonaId, ubicacion, precio, moneda, dormitorios } = criterios;

  let query = client
    .from('requerimientos')
    .select('id, asesor_id, cliente_nombre, ubicacion_referencia, presupuesto_min, presupuesto_max, dormitorios_min')
    .eq('estado', 'activo');

  if (tipoInmuebleId) query = query.eq('tipo_inmueble_id', tipoInmuebleId);
  if (tipoTransaccionId) query = query.eq('tipo_transaccion_id', tipoTransaccionId);

  const { data: candidatos } = await query;
  if (!candidatos || candidatos.length === 0) return [];

  const { data: todasZonas } = await client.from('requerimiento_zonas').select('requerimiento_id, zona_id');
  const zonasPorRequerimiento = new Map();
  (todasZonas || []).forEach((fila) => {
    if (!zonasPorRequerimiento.has(fila.requerimiento_id)) zonasPorRequerimiento.set(fila.requerimiento_id, []);
    zonasPorRequerimiento.get(fila.requerimiento_id).push(fila.zona_id);
  });

  return candidatos.filter((req) => {
    const zonasAceptadas = zonasPorRequerimiento.get(req.id) || [];
    if (zonasAceptadas.length > 0 && (!zonaId || !zonasAceptadas.includes(zonaId))) return false;
    if (!ubicacionCoincide(ubicacion, req.ubicacion_referencia)) return false;
    if (moneda === 'usd' && precio) {
      if (req.presupuesto_min && precio < req.presupuesto_min) return false;
      if (req.presupuesto_max && precio > req.presupuesto_max) return false;
    }
    if (req.dormitorios_min && dormitorios && dormitorios < req.dormitorios_min) return false;
    return true;
  });
}
