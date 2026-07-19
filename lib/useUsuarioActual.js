import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Hook reutilizable: obtiene la sesión activa y los datos del usuario
// (incluyendo su rol) desde la tabla "usuarios".
export function useUsuarioActual() {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState(null);
  const [usuario, setUsuario] = useState(null); // fila de la tabla "usuarios"
  const [rolNombre, setRolNombre] = useState(null);

  useEffect(() => {
    async function cargar() {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        setCargando(false);
        return;
      }

      setSesion(sessionData.session);

      const { data: usuarioFila } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol:roles(nombre)')
        .eq('email', sessionData.session.user.email)
        .maybeSingle();

      if (usuarioFila) {
        setUsuario(usuarioFila);
        setRolNombre(usuarioFila.rol ? usuarioFila.rol.nombre : null);
      }

      setCargando(false);
    }

    cargar();
  }, []);

  return { cargando, sesion, usuario, rolNombre };
}
