import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';
import EncabezadoRedes from '../../components/EncabezadoRedes';
import FormularioMaterialRedes from '../../components/FormularioMaterialRedes';
import estilos from '../../styles/RedesSociales.module.css';

export default function EditarMaterialRedes() {
  const router = useRouter();
  const { id } = router.query;
  const { cargando: cargandoUsuario, sesion, usuario, rolNombre } = useUsuarioActual();
  const [permiso, setPermiso] = useState(null); // null = verificando

  useEffect(() => {
    if (cargandoUsuario || !id) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    verificarPermiso();
  }, [cargandoUsuario, sesion, id]);

  // Solo quien lo cargó y el gerente pueden editar (la base de datos también lo exige).
  async function verificarPermiso() {
    if (rolNombre === 'gerente_operaciones') {
      setPermiso(true);
      return;
    }
    const { data } = await supabase.from('material_redes').select('cargado_por_usuario_id').eq('id', id).maybeSingle();
    setPermiso(Boolean(data && usuario && data.cargado_por_usuario_id === usuario.id));
  }

  return (
    <div className={estilos.pagina}>
      <EncabezadoRedes tituloPestana="Editar inmueble" volverHref="/redes-sociales" volverTexto="Redes Sociales" />
      <main className={`${estilos.contenido} ${estilos.contenidoAngosto}`}>
        <h1 className={estilos.titulo}>Editar inmueble</h1>
        {permiso === null && <p className={estilos.mensaje}>Cargando...</p>}
        {permiso === false && (
          <p className={estilos.mensaje}>Solo quien cargó este inmueble o el gerente de operaciones pueden editarlo.</p>
        )}
        {permiso === true && <FormularioMaterialRedes materialId={id} />}
      </main>
    </div>
  );
}
