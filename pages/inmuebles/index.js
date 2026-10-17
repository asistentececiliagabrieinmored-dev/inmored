import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import menu from '../../styles/MenuInmuebles.module.css';

const SECCIONES = [
  { nombre: 'Requerimientos', href: '/requerimientos', icono: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5' },
  {
    nombre: 'Referencias externas',
    href: '/referencias',
    icono: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  },
  { nombre: 'Redes Sociales', href: '/redes-sociales', icono: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15.5 9.5h.01' },
  {
    nombre: 'Aprobaciones',
    href: '/aprobaciones',
    icono: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
    soloGerente: true,
  },
];

const CARGAS = [
  {
    nombre: 'Nueva solicitud',
    href: '/inmuebles/nueva-solicitud',
    icono: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6',
  },
  { nombre: 'Carga histórica', href: '/inmuebles/carga-historica', icono: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2' },
];

function IconoMenu({ trazo }) {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={trazo} />
    </svg>
  );
}

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
        <h1>InmoRed</h1>
        <div>
          <span style={{ marginRight: 16, fontSize: 13 }}>{usuarioEmail}</span>
          <span className="logout-link" onClick={handleLogout}>
            Cerrar sesión
          </span>
        </div>
      </div>

      <div className="container">
        <h2 style={{ marginTop: 0 }}>Inmuebles</h2>

        <nav className={menu.menu} aria-label="Menú principal">
          <div className={menu.grupo}>
            <div className={menu.grupoEtiqueta}>Secciones</div>
            <div className={menu.iconos}>
              {SECCIONES.filter((s) => !s.soloGerente || rolNombre === 'gerente_operaciones').map((s) => (
                <a key={s.href} href={s.href} className={menu.icono}>
                  <IconoMenu trazo={s.icono} />
                  <span className={menu.iconoTexto}>{s.nombre}</span>
                </a>
              ))}
            </div>
          </div>
          <div className={`${menu.grupo} ${menu.grupoCargar}`}>
            <div className={menu.grupoEtiqueta}>Cargar</div>
            <div className={menu.iconos}>
              {CARGAS.map((c) => (
                <a key={c.href} href={c.href} className={`${menu.icono} ${menu.iconoAccion}`}>
                  <IconoMenu trazo={c.icono} />
                  <span className={menu.iconoTexto}>{c.nombre}</span>
                </a>
              ))}
            </div>
          </div>
        </nav>

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
          <div key={inmueble.id} className="card" style={{ position: 'relative' }}>
            <a
              href={`/inmuebles/${inmueble.id}`}
              title="Editar"
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                color: '#666',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </a>
            <span className="badge">{inmueble.estado}</span>
            <p style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 16, color: '#06416A', paddingRight: 40 }}>
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
          </div>
        ))}
      </div>
    </div>
  );
}
