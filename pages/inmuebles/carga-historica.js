import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

export default function CargaHistorica() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion, usuario } = useUsuarioActual();

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);

  // Propietario
  const [propietarioNombre, setPropietarioNombre] = useState('');
  const [propietarioCi, setPropietarioCi] = useState('');
  const [propietarioTelefono, setPropietarioTelefono] = useState('');

  // Inmueble
  const [fechaCaptacion, setFechaCaptacion] = useState('');
  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [dimensiones, setDimensiones] = useState('');
  const [dormitorios, setDormitorios] = useState('');
  const [banos, setBanos] = useState('');
  const [garajes, setGarajes] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [porcentajeComision, setPorcentajeComision] = useState('');
  const [estado, setEstado] = useState('historico');

  // Cierre (si ya se vendió/alquiló/cerró)
  const [yaCerrado, setYaCerrado] = useState(false);
  const [fechaCierre, setFechaCierre] = useState('');
  const [precioFinal, setPrecioFinal] = useState('');
  const [comisionTotal, setComisionTotal] = useState('');

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
    const { data: tiposInm } = await supabase.from('tipos_inmueble').select('id, nombre').order('id');
    const { data: tiposTrans } = await supabase.from('tipos_transaccion').select('id, nombre').order('id');
    const { data: zonasData } = await supabase.from('zonas').select('id, nombre').order('id');
    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!tipoInmuebleId || !tipoTransaccionId) {
      setError('Selecciona al menos el tipo de inmueble y el tipo de transacción.');
      return;
    }

    setEnviando(true);
    try {
      // 1. Propietario (si no se sabe el nombre, se registra como "Propietario no registrado")
      const { data: propietario, error: errorProp } = await supabase
        .from('propietarios')
        .insert({
          nombre: propietarioNombre || 'Propietario no registrado (carga histórica)',
          ci: propietarioCi,
          telefono: propietarioTelefono,
        })
        .select()
        .single();
      if (errorProp) throw errorProp;

      // 2. Inmueble (sin pasar por solicitud/aprobación)
      const { data: inmueble, error: errorInm } = await supabase
        .from('inmuebles')
        .insert({
          propietario_id: propietario.id,
          asesor_captador_id: usuario ? usuario.id : null,
          fecha_creacion: fechaCaptacion || null,
          zona_id: zonaId || null,
          ubicacion,
          tipo_inmueble_id: tipoInmuebleId,
          tipo_transaccion_id: tipoTransaccionId,
          dimensiones,
          dormitorios: dormitorios || null,
          banos: banos || null,
          garajes: garajes || null,
          descripcion,
          precio_venta: precioVenta || null,
          porcentaje_comision: porcentajeComision || null,
          precio_final_venta: yaCerrado ? precioFinal || null : null,
          estado,
        })
        .select()
        .single();
      if (errorInm) throw errorInm;

      // 3. Si ya se cerró (vendido/alquilado antes del sistema), registrar el cierre histórico
      if (yaCerrado) {
        const { data: cierre, error: errorCierre } = await supabase
          .from('cierres')
          .insert({
            inmueble_id: inmueble.id,
            tipo_transaccion_id: tipoTransaccionId,
            tipo_cierre: 'carga_historica',
            asesor_captador_id: usuario ? usuario.id : null,
            precio_final: precioFinal || 0,
            comision_total: comisionTotal || 0,
            porcentaje_comision_pactado: porcentajeComision || null,
            fecha_cierre: fechaCierre || null,
          })
          .select()
          .single();
        if (errorCierre) throw errorCierre;

        // Comisión registrada como un solo monto a la oficina (simplificado para datos históricos;
        // si necesitas desglosar por asesor, se puede editar directo en la base de datos).
        const { error: errorComision } = await supabase.from('comisiones_detalle').insert({
          cierre_id: cierre.id,
          beneficiario_tipo: 'oficina',
          porcentaje: 100,
          monto: comisionTotal || 0,
        });
        if (errorComision) throw errorComision;
      }

      setExito(true);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar el registro histórico.');
    } finally {
      setEnviando(false);
    }
  }

  function handleNuevoRegistro() {
    setPropietarioNombre('');
    setPropietarioCi('');
    setPropietarioTelefono('');
    setFechaCaptacion('');
    setTipoInmuebleId('');
    setTipoTransaccionId('');
    setZonaId('');
    setUbicacion('');
    setDimensiones('');
    setDormitorios('');
    setBanos('');
    setGarajes('');
    setDescripcion('');
    setPrecioVenta('');
    setPorcentajeComision('');
    setEstado('historico');
    setYaCerrado(false);
    setFechaCierre('');
    setPrecioFinal('');
    setComisionTotal('');
    setExito(false);
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
            <h2>Registro histórico guardado</h2>
            <p>El inmueble quedó cargado en el sistema con su información histórica.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={handleNuevoRegistro} style={{ width: 'auto' }}>
                Cargar otro inmueble histórico
              </button>
              <a href="/inmuebles" className="btn-secondary">
                Ver lista de inmuebles
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="top-bar">
        <h1>INMORED</h1>
        <a href="/inmuebles" className="logout-link" style={{ color: 'white' }}>
          Volver
        </a>
      </div>

      <div className="container">
        <h2>Cargar inmueble histórico</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Úsalo para registrar inmuebles que ya existían antes de este sistema —
          hayan sido vendidos/alquilados o sigan disponibles. No pasa por el flujo
          de aprobación, porque ya son captaciones reales del pasado.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}

          <div className="card">
            <div className="form-section">
              <h3>Datos del propietario</h3>
              <label>Nombre completo (si no lo sabes, déjalo en blanco)</label>
              <input
                type="text"
                value={propietarioNombre}
                onChange={(e) => setPropietarioNombre(e.target.value)}
              />
              <div className="form-row">
                <div>
                  <label>Carnet de identidad</label>
                  <input type="text" value={propietarioCi} onChange={(e) => setPropietarioCi(e.target.value)} />
                </div>
                <div>
                  <label>Teléfono</label>
                  <input type="text" value={propietarioTelefono} onChange={(e) => setPropietarioTelefono(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Datos del inmueble</h3>

              <label>Fecha aproximada de captación original (si la sabes)</label>
              <input type="date" value={fechaCaptacion} onChange={(e) => setFechaCaptacion(e.target.value)} />

              <div className="form-row">
                <div>
                  <label>Tipo de inmueble</label>
                  <select value={tipoInmuebleId} onChange={(e) => setTipoInmuebleId(e.target.value)} required>
                    <option value="">Selecciona...</option>
                    {tiposInmueble.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tipo de transacción</label>
                  <select value={tipoTransaccionId} onChange={(e) => setTipoTransaccionId(e.target.value)} required>
                    <option value="">Selecciona...</option>
                    {tiposTransaccion.map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label>Zona</label>
                  <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {zonas.map((z) => (
                      <option key={z.id} value={z.id}>{z.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Ubicación (dirección o referencia)</label>
                  <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
                </div>
              </div>

              <label>Dimensiones</label>
              <input type="text" value={dimensiones} onChange={(e) => setDimensiones(e.target.value)} />

              <div className="form-row">
                <div>
                  <label>Dormitorios</label>
                  <input type="number" min="0" value={dormitorios} onChange={(e) => setDormitorios(e.target.value)} />
                </div>
                <div>
                  <label>Baños</label>
                  <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} />
                </div>
              </div>
              <label>Garajes</label>
              <input type="number" min="0" value={garajes} onChange={(e) => setGarajes(e.target.value)} />

              <label>Descripción</label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />

              <div className="form-row">
                <div>
                  <label>Precio de venta / referencia ($us)</label>
                  <input type="number" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
                </div>
                <div>
                  <label>% de comisión pactado</label>
                  <input type="number" step="0.01" value={porcentajeComision} onChange={(e) => setPorcentajeComision(e.target.value)} />
                </div>
              </div>

              <label>Estado actual del inmueble</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="historico">Histórico (registro de referencia)</option>
                <option value="disponible">Disponible (sigue en cartera)</option>
                <option value="en_proceso">En proceso</option>
                <option value="cerrado">Cerrado (vendido/alquilado)</option>
              </select>
            </div>

            <div className="form-section">
              <h3>¿Ya se vendió, alquiló o cerró antes de cargarlo aquí?</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={yaCerrado}
                  onChange={(e) => setYaCerrado(e.target.checked)}
                />
                Sí, este inmueble ya tuvo un cierre (quiero registrar el ingreso histórico)
              </label>

              {yaCerrado && (
                <div style={{ marginTop: 12 }}>
                  <div className="form-row">
                    <div>
                      <label>Fecha del cierre</label>
                      <input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} />
                    </div>
                    <div>
                      <label>Precio final de la transacción ($us)</label>
                      <input type="number" value={precioFinal} onChange={(e) => setPrecioFinal(e.target.value)} />
                    </div>
                  </div>
                  <label>Comisión total percibida por la oficina ($us)</label>
                  <input type="number" value={comisionTotal} onChange={(e) => setComisionTotal(e.target.value)} />
                  <p style={{ fontSize: 12, color: '#888' }}>
                    Por simplicidad, este ingreso histórico se registra completo a nombre de
                    la oficina. Si necesitas desglosarlo entre asesores más adelante, se
                    puede ajustar directamente en la base de datos.
                  </p>
                </div>
              )}
            </div>
          </div>

          <button type="submit" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar inmueble histórico'}
          </button>
        </form>
      </div>
    </div>
  );
}
