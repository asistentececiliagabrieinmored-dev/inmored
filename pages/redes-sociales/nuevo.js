import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUsuarioActual } from '../../lib/useUsuarioActual';
import EncabezadoRedes from '../../components/EncabezadoRedes';
import FormularioMaterialRedes from '../../components/FormularioMaterialRedes';
import estilos from '../../styles/RedesSociales.module.css';

export default function NuevoMaterialRedes() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion } = useUsuarioActual();

  useEffect(() => {
    if (!cargandoUsuario && !sesion) router.replace('/login');
  }, [cargandoUsuario, sesion]);

  return (
    <div className={estilos.pagina}>
      <EncabezadoRedes tituloPestana="Agregar inmueble" volverHref="/redes-sociales" volverTexto="Redes Sociales" />
      <main className={`${estilos.contenido} ${estilos.contenidoAngosto}`}>
        <h1 className={estilos.titulo}>Agregar inmueble</h1>
        {!cargandoUsuario && sesion && <FormularioMaterialRedes />}
      </main>
    </div>
  );
}
