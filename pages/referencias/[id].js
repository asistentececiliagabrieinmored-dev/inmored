import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

function aInputDate(fechaIso) {
  if (!fechaIso) return '';
  return new Date(fechaIso).toISOString().slice(0, 10);
}

export default function EditarReferencia() {
  const router = useRouter();
  const { id } = router.query;
  const { cargando: cargandoUsuario, sesion } = useUsuarioActual();

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);

  const [origen, setOrigen] = useState('manual_webapp');
  const [textoOriginal, setTextoOriginal] = useState('');
  const [activa, setActiva] = useState(true);
  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [precio, setPrecio] = useState('');
  const [moneda, setMoneda] = useState('usd');
  const [dimensiones, setDimensiones] = useState('');
  const [dormitorios, setDormitorios] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [fechaExpiracion, setFechaExpiracion] = useState('');
  const [contadorContactos, setContadorContactos] = useState(0);

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

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

    const [{ data: tiposInm }, { data: tiposTrans }, { data: zonasData }, { data: ref }] = await Promise.all([
      supabase.from('tipos_inmueble').select('id, nombre').order('id'),
      supabase.from('tipos_transaccion').select('id, nombre').order('id'),
      supabase.from('zonas').select('id, nombre').order('nombre'),
      supabase.from('referencias_externas').select('*').eq('id', id).maybeSingle(),
    ]);

    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);

    if (ref) {
      setOrigen(ref.origen || 'manual_webapp');
      setTextoOriginal(ref.texto_original || '');
      setActiva(ref.activa);
      setTipoInmuebleId(ref.tipo_inmueble_id || '');
      setTipoTransaccionId(ref.tipo_transaccion_id || '');
      setZonaId(ref.zona_id || '');
      setUbicacion(ref.ubicacion || '');
      setPrecio(ref.precio || '');
      setMoneda(ref.moneda || 'usd');
      setDimensiones(ref.dimensiones || '');
      setDormitorios(ref.dormitorios || '');
      setDescripcion(ref.descripcion || '');
      setContactoNombre(ref.contacto_nombre || '');
      setContactoTelefono(ref.contacto_telefono || '');
      setFechaExpiracion(aInputDate(ref.fecha_expiracion));
      setContadorContactos(ref.contador_contactos || 0);
    }

    setCargando(false);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setError('');

    if (!ubicacion.trim() && !descripcion.trim()) {
      setError('Ingresá al menos la ubicación o una descripción, para poder identificar la referencia.');
      return;
    }
    if (!fechaExpiracion) {
      setError('Ingresá una fecha de vencimiento.');
      return;
    }

    setGuardando(true);
    try {
      const { error: errorUpdate } = await supabase
        .from('referencias_externas')
        .update({
          activa,
          tipo_inmueble_id: tipoInmuebleId || null,
          tipo_transaccion_id: tipoTransaccionId || null,
          zona_id: zonaId || null,
          ubicacion: ubicacion || null,
          precio: precio || null,
          moneda: precio ? moneda : null,
          dimensiones: dimensiones || null,
          dormitorios: dormitorios || null,
          descripcion: descripcion || null,
          contacto_nombre: contactoNombre || null,
          contacto_telefono: contactoTelefono || null,
          fecha_expiracion: new Date(`${fechaExpiracion}T23:59:59`).toISOString(),
        })
        .eq('id', id);

      if (errorUpdate) throw errorUpdate;
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
    return (
      <div>
        <div className="top-bar">
          <h1>INMORED</h1>
        </div>
        <div className="container">
          <div className="success-box">
            <h2>Referencia actualizada</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => setExito(false)} style={{ width: 'auto' }}>
              Seguir editando
            </button>
            <a href="/referencias" className="btn-secondary">
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
        <a href="/referencias" className="logout-link" style={{ color: 'white' }}>
          Volver
        </a>
      </div>

      <div className="container">
        <h2>Editar referencia externa</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          {origen === 'telegram_bot' ? 'Cargada por el bot de Telegram' : 'Cargada manualmente desde la web'}
          {contadorContactos ? ` · Consultada ${contadorContactos} vez(es)` : ''}
        </p>

        {textoOriginal && (
          <div className="card" style={{ background: '#f5f5f5' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Mensaje original reenviado al bot</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, whiteSpace: 'pre-wrap' }}>{textoOriginal}</p>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleGuardar}>
          <div className="card">
            <div className="form-section">
              <h3>Estado</h3>
              <label>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 8 }}
                  checked={activa}
                  onChange={(e) => setActiva(e.target.checked)}
                />
                Activa (visible para el matching)
              </label>

              <label>Fecha de vencimiento</label>
              <input type="date" value={fechaExpiracion} onChange={(e) => setFechaExpiracion(e.target.value)} required />
            </div>

            <div className="form-section">
              <h3>El inmueble</h3>
              <div className="form-row">
                <div>
                  <label>Tipo de inmueble</label>
                  <select value={tipoInmuebleId} onChange={(e) => setTipoInmuebleId(e.target.value)}>
                    <option value="">Sin identificar</option>
                    {tiposInmueble.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tipo de transacción</label>
                  <select value={tipoTransaccionId} onChange={(e) => setTipoTransaccionId(e.target.value)}>
                    <option value="">Sin identificar</option>
                    {tiposTransaccion.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label>Zona</label>
              <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                <option value="">Sin identificar</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>

              <label>Ubicación / dirección</label>
              <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />

              <div className="form-row">
                <div>
                  <label>Precio</label>
                  <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} />
                </div>
                <div>
                  <label>Moneda</label>
                  <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                    <option value="usd">Dólares (USD)</option>
                    <option value="bob">Bolivianos (Bs.)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label>Dimensiones</label>
                  <input type="text" value={dimensiones} onChange={(e) => setDimensiones(e.target.value)} />
                </div>
                <div>
                  <label>Dormitorios</label>
                  <input type="number" min="0" value={dormitorios} onChange={(e) => setDormitorios(e.target.value)} />
                </div>
              </div>

              <label>Descripción</label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>

            <div className="form-section">
              <h3>Contacto</h3>
              <div className="form-row">
                <div>
                  <label>Nombre de contacto</label>
                  <input type="text" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
                </div>
                <div>
                  <label>Teléfono de contacto</label>
                  <input type="text" value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <button type="submit" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}
