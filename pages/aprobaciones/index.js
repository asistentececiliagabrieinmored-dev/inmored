import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  devuelto: 'Devuelto',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
};

export default function Aprobaciones() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion, rolNombre } = useUsuarioActual();
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('pendiente');

  useEffect(() => {
    if (cargandoUsuario) return;

    if (!sesion) {
      router.replace('/login');
      return;
    }

    if (rolNombre && rolNombre !== 'gerente_operaciones') {
      // No tiene permiso para esta pantalla
      return;
    }

    async function cargar() {
      setCargando(true);
      let query = supabase
        .from('solicitudes_captacion')
        .select(
          `id, estado, fecha_envio, dimensiones, dormitorios,
           tipo_inmueble:tipos_inmueble(nombre),
           tipo_transaccion:tipos_transaccion(nombre),
           propietario:propietarios(nombre),
           asesor:usuarios(nombre, email)`
        )
        .order('fecha_envio', { ascending: false });

      if (filtro !== 'todas') {
        query = query.eq('estado', filtro);
      }

      const { data, error } = await query;
      if (!error) setSolicitudes(data || []);
      setCargando(false);
    }

    cargar();
  }, [cargandoUsuario, sesion, rolNombre, filtro, router]);

  if (cargandoUsuario) {
    return (
      <div className="container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (rolNombre && rolNombre !== 'gerente_operaciones') {
    return (
      <div>
        <div className="top-bar">
          <h1>INMORED</h1>
        </div>
        <div className="container">
          <p>Esta sección es solo para el gerente de operaciones.</p>
          <a href="/inmuebles" className="btn-secondary">
            Volver a inmuebles
          </a>
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
        <h2>Aprobaciones de captación</h2>

        <div style={{ marginBottom: 16 }}>
          {['pendiente', 'devuelto', 'rechazado', 'aprobado', 'todas'].map((f) => (
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
              {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
            </button>
          ))}
        </div>

        {cargando && <p>Cargando...</p>}

        {!cargando && solicitudes.length === 0 && (
          <p>No hay solicitudes en este estado.</p>
        )}

        {solicitudes.map((s) => (
          <a
            key={s.id}
            href={`/aprobaciones/${s.id}`}
            className="card"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <span className="badge">{ESTADO_LABEL[s.estado] || s.estado}</span>
            <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>
              {s.propietario?.nombre || 'Propietario sin nombre'} —{' '}
              {s.tipo_inmueble?.nombre} en {s.tipo_transaccion?.nombre}
            </p>
            <p style={{ margin: 0, color: '#555', fontSize: 13 }}>
              Asesor: {s.asesor?.nombre || s.asesor?.email} · Enviado:{' '}
              {new Date(s.fecha_envio).toLocaleString('es-BO')}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
