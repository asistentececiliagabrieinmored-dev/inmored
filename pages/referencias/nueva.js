import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

// Mismos valores por defecto que usa el bot de Telegram si la configuración
// no está cargada en configuracion_sistema (ver pages/api/telegram-webhook.js).
const RETENCION_DIAS_DEFECTO = 30;
const RETENCION_DIAS_VENTA_DEFECTO = 60;
const RETENCION_DIAS_ALQUILER_DEFECTO = 30;

export default function NuevaReferencia() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion, usuario } = useUsuarioActual();

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [configPorClave, setConfigPorClave] = useState({});

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

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  useEffect(() => {
    if (cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarCatalogos();
  }, [cargandoUsuario, sesion]);

  async function cargarCatalogos() {
    const [{ data: tiposInm }, { data: tiposTrans }, { data: zonasData }, { data: configFilas }] = await Promise.all([
      supabase.from('tipos_inmueble').select('id, nombre').order('id'),
      supabase.from('tipos_transaccion').select('id, nombre').order('id'),
      supabase.from('zonas').select('id, nombre').order('nombre'),
      supabase
        .from('configuracion_sistema')
        .select('clave, valor')
        .in('clave', [
          'retencion_dias_referencias_venta',
          'retencion_dias_referencias_alquiler_anticretico',
          'retencion_dias_referencias_externas',
        ]),
    ]);
    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);
    setConfigPorClave(Object.fromEntries((configFilas || []).map((f) => [f.clave, f.valor])));
  }

  function calcularFechaExpiracion() {
    const tipoTransaccionNombre = tiposTransaccion.find((t) => String(t.id) === String(tipoTransaccionId))?.nombre;

    let diasRetencion;
    if (tipoTransaccionNombre === 'venta') {
      diasRetencion = Number(configPorClave.retencion_dias_referencias_venta) || RETENCION_DIAS_VENTA_DEFECTO;
    } else if (tipoTransaccionNombre === 'alquiler' || tipoTransaccionNombre === 'anticrético') {
      diasRetencion =
        Number(configPorClave.retencion_dias_referencias_alquiler_anticretico) || RETENCION_DIAS_ALQUILER_DEFECTO;
    } else {
      diasRetencion = Number(configPorClave.retencion_dias_referencias_externas) || RETENCION_DIAS_DEFECTO;
    }

    return new Date(Date.now() + diasRetencion * 24 * 60 * 60 * 1000);
  }

  function handleNuevoRegistro() {
    setTipoInmuebleId('');
    setTipoTransaccionId('');
    setZonaId('');
    setUbicacion('');
    setPrecio('');
    setMoneda('usd');
    setDimensiones('');
    setDormitorios('');
    setDescripcion('');
    setContactoNombre('');
    setContactoTelefono('');
    setExito(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!ubicacion.trim() && !descripcion.trim()) {
      setError('Ingresá al menos la ubicación o una descripción, para poder identificar la referencia.');
      return;
    }

    setEnviando(true);
    try {
      const { error: errorInsert } = await supabase.from('referencias_externas').insert({
        origen: 'manual_webapp',
        cargado_por_usuario_id: usuario.id,
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
        fecha_expiracion: calcularFechaExpiracion().toISOString(),
      });

      if (errorInsert) throw errorInsert;
      setExito(true);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar la referencia.');
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

  if (exito) {
    return (
      <div>
        <div className="top-bar">
          <h1>INMORED</h1>
        </div>
        <div className="container">
          <div className="success-box">
            <h2>Referencia guardada</h2>
            <p>Ya queda disponible para cruzar contra los requerimientos activos.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={handleNuevoRegistro} style={{ width: 'auto' }}>
              Cargar otra referencia
            </button>
            <a href="/referencias" className="btn-secondary">
              Ver todas las referencias
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
        <h2>Cargar referencia externa</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Un inmueble visto en un grupo de intercambio (WhatsApp/Telegram), no captado directamente
          por InmoRed. Se cruza automáticamente contra los requerimientos activos.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}

          <div className="card">
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
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder='Ej: "Av. Beni, cerca del 4to anillo"'
              />

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
                  <input
                    type="text"
                    value={dimensiones}
                    onChange={(e) => setDimensiones(e.target.value)}
                    placeholder='Ej: "500 m2", "12x30"'
                  />
                </div>
                <div>
                  <label>Dormitorios</label>
                  <input type="number" min="0" value={dormitorios} onChange={(e) => setDormitorios(e.target.value)} />
                </div>
              </div>

              <label>Descripción</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Resumen del anuncio..."
              />
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

          <button type="submit" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar referencia'}
          </button>
        </form>
      </div>
    </div>
  );
}
