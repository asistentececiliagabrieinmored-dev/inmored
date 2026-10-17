import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import estilos from '../styles/RedesSociales.module.css';

// Material de marketing (artes y fotos para redes): bucket PÚBLICO.
const BUCKET = 'documentos';

// Formulario compartido entre "Agregar inmueble" (materialId vacío) y
// "Editar" (materialId de una fila existente de material_redes).
export default function FormularioMaterialRedes({ materialId }) {
  const router = useRouter();
  const esEdicion = Boolean(materialId);

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);
  const [zonas, setZonas] = useState([]);

  const [nombre, setNombre] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [zonaId, setZonaId] = useState('');
  const [moneda, setMoneda] = useState('usd');
  const [precio, setPrecio] = useState('');
  const [copy, setCopy] = useState('');

  // Cada ítem: { clave, id?, url, ruta_storage?, archivo? }.
  // Los que tienen "archivo" son nuevos y se suben al guardar.
  const [artes, setArtes] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [quitadas, setQuitadas] = useState([]); // filas existentes a borrar al guardar

  const [cargando, setCargando] = useState(esEdicion);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarCatalogos();
    if (esEdicion) cargarMaterial();
  }, [materialId]);

  async function cargarCatalogos() {
    const [{ data: tiposInm }, { data: tiposTrans }, { data: zonasData }] = await Promise.all([
      supabase.from('tipos_inmueble').select('id, nombre').order('id'),
      supabase.from('tipos_transaccion').select('id, nombre').order('id'),
      supabase.from('zonas').select('id, nombre').order('nombre'),
    ]);
    setTiposInmueble(tiposInm || []);
    setTiposTransaccion(tiposTrans || []);
    setZonas(zonasData || []);
  }

  async function cargarMaterial() {
    setCargando(true);
    const { data, error: errorCarga } = await supabase
      .from('material_redes')
      .select(
        `id, nombre, tipo_transaccion_id, tipo_inmueble_id, zona_id, moneda, precio, copy,
         imagenes:material_redes_imagenes(id, tipo, url, ruta_storage, orden)`
      )
      .eq('id', materialId)
      .maybeSingle();

    if (errorCarga || !data) {
      setError('No se encontró el inmueble.');
      setCargando(false);
      return;
    }

    setNombre(data.nombre || '');
    setTipoTransaccionId(data.tipo_transaccion_id || '');
    setTipoInmuebleId(data.tipo_inmueble_id || '');
    setZonaId(data.zona_id || '');
    setMoneda(data.moneda || 'usd');
    setPrecio(data.precio != null ? String(data.precio) : '');
    setCopy(data.copy || '');

    const imagenes = (data.imagenes || []).sort((a, b) => a.orden - b.orden);
    const aItem = (img) => ({ clave: `db-${img.id}`, id: img.id, url: img.url, ruta_storage: img.ruta_storage });
    setArtes(imagenes.filter((i) => i.tipo === 'arte').map(aItem));
    setFotos(imagenes.filter((i) => i.tipo === 'foto').map(aItem));
    setCargando(false);
  }

  function agregarArchivos(fileList, setLista) {
    const nuevos = Array.from(fileList || []).map((archivo, i) => ({
      clave: `nuevo-${Date.now()}-${i}`,
      archivo,
      url: URL.createObjectURL(archivo),
    }));
    setLista((prev) => [...prev, ...nuevos]);
  }

  function quitar(item, setLista) {
    if (item.id) setQuitadas((prev) => [...prev, item]);
    setLista((prev) => prev.filter((x) => x.clave !== item.clave));
  }

  function mover(indice, direccion, setLista) {
    setLista((prev) => {
      const destino = indice + direccion;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  // Nombres con tildes, espacios o ñ dan error en Supabase Storage.
  function nombreArchivoSeguro(nombreOriginal) {
    return nombreOriginal
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .toLowerCase();
  }

  async function guardarImagenes(id, lista, tipo) {
    for (let orden = 0; orden < lista.length; orden++) {
      const item = lista[orden];
      if (item.archivo) {
        const ruta = `material-redes/${id}/${tipo}s/${Date.now()}-${orden}-${nombreArchivoSeguro(item.archivo.name)}`;
        const { error: errorUpload } = await supabase.storage.from(BUCKET).upload(ruta, item.archivo);
        if (errorUpload) throw errorUpload;

        const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
        const { error: errorInsert } = await supabase.from('material_redes_imagenes').insert({
          material_id: id,
          tipo,
          url: urlPublica.publicUrl,
          ruta_storage: ruta,
          orden,
        });
        if (errorInsert) throw errorInsert;
      } else {
        const { error: errorOrden } = await supabase
          .from('material_redes_imagenes')
          .update({ orden })
          .eq('id', item.id);
        if (errorOrden) throw errorOrden;
      }
    }
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) {
      setError('El nombre del inmueble es obligatorio.');
      return;
    }

    setGuardando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        tipo_transaccion_id: tipoTransaccionId || null,
        tipo_inmueble_id: tipoInmuebleId || null,
        zona_id: zonaId || null,
        moneda,
        precio: precio.trim() ? Number(precio.replace(/[^\d.]/g, '')) : null,
        copy: copy.trim() || null,
      };

      let id = materialId;
      if (esEdicion) {
        // Si la seguridad (RLS) no permite editar, Supabase no da error: devuelve 0 filas.
        const { data: actualizadas, error: errorUpdate } = await supabase
          .from('material_redes')
          .update(datos)
          .eq('id', id)
          .select('id');
        if (errorUpdate) throw errorUpdate;
        if (!actualizadas || actualizadas.length === 0) {
          throw new Error('No tenés permiso para editar este inmueble.');
        }
      } else {
        const { data: creado, error: errorInsert } = await supabase
          .from('material_redes')
          .insert(datos)
          .select('id')
          .single();
        if (errorInsert) throw errorInsert;
        id = creado.id;
      }

      if (quitadas.length > 0) {
        const { error: errorBorrar } = await supabase
          .from('material_redes_imagenes')
          .delete()
          .in('id', quitadas.map((q) => q.id));
        if (errorBorrar) throw errorBorrar;
        // Si el bucket no permite borrar, el archivo queda huérfano pero ya no se muestra.
        await supabase.storage.from(BUCKET).remove(quitadas.map((q) => q.ruta_storage));
      }

      await guardarImagenes(id, artes, 'arte');
      await guardarImagenes(id, fotos, 'foto');

      router.push('/redes-sociales');
    } catch (err) {
      setError(err.message || 'Error al guardar.');
      setGuardando(false);
    }
  }

  function renderGaleria(lista, setLista, tipo) {
    return (
      <div className={estilos.galeria}>
        {lista.map((item, i) => (
          <div key={item.clave} className={estilos.miniatura}>
            <img src={item.url} alt={`${tipo === 'arte' ? 'Arte' : 'Fotografía'} ${i + 1}`} />
            {tipo === 'arte' && i === 0 && <span className={estilos.etiquetaCaratula}>Carátula</span>}
            <div className={estilos.miniaturaAcciones}>
              <button
                type="button"
                className={estilos.miniBoton}
                onClick={() => mover(i, -1, setLista)}
                disabled={i === 0}
                aria-label="Mover antes"
              >
                ‹
              </button>
              <button type="button" className={estilos.miniBoton} onClick={() => quitar(item, setLista)} aria-label="Quitar">
                ✕
              </button>
              <button
                type="button"
                className={estilos.miniBoton}
                onClick={() => mover(i, 1, setLista)}
                disabled={i === lista.length - 1}
                aria-label="Mover después"
              >
                ›
              </button>
            </div>
          </div>
        ))}
        <label className={estilos.agregarArchivo}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Agregar
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              agregarArchivos(e.target.files, setLista);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    );
  }

  if (cargando) return <p className={estilos.mensaje}>Cargando...</p>;

  return (
    <form onSubmit={handleGuardar} className={estilos.formulario}>
      <section className={estilos.seccion}>
        <h2 className={estilos.seccionTitulo}>Datos del inmueble</h2>
        <label className={estilos.campo}>
          Nombre del inmueble
          <input className={estilos.control} type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>

        <div className={estilos.filaDos}>
          <label className={estilos.campo}>
            Transacción
            <select className={estilos.control} value={tipoTransaccionId} onChange={(e) => setTipoTransaccionId(e.target.value)}>
              <option value="">Elegir…</option>
              {tiposTransaccion.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </label>
          <label className={estilos.campo}>
            Tipo
            <select className={estilos.control} value={tipoInmuebleId} onChange={(e) => setTipoInmuebleId(e.target.value)}>
              <option value="">Elegir…</option>
              {tiposInmueble.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <label className={estilos.campo}>
          Zona
          <select className={estilos.control} value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
            <option value="">Elegir…</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>
        </label>

        <div className={estilos.filaMoneda}>
          <label className={estilos.campo}>
            Moneda
            <select className={estilos.control} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="usd">US$</option>
              <option value="bob">Bs</option>
            </select>
          </label>
          <label className={estilos.campo}>
            Precio
            <input
              className={estilos.control}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2 className={estilos.seccionTitulo}>Artes</h2>
        <p className={estilos.ayuda}>Podés subir varios. El primero es la carátula del carrusel; usá las flechas para cambiar el orden.</p>
        {renderGaleria(artes, setArtes, 'arte')}
      </section>

      <section className={estilos.seccion}>
        <h2 className={estilos.seccionTitulo}>Fotografías</h2>
        <p className={estilos.ayuda}>Aparecen en el carrusel después de los artes.</p>
        {renderGaleria(fotos, setFotos, 'foto')}
      </section>

      <section className={estilos.seccion}>
        <label className={estilos.campo}>
          <span className={estilos.seccionTitulo}>Copy</span>
          <textarea
            className={estilos.control}
            rows={7}
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            placeholder="Texto para la publicación en redes…"
          />
        </label>
      </section>

      {error && <p className={estilos.error}>{error}</p>}

      <button type="submit" className={estilos.btnGuardar} disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
