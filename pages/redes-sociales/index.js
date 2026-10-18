import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';
import EncabezadoRedes from '../../components/EncabezadoRedes';
import estilos from '../../styles/RedesSociales.module.css';

// Material de marketing (artes y fotos para redes): bucket PÚBLICO.
const BUCKET = 'documentos';

export default function RedesSociales() {
  const router = useRouter();
  const { cargando: cargandoUsuario, sesion, usuario, rolNombre } = useUsuarioActual();
  const esGerente = rolNombre === 'gerente_operaciones';

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [filtroTransaccionId, setFiltroTransaccionId] = useState('');
  const [filtroTipoId, setFiltroTipoId] = useState('');
  const [filtroCaptacion, setFiltroCaptacion] = useState('');

  const [materiales, setMateriales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarCatalogos();
  }, [cargandoUsuario, sesion]);

  useEffect(() => {
    if (cargandoUsuario || !sesion) return;
    cargarMateriales();
  }, [cargandoUsuario, sesion, filtroTransaccionId, filtroTipoId, filtroCaptacion]);

  async function cargarCatalogos() {
    const [{ data: tiposInm }, { data: tiposTrans }] = await Promise.all([
      supabase.from('tipos_inmueble').select('id, nombre').order('id'),
      supabase.from('tipos_transaccion').select('id, nombre').order('id'),
    ]);
    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
  }

  async function cargarMateriales() {
    setCargando(true);
    // Disponibles primero; dentro de cada grupo, el más reciente primero.
    let query = supabase
      .from('material_redes')
      .select(
        `id, nombre, moneda, precio, copy, disponible, cargado_por_usuario_id, fecha_creacion,
         captacion_inmored, captador_nombre, captador_telefono,
         tipo_inmueble:tipos_inmueble(nombre),
         tipo_transaccion:tipos_transaccion(nombre),
         zona:zonas(nombre),
         imagenes:material_redes_imagenes(id, tipo, url, ruta_storage, orden)`
      )
      .order('disponible', { ascending: false })
      .order('fecha_creacion', { ascending: false });

    if (filtroTransaccionId) query = query.eq('tipo_transaccion_id', filtroTransaccionId);
    if (filtroTipoId) query = query.eq('tipo_inmueble_id', filtroTipoId);
    if (filtroCaptacion) query = query.eq('captacion_inmored', filtroCaptacion === 'inmored');

    const { data, error: errorCarga } = await query;
    if (errorCarga) setError(errorCarga.message);
    else setMateriales(data || []);
    setCargando(false);
  }

  async function handleCambiarDisponible(material) {
    setError('');
    const nuevoValor = !material.disponible;
    const { error: errorUpdate } = await supabase
      .from('material_redes')
      .update({ disponible: nuevoValor })
      .eq('id', material.id);
    if (errorUpdate) {
      setError(errorUpdate.message);
      return;
    }
    // Se reordena en pantalla sin recargar, para que no parpadee la grilla.
    setMateriales((prev) =>
      prev
        .map((m) => (m.id === material.id ? { ...m, disponible: nuevoValor } : m))
        .sort(
          (a, b) =>
            Number(b.disponible) - Number(a.disponible) || new Date(b.fecha_creacion) - new Date(a.fecha_creacion)
        )
    );
  }

  function renderChips(opciones, valorActual, setValor, textoTodos) {
    return (
      <div className={estilos.chips}>
        <button
          type="button"
          className={`${estilos.chip} ${valorActual === '' ? estilos.chipActivo : ''}`}
          onClick={() => setValor('')}
        >
          {textoTodos}
        </button>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${estilos.chip} ${String(valorActual) === String(o.id) ? estilos.chipActivo : ''}`}
            onClick={() => setValor(String(o.id))}
          >
            {o.nombre}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={estilos.pagina}>
      <EncabezadoRedes tituloPestana="Redes Sociales" volverHref="/inmuebles" volverTexto="Inmuebles" />

      <main className={estilos.contenido}>
        <div>
          <h1 className={estilos.titulo}>Redes Sociales</h1>
          {!cargando && (
            <div className={estilos.subtitulo}>
              {materiales.length} {materiales.length === 1 ? 'inmueble cargado' : 'inmuebles cargados'} · disponibles
              primero, del más reciente al más antiguo
            </div>
          )}
        </div>

        <div className={estilos.filtros}>
          <div className={estilos.filtroGrupo}>
            <div className={estilos.filtroEtiqueta}>Transacción</div>
            {renderChips(tiposTransaccion, filtroTransaccionId, setFiltroTransaccionId, 'Todas')}
          </div>
          <div className={estilos.filtroGrupo}>
            <div className={estilos.filtroEtiqueta}>Tipo de inmueble</div>
            {renderChips(tiposInmueble, filtroTipoId, setFiltroTipoId, 'Todos')}
          </div>
          <div className={estilos.filtroGrupo}>
            <div className={estilos.filtroEtiqueta}>Captación</div>
            {renderChips(
              [
                { id: 'inmored', nombre: 'InmoRed' },
                { id: 'externa', nombre: 'Externas' },
              ],
              filtroCaptacion,
              setFiltroCaptacion,
              'Todas'
            )}
          </div>
          <a href="/redes-sociales/nuevo" className={estilos.btnPrimario}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar inmueble
          </a>
        </div>

        {error && <p className={estilos.error}>{error}</p>}
        {cargando && <p className={estilos.mensaje}>Cargando...</p>}
        {!cargando && materiales.length === 0 && (
          <p className={estilos.mensaje}>No hay inmuebles cargados con estos filtros.</p>
        )}

        <div className={estilos.grilla}>
          {!cargando &&
            materiales.map((m) => (
              <TarjetaMaterial
                key={m.id}
                material={m}
                esGerente={esGerente}
                puedeEditar={esGerente || (usuario && usuario.id === m.cargado_por_usuario_id)}
                onCambiarDisponible={handleCambiarDisponible}
              />
            ))}
        </div>
      </main>
    </div>
  );
}

function formatearPrecio(precio, moneda) {
  if (precio == null) return null;
  const numero = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(precio);
  return `${moneda === 'bob' ? 'Bs' : 'US$'} ${numero}`;
}

// Artes primero (el primero es la carátula), después fotografías, cada grupo por su orden.
function ordenarImagenes(imagenes) {
  const porOrden = (a, b) => a.orden - b.orden;
  const artes = imagenes.filter((i) => i.tipo === 'arte').sort(porOrden);
  const fotos = imagenes.filter((i) => i.tipo === 'foto').sort(porOrden);
  return [
    ...artes.map((img, i) => ({
      ...img,
      etiqueta: i === 0 ? `Arte ${i + 1} de ${artes.length} · carátula` : `Arte ${i + 1} de ${artes.length}`,
    })),
    ...fotos.map((img, i) => ({ ...img, etiqueta: `Fotografía ${i + 1} de ${fotos.length}` })),
  ];
}

function TarjetaMaterial({ material, esGerente, puedeEditar, onCambiarDisponible }) {
  const imagenes = ordenarImagenes(material.imagenes || []);
  const [indice, setIndice] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const inicioToque = useRef(null);

  const disponible = material.disponible;
  const actual = imagenes[Math.min(indice, imagenes.length - 1)];
  const hayVarias = imagenes.length > 1;

  function ir(nuevo) {
    setIndice((nuevo + imagenes.length) % imagenes.length);
  }

  function handleToqueFin(e) {
    if (inicioToque.current == null || !hayVarias) return;
    const delta = e.changedTouches[0].clientX - inicioToque.current;
    if (Math.abs(delta) > 40) ir(indice + (delta < 0 ? 1 : -1));
    inicioToque.current = null;
  }

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(material.copy || '');
    } catch {
      // Respaldo para navegadores que no permiten el portapapeles moderno.
      const area = document.createElement('textarea');
      area.value = material.copy || '';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function handleInterruptor() {
    setCambiando(true);
    await onCambiarDisponible(material);
    setCambiando(false);
  }

  const urlDescarga = actual
    ? supabase.storage.from(BUCKET).getPublicUrl(actual.ruta_storage, { download: true }).data.publicUrl
    : null;

  const iconoDescarga = (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );

  const detalle = [
    material.tipo_inmueble && material.tipo_inmueble.nombre,
    material.tipo_transaccion && material.tipo_transaccion.nombre,
    material.zona && material.zona.nombre,
  ]
    .filter(Boolean)
    .join(' · ');
  const precio = formatearPrecio(material.precio, material.moneda);

  return (
    <article className={estilos.tarjeta}>
      <div
        className={estilos.carrusel}
        onTouchStart={(e) => (inicioToque.current = e.touches[0].clientX)}
        onTouchEnd={handleToqueFin}
      >
        {actual ? (
          <img
            src={actual.url}
            alt={`${material.nombre} — ${actual.etiqueta}`}
            className={`${estilos.carruselImagen} ${disponible ? '' : estilos.apagado}`}
          />
        ) : (
          <div className={estilos.carruselVacio}>Sin imágenes cargadas</div>
        )}

        {actual && <div className={estilos.etiquetaImagen}>{actual.etiqueta}</div>}
        {material.captacion_inmored && (
          <div className={estilos.sello}>
            <img src="/logo-inmored.svg" alt="Captación InmoRed" />
          </div>
        )}
        {hayVarias && (
          <div className={estilos.contador}>
            {indice + 1} / {imagenes.length}
          </div>
        )}

        {hayVarias && (
          <>
            <button type="button" aria-label="Anterior" className={`${estilos.flecha} ${estilos.flechaIzquierda}`} onClick={() => ir(indice - 1)}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <button type="button" aria-label="Siguiente" className={`${estilos.flecha} ${estilos.flechaDerecha}`} onClick={() => ir(indice + 1)}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}

        {actual &&
          (disponible ? (
            <a href={urlDescarga} className={estilos.btnDescargar}>
              {iconoDescarga}
              Descargar
            </a>
          ) : (
            <button type="button" className={estilos.btnDescargar} disabled>
              {iconoDescarga}
              Descargar
            </button>
          ))}
      </div>

      {hayVarias && (
        <div className={estilos.puntos}>
          {imagenes.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-label={`Ver ${img.etiqueta}`}
              className={`${estilos.punto} ${i === indice ? estilos.puntoActivo : ''}`}
              onClick={() => setIndice(i)}
            />
          ))}
        </div>
      )}

      <div className={estilos.cuerpo}>
        <div className={estilos.filaEstado}>
          <div className={estilos.badges}>
            <span className={`${estilos.badge} ${disponible ? estilos.badgeDisponible : estilos.badgeNoDisponible}`}>
              {disponible ? 'Disponible' : 'No disponible'}
            </span>
            {!material.captacion_inmored && <span className={`${estilos.badge} ${estilos.badgeExterna}`}>Externa</span>}
          </div>
          {puedeEditar && (
            <a href={`/redes-sociales/${material.id}`} className={estilos.btnChico}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
              Editar
            </a>
          )}
        </div>
        <h2 className={estilos.nombre}>{material.nombre}</h2>
        {detalle && <div className={estilos.detalle}>{detalle}</div>}
        {precio && <div className={estilos.precio}>{precio}</div>}
        {material.captador_nombre && (
          <div className={estilos.captador}>
            Captó: <strong>{material.captador_nombre}</strong>
            {material.captador_telefono && (
              <>
                {' · '}
                <a href={`tel:${material.captador_telefono.replace(/[^\d+]/g, '')}`}>{material.captador_telefono}</a>
              </>
            )}
          </div>
        )}
      </div>

      {material.copy && (
        <div className={estilos.copyCaja}>
          <div className={estilos.copyFila}>
            <div className={estilos.copyEtiqueta}>Copy</div>
            <button type="button" className={estilos.btnChico} onClick={handleCopiar} disabled={!disponible}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a1 1 0 0 1 1-1h10" />
              </svg>
              {copiado ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className={`${estilos.copyTexto} ${disponible ? '' : estilos.copyTextoApagado}`}>{material.copy}</p>
        </div>
      )}

      {esGerente && (
        <div className={estilos.gerenteFila}>
          <div className={estilos.gerenteTexto}>
            Disponible
            <span className={estilos.gerenteAyuda}>Solo lo ve el gerente de operaciones</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={disponible}
            aria-label="Disponible"
            className={`${estilos.interruptor} ${disponible ? estilos.interruptorEncendido : ''}`}
            onClick={handleInterruptor}
            disabled={cambiando}
          >
            <span className={estilos.interruptorPerilla} />
          </button>
        </div>
      )}
    </article>
  );
}
