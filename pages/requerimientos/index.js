import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

export default function Requerimientos() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion } = useUsuarioActual();
  const [requerimientos, setRequerimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('activo');

  useEffect(() => {
    if (cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarRequerimientos();
  }, [cargandoUsuario, sesion, filtro]);

  async function cargarRequerimientos() {
    setCargando(true);
    let query = supabase
      .from('requerimientos')
      .select(
        `id, nombre_requerimiento, ubicacion_referencia, presupuesto_min, presupuesto_max, dormitorios_min, estado, fecha_creacion,
         tipo_inmueble:tipos_inmueble(nombre),
         tipo_transaccion:tipos_transaccion(nombre),
         asesor:usuarios(nombre)`
      )
      .order('fecha_creacion', { ascending: false });

    if (filtro !== 'todos') {
      query = query.eq('estado', filtro);
    }

    const { data, error } = await query;
    if (!error) setRequerimientos(data || []);
    setCargando(false);
  }

  async function handleCerrar(id) {
    await supabase
      .from('requerimientos')
      .update({ estado: 'cerrado', fecha_cierre: new Date().toISOString() })
      .eq('id', id);
    cargarRequerimientos();
  }

  async function handleEliminar(id, nombre) {
    if (!window.confirm(`¿Eliminar el requerimiento "${nombre}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from('requerimientos').delete().eq('id', id);
    cargarRequerimientos();
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
          <h2 style={{ margin: 0 }}>Requerimientos</h2>
          <a href="/requerimientos/nueva" className="btn-secondary">
            + Nuevo requerimiento
          </a>
        </div>

        <div style={{ marginBottom: 16 }}>
          {['activo', 'cerrado', 'todos'].map((f) => (
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
              {f === 'todos' ? 'Todos' : f === 'activo' ? 'Activos' : 'Cerrados'}
            </button>
          ))}
        </div>

        {cargando && <p>Cargando...</p>}
        {!cargando && requerimientos.length === 0 && <p>No hay requerimientos en este estado.</p>}

        {requerimientos.map((r) => (
          <div key={r.id} className="card" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 12, right: 16, display: 'flex', gap: 10 }}>
              <a
                href={`/requerimientos/${r.id}`}
                title="Editar"
                style={{ fontSize: 16, lineHeight: 1, textDecoration: 'none' }}
              >
                ✏️
              </a>
              <button
                onClick={() => handleEliminar(r.id, r.nombre_requerimiento)}
                title="Eliminar"
                style={{
                  fontSize: 16,
                  lineHeight: 1,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  width: 'auto',
                  cursor: 'pointer',
                }}
              >
                🗑️
              </button>
            </div>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 16, color: '#06416A', paddingRight: 56 }}>
              {r.nombre_requerimiento}
            </p>
            <p style={{ margin: '0 0 4px', fontWeight: 500 }}>
              {r.tipo_inmueble?.nombre || 'Cualquier tipo'} en {r.tipo_transaccion?.nombre || 'cualquier transacción'}
              {r.dormitorios_min ? ` · ${r.dormitorios_min}+ dormitorios` : ''}
            </p>
            <p style={{ margin: 0, color: '#555', fontSize: 13 }}>
              Presupuesto: {r.presupuesto_min ? `$us ${r.presupuesto_min}` : 'sin mínimo'} —{' '}
              {r.presupuesto_max ? `$us ${r.presupuesto_max}` : 'sin máximo'}
            </p>
            {r.ubicacion_referencia && (
              <p style={{ margin: '2px 0 0', color: '#555', fontSize: 13 }}>
                Ubicación: {r.ubicacion_referencia}
              </p>
            )}
            <p style={{ margin: '4px 0 0', color: '#888', fontSize: 12 }}>
              Asesor: {r.asesor?.nombre || '—'} · Cargado: {new Date(r.fecha_creacion).toLocaleDateString('es-BO')}
            </p>
            {r.estado === 'activo' && (
              <button onClick={() => handleCerrar(r.id)} className="btn-secondary" style={{ marginTop: 8, width: 'auto' }}>
                Marcar como cerrado
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
