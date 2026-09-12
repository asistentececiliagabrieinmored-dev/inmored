import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

export default function ReferenciasExternas() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion } = useUsuarioActual();
  const [referencias, setReferencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('vigentes');

  useEffect(() => {
    if (cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarReferencias();
  }, [cargandoUsuario, sesion, filtro]);

  async function cargarReferencias() {
    setCargando(true);
    const ahora = new Date().toISOString();

    let query = supabase
      .from('referencias_externas')
      .select(
        `id, origen, ubicacion, precio, moneda, dimensiones, dormitorios, descripcion,
         contacto_nombre, contacto_telefono, activa, fecha_expiracion, fecha_recibido,
         tipo_inmueble:tipos_inmueble(nombre),
         tipo_transaccion:tipos_transaccion(nombre),
         zona:zonas(nombre)`
      )
      .order('fecha_recibido', { ascending: false });

    if (filtro === 'vigentes') {
      query = query.eq('activa', true).gt('fecha_expiracion', ahora);
    } else if (filtro === 'vencidas') {
      query = query.or(`activa.eq.false,fecha_expiracion.lte.${ahora}`);
    }

    const { data, error } = await query;
    if (!error) setReferencias(data || []);
    setCargando(false);
  }

  async function handleEliminar(id, titulo) {
    if (!window.confirm(`¿Eliminar la referencia "${titulo}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from('referencias_externas').delete().eq('id', id);
    cargarReferencias();
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
        <div className="top-actions">
          <h2 style={{ margin: 0 }}>Referencias externas</h2>
          <a href="/referencias/nueva" className="btn-secondary">
            + Cargar referencia
          </a>
        </div>

        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Inmuebles vistos en grupos de intercambio (WhatsApp/Telegram), no captados directamente por
          InmoRed. Las que llegan por el bot se cargan solas; acá también se pueden cargar y editar a mano.
        </p>

        <div style={{ marginBottom: 16 }}>
          {['vigentes', 'vencidas', 'todos'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="btn-secondary"
              style={{
                marginRight: 8,
                width: 'auto',
                background: filtro === f ? '#06416A' : 'white',
                color: filtro === f ? 'white' : '#06416A',
              }}
            >
              {f === 'todos' ? 'Todas' : f === 'vigentes' ? 'Vigentes' : 'Vencidas / inactivas'}
            </button>
          ))}
        </div>

        {cargando && <p>Cargando...</p>}
        {!cargando && referencias.length === 0 && <p>No hay referencias externas en este estado.</p>}

        {referencias.map((r) => {
          const titulo = r.ubicacion || r.descripcion?.slice(0, 60) || `Referencia #${r.id}`;
          const vencida = new Date(r.fecha_expiracion) <= new Date();

          return (
            <div key={r.id} className="card" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', gap: 4 }}>
                <a
                  href={`/referencias/${r.id}`}
                  title="Editar"
                  style={{
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
                <button
                  onClick={() => handleEliminar(r.id, titulo)}
                  title="Eliminar"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 30,
                    height: 30,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#b3261e',
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
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>

              {(!r.activa || vencida) && <span className="badge">{!r.activa ? 'inactiva' : 'vencida'}</span>}

              <p style={{ margin: '8px 0 2px', fontWeight: 700, fontSize: 16, color: '#06416A', paddingRight: 72 }}>
                {titulo}
              </p>
              <p style={{ margin: '0 0 4px', fontWeight: 500 }}>
                {r.tipo_inmueble?.nombre || 'Tipo no identificado'} en {r.tipo_transaccion?.nombre || 'transacción no identificada'}
                {r.zona?.nombre ? ` — ${r.zona.nombre}` : ''}
              </p>
              <p style={{ margin: 0, color: '#555' }}>
                {r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'Precio no informado'}
                {r.dimensiones ? ` — ${r.dimensiones}` : ''}
                {r.dormitorios ? ` — ${r.dormitorios} dorm.` : ''}
              </p>
              <p style={{ margin: '4px 0 0', color: '#555', fontSize: 13 }}>
                Contacto: {r.contacto_nombre || '—'}
                {r.contacto_telefono ? ` (${r.contacto_telefono})` : ''}
              </p>
              <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>
                {r.origen === 'telegram_bot' ? 'Bot de Telegram' : 'Carga manual'} · Vence:{' '}
                {new Date(r.fecha_expiracion).toLocaleDateString('es-BO')}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
