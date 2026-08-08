import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

export default function NuevoRequerimiento() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion, usuario } = useUsuarioActual();

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);

  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState([]);
  const [presupuestoMin, setPresupuestoMin] = useState('');
  const [presupuestoMax, setPresupuestoMax] = useState('');
  const [dormitoriosMin, setDormitoriosMin] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarCatalogos();
  }, [cargandoUsuario, sesion]);

  async function cargarCatalogos() {
    const [{ data: tiposInm }, { data: tiposTrans }, { data: zonasData }] = await Promise.all([
      supabase.from('tipos_inmueble').select('id, nombre').order('id'),
      supabase.from('tipos_transaccion').select('id, nombre').order('id'),
      supabase.from('zonas').select('id, nombre').order('nombre'),
    ]);
    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);
  }

  function toggleZona(id) {
    setZonasSeleccionadas((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!clienteNombre.trim()) {
      setError('Ingresá el nombre del cliente.');
      return;
    }

    setEnviando(true);
    setResultado(null);
    try {
      const { data: requerimiento, error: errorInsert } = await supabase
        .from('requerimientos')
        .insert({
          asesor_id: usuario.id,
          cliente_nombre: clienteNombre,
          cliente_telefono: clienteTelefono || null,
          tipo_inmueble_id: tipoInmuebleId || null,
          tipo_transaccion_id: tipoTransaccionId || null,
          presupuesto_min: presupuestoMin || null,
          presupuesto_max: presupuestoMax || null,
          dormitorios_min: dormitoriosMin || null,
          descripcion: descripcion || null,
        })
        .select()
        .single();

      if (errorInsert) throw errorInsert;

      if (zonasSeleccionadas.length > 0) {
        const { error: errorZonas } = await supabase
          .from('requerimiento_zonas')
          .insert(zonasSeleccionadas.map((zonaId) => ({ requerimiento_id: requerimiento.id, zona_id: zonaId })));
        if (errorZonas) throw errorZonas;
      }

      const respuesta = await fetch('/api/requerimientos/notificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requerimientoId: requerimiento.id }),
      });
      const datos = await respuesta.json();
      setResultado(datos);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el requerimiento.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoUsuario) {
    return (
      <div className="container">
        <p>Cargando...</p>
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
        <h2>Nuevo requerimiento</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Cargá lo que está buscando un cliente puntual. Si aparece un inmueble propio o una
          referencia externa que coincida, te avisamos automáticamente por Telegram (si tenés el
          bot activado).
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}

          <div className="card">
            <div className="form-section">
              <h3>Cliente</h3>
              <label>Nombre</label>
              <input type="text" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} required />
              <label>Teléfono</label>
              <input type="text" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} />
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

          <button type="submit" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar requerimiento'}
          </button>
        </form>

        {resultado && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ color: '#06416A', marginTop: 0 }}>
              {resultado.inmuebles.length + resultado.referencias.length > 0
                ? `Encontramos ${resultado.inmuebles.length + resultado.referencias.length} coincidencia(s) ahora mismo`
                : 'No hay coincidencias todavía'}
            </h3>
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
            <p className="solo-lectura-nota" style={{ marginTop: 12 }}>
              De ahora en más, cualquier referencia nueva que coincida con este requerimiento te va
              a llegar automáticamente por Telegram (si tenés el bot activado).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
