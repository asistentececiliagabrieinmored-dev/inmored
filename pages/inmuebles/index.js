import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function Inmuebles() {
  const router = useRouter();
  const [inmuebles, setInmuebles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [rolNombre, setRolNombre] = useState(null);
  const [sesionLista, setSesionLista] = useState(false);

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [captadores, setCaptadores] = useState([]);

  const [filtroTipoInmuebleId, setFiltroTipoInmuebleId] = useState('');
  const [filtroTipoTransaccionId, setFiltroTipoTransaccionId] = useState('');
  const [filtroCaptadorId, setFiltroCaptadorId] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  const hayFiltrosActivos =
    filtroTipoInmuebleId || filtroTipoTransaccionId || filtroCaptadorId || filtroFechaDesde || filtroFechaHasta;

  useEffect(() => {
    async function iniciar() {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        router.replace('/login');
        return;
      }

      setUsuarioEmail(sessionData.session.user.email);

      const { data: usuarioFila } = await supabase
        .from('usuarios')
        .select('rol:roles(nombre)')
        .eq('email', sessionData.session.user.email)
        .maybeSingle();

      if (usuarioFila && usuarioFila.rol) {
        setRolNombre(usuarioFila.rol.nombre);
      }

      const [{ data: tiposInm }, { data: tiposTrans }, { data: usuariosData }] = await Promise.all([
        supabase.from('tipos_inmueble').select('id, nombre').order('id'),
        supabase.from('tipos_transaccion').select('id, nombre').order('id'),
        supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre'),
      ]);

      setTiposInmueble(tiposInm || []);
      setTiposTransaccion(tiposTrans || []);
      setCaptadores(usuariosData || []);
      setSesionLista(true);
    }

    iniciar();
  }, [router]);

  useEffect(() => {
    if (!sesionLista) return;

    async function cargarInmuebles() {
      setCargando(true);

      let query = supabase
        .from('inmuebles')
        .select(
          `id, nombre, ubicacion, precio_venta, estado, zona_id, tipo_inmueble_id,
           captador:usuarios(nombre)`
        )
        .order('fecha_creacion', { ascending: false });

      if (filtroTipoInmuebleId) query = query.eq('tipo_inmueble_id', filtroTipoInmuebleId);
      if (filtroTipoTransaccionId) query = query.eq('tipo_transaccion_id', filtroTipoTransaccionId);
      if (filtroCaptadorId) query = query.eq('asesor_captador_id', filtroCaptadorId);
      if (filtroFechaDesde) query = query.gte('fecha_creacion', filtroFechaDesde);
      if (filtroFechaHasta) query = query.lte('fecha_creacion', filtroFechaHasta);

      const { data, error } = await query;
      if (!error) setInmuebles(data || []);
      setCargando(false);
    }

    cargarInmuebles();
  }, [sesionLista, filtroTipoInmuebleId, filtroTipoTransaccionId, filtroCaptadorId, filtroFechaDesde, filtroFechaHasta]);

  function handleLimpiarFiltros() {
    setFiltroTipoInmuebleId('');
    setFiltroTipoTransaccionId('');
    setFiltroCaptadorId('');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div>
      <div className="top-bar">
        <h1>INMORED</h1>
        <div>
          <span style={{ marginRight: 16, fontSize: 13 }}>{usuarioEmail}</span>
          <span className="logout-link" onClick={handleLogout}>
            Cerrar sesión
          </span>
        </div>
      </div>

      <div className="container">
        <div className="top-actions">
          <h2 style={{ margin: 0 }}>Inmuebles</h2>
          <div>
            {rolNombre === 'gerente_operaciones' && (
              <a href="/aprobaciones" className="btn-secondary" style={{ marginRight: 8 }}>
                Aprobaciones pendientes
              </a>
            )}
            <a href="/inmuebles/carga-historica" className="btn-secondary" style={{ marginRight: 8 }}>
              Cargar inmueble histórico
            </a>
            <a href="/inmuebles/nueva-solicitud" className="btn-secondary">
              + Nueva solicitud de captación
            </a>
          </div>
        </div>

        <div className="card">
          <h3 style={{ color: '#06416A', marginTop: 0 }}>Filtros</h3>
          <div className="form-row">
            <div>
              <label>Tipo de inmueble</label>
              <select value={filtroTipoInmuebleId} onChange={(e) => setFiltroTipoInmuebleId(e.target.value)}>
                <option value="">Todos</option>
                {tiposInmueble.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Tipo de transacción</label>
              <select value={filtroTipoTransaccionId} onChange={(e) => setFiltroTipoTransaccionId(e.target.value)}>
                <option value="">Todos</option>
                {tiposTransaccion.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Fecha de captación desde</label>
              <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} />
            </div>
            <div>
              <label>Fecha de captación hasta</label>
              <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Captador</label>
              <select value={filtroCaptadorId} onChange={(e) => setFiltroCaptadorId(e.target.value)}>
                <option value="">Todos</option>
                {captadores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={handleLimpiarFiltros} className="btn-secondary" style={{ width: '100%' }}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {cargando && <p>Cargando...</p>}

        {!cargando && inmuebles.length === 0 && (
          <p>
            {hayFiltrosActivos
              ? 'No hay inmuebles que coincidan con estos filtros.'
              : 'Todavía no hay inmuebles cargados en la base de datos. Esto es normal si recién creaste el proyecto.'}
          </p>
        )}

        {inmuebles.map((inmueble) => (
          <a
            href={`/inmuebles/${inmueble.id}`}
            className="card"
            key={inmueble.id}
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <span className="badge">{inmueble.estado}</span>
            <p style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 16, color: '#06416A' }}>
              {inmueble.nombre || 'Sin nombre registrado'}
            </p>
            <p style={{ margin: '0 0 4px', fontWeight: 500 }}>
              {inmueble.ubicacion || 'Sin ubicación registrada'}
            </p>
            <p style={{ margin: 0, color: '#555' }}>
              {inmueble.precio_venta
                ? `$us ${Number(inmueble.precio_venta).toLocaleString()}`
                : 'Precio no definido'}
            </p>
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>
              Captador: {inmueble.captador?.nombre || '—'}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
