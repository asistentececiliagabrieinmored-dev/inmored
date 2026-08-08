import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function Inmuebles() {
  const router = useRouter();
  const [inmuebles, setInmuebles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState('');
  const [rolNombre, setRolNombre] = useState(null);

  useEffect(() => {
    async function cargarDatos() {
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

      const { data, error } = await supabase
        .from('inmuebles')
        .select(
          `id, nombre, ubicacion, precio_venta, estado, zona_id, tipo_inmueble_id,
           captador:usuarios(nombre)`
        )
        .order('fecha_creacion', { ascending: false });

      if (!error) {
        setInmuebles(data || []);
      }

      setCargando(false);
    }

    cargarDatos();
  }, [router]);

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

        {cargando && <p>Cargando...</p>}

        {!cargando && inmuebles.length === 0 && (
          <p>
            Todavía no hay inmuebles cargados en la base de datos. Esto es
            normal si recién creaste el proyecto.
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
