// Lógica de cruce entre requerimientos (lo que buscan los clientes) e
// inventario disponible: primero inmuebles propios de InmoRed, después
// referencias externas que llegan por el bot de Telegram.

export async function buscarCoincidenciasParaRequerimiento(client, criterios) {
  const { tipoInmuebleId, tipoTransaccionId, zonaIds, presupuestoMin, presupuestoMax, dormitoriosMin } = criterios;

  let queryInmuebles = client
    .from('inmuebles')
    .select('id, nombre, ubicacion, precio_venta, dormitorios, zona_id')
    .in('estado', ['disponible', 'en_proceso']);

  if (tipoInmuebleId) queryInmuebles = queryInmuebles.eq('tipo_inmueble_id', tipoInmuebleId);
  if (tipoTransaccionId) queryInmuebles = queryInmuebles.eq('tipo_transaccion_id', tipoTransaccionId);
  if (zonaIds && zonaIds.length > 0) queryInmuebles = queryInmuebles.in('zona_id', zonaIds);
  if (presupuestoMin) queryInmuebles = queryInmuebles.gte('precio_venta', presupuestoMin);
  if (presupuestoMax) queryInmuebles = queryInmuebles.lte('precio_venta', presupuestoMax);
  if (dormitoriosMin) queryInmuebles = queryInmuebles.gte('dormitorios', dormitoriosMin);

  const { data: inmuebles } = await queryInmuebles;

  let queryReferencias = client
    .from('referencias_externas')
    .select('id, ubicacion, precio, moneda, dimensiones, dormitorios, contacto_nombre, contacto_telefono, descripcion, zona_id')
    .eq('activa', true)
    .gt('fecha_expiracion', new Date().toISOString());

  if (tipoInmuebleId) queryReferencias = queryReferencias.eq('tipo_inmueble_id', tipoInmuebleId);
  if (tipoTransaccionId) queryReferencias = queryReferencias.eq('tipo_transaccion_id', tipoTransaccionId);
  if (zonaIds && zonaIds.length > 0) queryReferencias = queryReferencias.in('zona_id', zonaIds);
  if (dormitoriosMin) queryReferencias = queryReferencias.gte('dormitorios', dormitoriosMin);

  const { data: referenciasSinFiltrarPrecio } = await queryReferencias;

  // El precio de la referencia solo se compara contra el presupuesto cuando
  // está en dólares. No convertimos automáticamente bolivianos a dólares, así
  // que esas referencias quedan igual en la lista para que el asesor decida.
  const referencias = (referenciasSinFiltrarPrecio || []).filter((r) => {
    if (r.moneda !== 'usd' || !r.precio) return true;
    if (presupuestoMin && r.precio < presupuestoMin) return false;
    if (presupuestoMax && r.precio > presupuestoMax) return false;
    return true;
  });

  return { inmuebles: inmuebles || [], referencias };
}

export async function buscarRequerimientosCoincidentes(client, criterios) {
  const { tipoInmuebleId, tipoTransaccionId, zonaId, precio, moneda, dormitorios } = criterios;

  let query = client
    .from('requerimientos')
    .select('id, asesor_id, cliente_nombre, presupuesto_min, presupuesto_max, dormitorios_min')
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
    if (moneda === 'usd' && precio) {
      if (req.presupuesto_min && precio < req.presupuesto_min) return false;
      if (req.presupuesto_max && precio > req.presupuesto_max) return false;
    }
    if (req.dormitorios_min && dormitorios && dormitorios < req.dormitorios_min) return false;
    return true;
  });
}
