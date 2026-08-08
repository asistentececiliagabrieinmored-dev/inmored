import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

export default function EditarRequerimiento() {
  const router = useRouter();
  const { id } = router.query;
  const { cargando: cargandoUsuario, sesion } = useUsuarioActual();

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);

  const [nombreRequerimiento, setNombreRequerimiento] = useState('');
  const [estado, setEstado] = useState('activo');
  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState([]);
  const [ubicacionReferencia, setUbicacionReferencia] = useState('');
  const [presupuestoMin, setPresupuestoMin] = useState('');
  const [presupuestoMax, setPresupuestoMax] = useState('');
  const [dormitoriosMin, setDormitoriosMin] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!id || cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarTodo();
  }, [id, cargandoUsuario, sesion]);

  async function cargarTodo() {
    setCargando(true);

    const [{ data: tiposInm }, { data: tiposTrans }, { data: zonasData }, { data: req }, { data: zonasFilas }] =
      await Promise.all([
        supabase.from('tipos_inmueble').select('id, nombre').order('id'),
        supabase.from('tipos_transaccion').select('id, nombre').order('id'),
        supabase.from('zonas').select('id, nombre').order('nombre'),
        supabase.from('requerimientos').select('*').eq('id', id).maybeSingle(),
        supabase.from('requerimiento_zonas').select('zona_id').eq('requerimiento_id', id),
      ]);

    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);

    if (req) {
      setNombreRequerimiento(req.nombre_requerimiento || '');
      setEstado(req.estado || 'activo');
      setTipoInmuebleId(req.tipo_inmueble_id || '');
      setTipoTransaccionId(req.tipo_transaccion_id || '');
      setUbicacionReferencia(req.ubicacion_referencia || '');
      setPresupuestoMin(req.presupuesto_min || '');
      setPresupuestoMax(req.presupuesto_max || '');
      setDormitoriosMin(req.dormitorios_min || '');
      setDescripcion(req.descripcion || '');
    }
    setZonasSeleccionadas((zonasFilas || []).map((z) => z.zona_id));

    setCargando(false);
  }

  function toggleZona(zonaId) {
    setZonasSeleccionadas((prev) => (prev.includes(zonaId) ? prev.filter((z) => z !== zonaId) : [...prev, zonaId]));
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setError('');

    if (!nombreRequerimiento.trim()) {
      setError('Ingresá un nombre para el requerimiento.');
      return;
    }

    setGuardando(true);
    setResultado(null);
    try {
      const { error: errorUpdate } = await supabase
        .from('requerimientos')
        .update({
          nombre_requerimiento: nombreRequerimiento,
          estado,
          tipo_inmueble_id: tipoInmuebleId || null,
          tipo_transaccion_id: tipoTransaccionId || null,
          ubicacion_referencia: ubicacionReferencia || null,
          presupuesto_min: presupuestoMin || null,
          presupuesto_max: presupuestoMax || null,
          dormitorios_min: dormitoriosMin || null,
          descripcion: descripcion || null,
        })
        .eq('id', id);

      if (errorUpdate) throw errorUpdate;

      const { error: errorBorrarZonas } = await supabase
        .from('requerimiento_zonas')
        .delete()
        .eq('requerimiento_id', id);
      if (errorBorrarZonas) throw errorBorrarZonas;

      if (zonasSeleccionadas.length > 0) {
        const { error: errorZonas } = await supabase
          .from('requerimiento_zonas')
          .insert(zonasSeleccionadas.map((zonaId) => ({ requerimiento_id: id, zona_id: zonaId })));
        if (errorZonas) throw errorZonas;
      }

      const respuesta = await fetch('/api/requerimientos/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requerimientoId: Number(id) }),
      });
      const datos = await respuesta.json();
      setResultado(datos);
      setExito(true);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargandoUsuario || cargando) {
    return (
      <div className="container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (exito) {
    const totalCoincidencias = (resultado?.inmuebles.length || 0) + (resultado?.referencias.length || 0);

    return (
      <div>
        <div className="top-bar">
          <h1>INMORED</h1>
        </div>
        <div className="container">
          <div className="success-box">
            <h2>Requerimiento actualizado</h2>
            <p>
              {totalCoincidencias > 0
                ? `Encontramos ${totalCoincidencias} coincidencia(s) con los datos actuales.`
                : 'No hay coincidencias con los datos actuales, pero te vamos a avisar apenas aparezca algo.'}
            </p>
          </div>

          {totalCoincidencias > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              {resultado.inmuebles.map((i) => (
                <p key={`i-${i.id}`} style={{ margin: '8px 0' }}>
                  🏠 <b>Propio:</b> {i.nombre || i.ubicacion || `Inmueble #${i.id}`} — $us {i.precio_venta ?? '—'}
                  <br />
                  <span style={{ fontSize: 13, color: '#555' }}>
                    Asesor: {i.captador?.nombre || '—'}
                    {i.captador?.telefono ? ` · ${i.captador.telefono}` : ''}
                  </span>
                </p>
              ))}
              {resultado.referencias.map((r) => (
                <p key={`r-${r.id}`} style={{ margin: '8px 0' }}>
                  📲 <b>Referencia:</b> {r.ubicacion || r.descripcion?.slice(0, 60) || 'Sin ubicación'} —{' '}
                  {r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'precio no informado'}
                  <br />
                  <span style={{ fontSize: 13, color: '#555' }}>
                    Contacto: {r.contacto_nombre || '—'}
                    {r.contacto_telefono ? ` · ${r.contacto_telefono}` : ''}
                  </span>
                </p>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => setExito(false)} style={{ width: 'auto' }}>
              Seguir editando
            </button>
            <a href="/requerimientos" className="btn-secondary">
              Volver al listado
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <h1>INMORED</h1>
        <a href="/requerimientos" className="logout-link" style={{ color: 'white' }}>
          Volver
        </a>
      </div>

      <div className="container">
        <h2>Editar requerimiento</h2>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleGuardar}>
          <div className="card">
            <div className="form-section">
              <h3>Requerimiento</h3>
              <label>Nombre del requerimiento</label>
              <input
                type="text"
                value={nombreRequerimiento}
                onChange={(e) => setNombreRequerimiento(e.target.value)}
                required
              />

              <label>Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="activo">Activo</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>

            <div className="form-section">
              <h3>Qué está buscando</h3>
              <div className="form-row">
                <div>
                  <label>Tipo de inmueble</label>
                  <select value={tipoInmuebleId} onChange={(e) => setTipoInmuebleId(e.target.value)}>
                    <option value="">Cualquiera</option>
                    {tiposInmueble.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tipo de transacción</label>
                  <select value={tipoTransaccionId} onChange={(e) => setTipoTransaccionId(e.target.value)}>
                    <option value="">Cualquiera</option>
                    {tiposTransaccion.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label>Zonas aceptadas (dejá todas sin marcar si acepta cualquier zona)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {zonas.map((z) => (
                  <label
                    key={z.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 400,
                      border: '1px solid #ccc',
                      borderRadius: 6,
                      padding: '4px 8px',
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 'auto' }}
                      checked={zonasSeleccionadas.includes(z.id)}
                      onChange={() => toggleZona(z.id)}
                    />
                    {z.nombre}
                  </label>
                ))}
              </div>

              <label>Ubicación específica (opcional)</label>
              <input
                type="text"
                value={ubicacionReferencia}
                onChange={(e) => setUbicacionReferencia(e.target.value)}
                placeholder='Ej: "avenida Beni", "9no anillo"'
              />
              <p className="solo-lectura-nota" style={{ marginTop: -8, marginBottom: 12 }}>
                Si lo completás, solo se cruzan inmuebles/referencias cuya ubicación mencione este
                texto (además de las zonas y el presupuesto).
              </p>

              <div className="form-row">
                <div>
                  <label>Presupuesto mínimo ($us)</label>
                  <input type="number" value={presupuestoMin} onChange={(e) => setPresupuestoMin(e.target.value)} />
                </div>
                <div>
                  <label>Presupuesto máximo ($us)</label>
                  <input type="number" value={presupuestoMax} onChange={(e) => setPresupuestoMax(e.target.value)} />
                </div>
              </div>

              <label>Dormitorios mínimos</label>
              <input type="number" min="0" value={dormitoriosMin} onChange={(e) => setDormitoriosMin(e.target.value)} />

              <label>Otros detalles</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Criterios adicionales..."
              />
            </div>
          </div>

          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios y revalidar coincidencias'}
          </button>
        </form>
      </div>
    </div>
  );
}
