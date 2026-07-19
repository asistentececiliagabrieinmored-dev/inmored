import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function Inmuebles() {
  const router = useRouter();
  const [inmuebles, setInmuebles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState('');

  useEffect(() => {
    async function cargarDatos() {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        router.replace('/login');
        return;
      }

      setUsuarioEmail(sessionData.session.user.email);

      const { data, error } = await supabase
        .from('inmuebles')
        .select(
          'id, ubicacion, precio_venta, estado, zona_id, tipo_inmueble_id'
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
        <h2>Inmuebles</h2>

        {cargando && <p>Cargando...</p>}

        {!cargando && inmuebles.length === 0 && (
          <p>
            Todavía no hay inmuebles cargados en la base de datos. Esto es
            normal si recién creaste el proyecto.
          </p>
        )}

        {inmuebles.map((inmueble) => (
          <div className="card" key={inmueble.id}>
            <span className="badge">{inmueble.estado}</span>
            <p style={{ margin: '8px 0 4px', fontWeight: 500 }}>
              {inmueble.ubicacion || 'Sin ubicación registrada'}
            </p>
            <p style={{ margin: 0, color: '#555' }}>
              {inmueble.precio_venta
                ? `$us ${Number(inmueble.precio_venta).toLocaleString()}`
                : 'Precio no definido'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
