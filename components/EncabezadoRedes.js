import Head from 'next/head';
import estilos from '../styles/RedesSociales.module.css';

// Barra superior y tipografía de la sección Redes Sociales.
export default function EncabezadoRedes({ tituloPestana, volverHref, volverTexto }) {
  return (
    <>
      <Head>
        <title>{tituloPestana} · InmoRed</title>
      </Head>
      <header className={estilos.barra}>
        <div className={estilos.barraInterior}>
          <div className={estilos.marca}>InmoRed</div>
          <a href={volverHref} className={estilos.barraLink}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {volverTexto}
          </a>
        </div>
      </header>
    </>
  );
}
