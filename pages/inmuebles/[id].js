import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

const BUCKET = 'documentos';

export default function DetalleInmueble() {
  const router = useRouter();
  const { id } = router.query;
  const { cargando: cargandoUsuario, sesion, usuario, rolNombre } = useUsuarioActual();

  const [inmueble, setInmueble] = useState(null);
  const [zonas, setZonas] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [artes, setArtes] = useState([]);
  const [copys, setCopys] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Formulario de datos
  const [zonaId, setZonaId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [porcentajeComision, setPorcentajeComision] = useState('');

  const [nuevoCopy, setNuevoCopy] = useState('');
  const [tipoArteNuevo, setTipoArteNuevo] = useState('resumen');

  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [subiendoArte, setSubiendoArte] = useState(false);
  const [guardandoCopy, setGuardandoCopy] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || cargandoUsuario) return;
    if (!sesion) {
      router.replace('/login');
      return;
    }
    cargarTodo();
  }, [id, cargandoUsuario, sesion]);

  async function cargarTodo() {
    setCargando(true);

    const { data: inm } = await supabase
      .from('inmuebles')
      .select(
        `id, ubicacion, latitud, longitud, precio_venta, porcentaje_comision, estado,
         zona_id, dimensiones, dormitorios, banos, garajes, descripcion,
         tipo_inmueble:tipos_inmueble(nombre),
         tipo_transaccion:tipos_transaccion(nombre),
         propietario:propietarios(nombre, telefono),
         captador:usuarios(nombre, email)`
      )
      .eq('id', id)
      .maybeSingle();

    const { data: zonasData } = await supabase.from('zonas').select('id, nombre').order('id');
    const { data: fotosData } = await supabase
      .from('fotografias_inmueble')
      .select('id, url, orden')
      .eq('inmueble_id', id)
      .order('orden');
    const { data: artesData } = await supabase
      .from('artes_inmueble')
      .select('id, url, tipo, fecha_carga')
      .eq('inmueble_id', id)
      .order('fecha_carga', { ascending: false });
    const { data: copysData } = await supabase
      .from('copy_redes')
      .select('id, texto, fecha_carga')
      .eq('inmueble_id', id)
      .order('fecha_carga', { ascending: false });

    setInmueble(inm);
    setZonas(zonasData || []);
    setFotos(fotosData || []);
    setArtes(artesData || []);
    setCopys(copysData || []);

    if (inm) {
      setZonaId(inm.zona_id || '');
      setUbicacion(inm.ubicacion || '');
      setLatitud(inm.latitud || '');
      setLongitud(inm.longitud || '');
      setPrecioVenta(inm.precio_venta || '');
      setPorcentajeComision(inm.porcentaje_comision || '');
    }

    setCargando(false);
  }

  async function handleGuardarDatos(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setGuardandoDatos(true);
    try {
      const { error: errorUpdate } = await supabase
        .from('inmuebles')
        .update({
          zona_id: zonaId || null,
          ubicacion,
          latitud: latitud || null,
          longitud: longitud || null,
          precio_venta: precioVenta || null,
          porcentaje_comision: porcentajeComision || null,
        })
        .eq('id', id);

      if (errorUpdate) throw errorUpdate;
      setMensaje('Datos del inmueble actualizados.');
      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al guardar los datos.');
    } finally {
      setGuardandoDatos(false);
    }
  }

  async function handleSubirFoto(file) {
    if (!file) return;
    setError('');
    setSubiendoFoto(true);
    try {
      const ruta = `inmuebles/${id}/fotos/${Date.now()}-${file.name}`;
      const { error: errorUpload } = await supabase.storage.from(BUCKET).upload(ruta, file);
      if (errorUpload) throw errorUpload;

      const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

      const { error: errorInsert } = await supabase.from('fotografias_inmueble').insert({
        inmueble_id: id,
        url: urlPublica.publicUrl,
        orden: fotos.length,
      });
      if (errorInsert) throw errorInsert;

      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al subir la fotografía.');
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function handleSubirArte(file) {
    if (!file) return;
    setError('');
    setSubiendoArte(true);
    try {
      const ruta = `inmuebles/${id}/artes/${tipoArteNuevo}-${Date.now()}-${file.name}`;
      const { error: errorUpload } = await supabase.storage.from(BUCKET).upload(ruta, file);
      if (errorUpload) throw errorUpload;

      const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

      const { error: errorInsert } = await supabase.from('artes_inmueble').insert({
        inmueble_id: id,
        url: urlPublica.publicUrl,
        tipo: tipoArteNuevo,
        autor_id: usuario ? usuario.id : null,
      });
      if (errorInsert) throw errorInsert;

      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al subir el arte.');
    } finally {
      setSubiendoArte(false);
    }
  }

  async function handleGuardarCopy(e) {
    e.preventDefault();
    if (!nuevoCopy.trim()) return;
    setError('');
    setGuardandoCopy(true);
    try {
      const { error: errorInsert } = await supabase.from('copy_redes').insert({
        inmueble_id: id,
        texto: nuevoCopy,
        autor_id: usuario ? usuario.id : null,
      });
      if (errorInsert) throw errorInsert;

      setNuevoCopy('');
      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al guardar el copy.');
    } finally {
      setGuardandoCopy(false);
    }
  }

  if (cargandoUsuario || cargando) {
    return (
      <div className="container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!inmueble) {
    return (
      <div className="container">
        <p>No se encontró el inmueble.</p>
        <a href="/inmuebles" className="btn-secondary">Volver</a>
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
        <h2>
          {inmueble.tipo_inmueble?.nombre} en {inmueble.tipo_transaccion?.nombre} — #{inmueble.id}
        </h2>
        <span className="badge">{inmueble.estado}</span>

        {mensaje && (
          <div className="success-box" style={{ margin: '16px 0' }}>
            <p style={{ margin: 0 }}>{mensaje}</p>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}

        {/* DATOS GENERALES */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="form-section">
            <h3>Resumen</h3>
            <p><b>Propietario:</b> {inmueble.propietario?.nombre}</p>
            <p><b>Captador:</b> {inmueble.captador?.nombre || inmueble.captador?.email || '—'}</p>
            <p><b>Dimensiones:</b> {inmueble.dimensiones || '—'}</p>
            <p>
              <b>Dormitorios:</b> {inmueble.dormitorios ?? '—'} ·{' '}
              <b>Baños:</b> {inmueble.banos ?? '—'} ·{' '}
              <b>Garajes:</b> {inmueble.garajes ?? '—'}
            </p>
            <p><b>Descripción:</b> {inmueble.descripcion || '—'}</p>
          </div>
        </div>

        {/* ZONA, UBICACION, PRECIO */}
        <div className="card">
          <h3 style={{ color: '#06416A', marginTop: 0 }}>Zona, ubicación y precio</h3>
          <form onSubmit={handleGuardarDatos}>
            <div className="form-row">
              <div>
                <label>Zona</label>
                <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                  <option value="">Selecciona...</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>{z.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Ubicación (dirección o referencia)</label>
                <input type="text" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Latitud (opcional)</label>
                <input type="text" value={latitud} onChange={(e) => setLatitud(e.target.value)} placeholder="-17.7833" />
              </div>
              <div>
                <label>Longitud (opcional)</label>
                <input type="text" value={longitud} onChange={(e) => setLongitud(e.target.value)} placeholder="-63.1821" />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Precio de venta ($us)</label>
                <input type="number" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
              </div>
              <div>
                <label>% de comisión</label>
                <input type="number" step="0.01" value={porcentajeComision} onChange={(e) => setPorcentajeComision(e.target.value)} />
              </div>
            </div>

            <button type="submit" disabled={guardandoDatos}>
              {guardandoDatos ? 'Guardando...' : 'Guardar datos'}
            </button>
          </form>
        </div>

        {/* FOTOGRAFIAS */}
        <div className="card">
          <h3 style={{ color: '#06416A', marginTop: 0 }}>Fotografías</h3>
          <p className="solo-lectura-nota">Sube las fotos reales del inmueble (las toma el asesor en la visita).</p>

          <div className="galeria">
            {fotos.map((f) => (
              <img key={f.id} src={f.url} alt="Foto del inmueble" />
            ))}
          </div>

          <div className="file-field">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleSubirFoto(e.target.files[0])}
              disabled={subiendoFoto}
            />
            {subiendoFoto && <p style={{ fontSize: 12 }}>Subiendo...</p>}
          </div>
        </div>

        {/* ARTES */}
        <div className="card">
          <h3 style={{ color: '#06416A', marginTop: 0 }}>Artes para redes sociales</h3>
          <p className="solo-lectura-nota">
            Piezas ya trabajadas por diseño (Camila), listas para publicar. Debe haber al
            menos un arte de resumen.
          </p>

          <div className="galeria">
            {artes.map((a) => (
              <div key={a.id} style={{ textAlign: 'center' }}>
                <span className="tag-tipo">{a.tipo}</span>
                <br />
                <img src={a.url} alt={`Arte ${a.tipo}`} />
              </div>
            ))}
          </div>

          <div className="form-row">
            <div>
              <label>Tipo de arte</label>
              <select value={tipoArteNuevo} onChange={(e) => setTipoArteNuevo(e.target.value)}>
                <option value="resumen">Resumen</option>
                <option value="apoyo">Apoyo</option>
              </select>
            </div>
            <div className="file-field" style={{ marginTop: 20 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleSubirArte(e.target.files[0])}
                disabled={subiendoArte}
              />
              {subiendoArte && <p style={{ fontSize: 12 }}>Subiendo...</p>}
            </div>
          </div>
        </div>

        {/* COPY */}
        <div className="card">
          <h3 style={{ color: '#06416A', marginTop: 0 }}>Copy para redes sociales</h3>

          {copys.length > 0 && (
            <div className="form-section">
              <label>Último copy guardado</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{copys[0].texto}</p>
            </div>
          )}

          <form onSubmit={handleGuardarCopy}>
            <label>Nuevo copy</label>
            <textarea
              value={nuevoCopy}
              onChange={(e) => setNuevoCopy(e.target.value)}
              placeholder="Texto pensado para el cliente, no solo una ficha técnica..."
            />
            <button type="submit" disabled={guardandoCopy}>
              {guardandoCopy ? 'Guardando...' : 'Guardar copy'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
