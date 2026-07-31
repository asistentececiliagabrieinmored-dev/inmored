import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { useUsuarioActual } from '../../lib/useUsuarioActual';

const DOC_LABELS = {
  alodial: 'Folio real / Alodial',
  ci_propietario: 'Carnet de identidad del propietario',
  catastral: 'Certificado catastral',
  testimonio: 'Testimonio de propiedad',
  plano_uso_suelo: 'Plano de uso de suelo',
  analisis_precio_excel: 'Análisis de precio de venta (Excel)',
};

export default function DetalleSolicitud() {
  const router = useRouter();
  const { id } = router.query;
  const { cargando: cargandoUsuario, sesion, usuario, rolNombre } = useUsuarioActual();

  const [solicitud, setSolicitud] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [observaciones, setObservaciones] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [mostrarDevolver, setMostrarDevolver] = useState(false);
  const [mostrarRechazar, setMostrarRechazar] = useState(false);
  const [textoObservacion, setTextoObservacion] = useState('');
  const [textoMotivo, setTextoMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

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

    const { data: sol } = await supabase
      .from('solicitudes_captacion')
      .select(
        `id, estado, fecha_envio, dimensiones, dormitorios, banos, garajes, descripcion,
         motivo_rechazo, propietario_id, tipo_inmueble_id, tipo_transaccion_id,
         nombre_inmueble, ubicacion, precio_referencia,
         tipo_inmueble:tipos_inmueble(nombre),
         tipo_transaccion:tipos_transaccion(nombre),
         propietario:propietarios(nombre, ci, telefono),
         asesor:usuarios(id, nombre, email)`
      )
      .eq('id', id)
      .maybeSingle();

    const { data: docs } = await supabase
      .from('documentos_solicitud')
      .select('id, tipo_documento, archivo_url, fecha_carga')
      .eq('solicitud_id', id);
    
      const documentosConUrl = await Promise.all(
      (docs || []).map(async (doc) => {
        const { data: firmada } = await supabase.storage
          .from('documentos-privados')
          .createSignedUrl(doc.archivo_url, 3600);
        return { ...doc, url_temporal: firmada?.signedUrl || null };
      })
    );
    const { data: obs } = await supabase
      .from('observaciones_captacion')
      .select('id, observacion, ronda, fecha, gerente:usuarios(nombre)')
      .eq('solicitud_id', id)
      .order('fecha', { ascending: true });

    setSolicitud(sol);
    setDocumentos(documentosConUrl);
    setObservaciones(obs || []);
    setCargando(false);
  }

  async function handleAprobar() {
    setError('');
    setProcesando(true);
    try {
      const { error: errorInmueble } = await supabase.from('inmuebles').insert({
        solicitud_id: solicitud.id,
        propietario_id: solicitud.propietario_id,
        asesor_captador_id: solicitud.asesor.id,
        tipo_inmueble_id: solicitud.tipo_inmueble_id,
        tipo_transaccion_id: solicitud.tipo_transaccion_id,
        dimensiones: solicitud.dimensiones,
        dormitorios: solicitud.dormitorios,
        banos: solicitud.banos,
        garajes: solicitud.garajes,
        descripcion: solicitud.descripcion,
        nombre: solicitud.nombre_inmueble,
        ubicacion: solicitud.ubicacion,
        precio_venta: solicitud.precio_referencia,
        estado: 'disponible',
      });
      if (errorInmueble) throw errorInmueble;

      const { error: errorUpdate } = await supabase
        .from('solicitudes_captacion')
        .update({ estado: 'aprobado' })
        .eq('id', solicitud.id);
      if (errorUpdate) throw errorUpdate;

      setMensajeExito(
        'Solicitud aprobada. El inmueble ya fue creado en el sistema (queda pendiente que el asesor complete zona, ubicación, precio y fotos).'
      );
      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al aprobar la solicitud.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleDevolver() {
    if (!textoObservacion.trim()) {
      setError('Escribe la observación antes de devolver la solicitud.');
      return;
    }
    setError('');
    setProcesando(true);
    try {
      const rondaSiguiente = observaciones.length + 1;

      const { error: errorObs } = await supabase.from('observaciones_captacion').insert({
        solicitud_id: solicitud.id,
        gerente_id: usuario.id,
        observacion: textoObservacion,
        ronda: rondaSiguiente,
      });
      if (errorObs) throw errorObs;

      const { error: errorUpdate } = await supabase
        .from('solicitudes_captacion')
        .update({ estado: 'devuelto' })
        .eq('id', solicitud.id);
      if (errorUpdate) throw errorUpdate;

      setMensajeExito('Solicitud devuelta al asesor con tu observación.');
      setMostrarDevolver(false);
      setTextoObservacion('');
      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al devolver la solicitud.');
    } finally {
      setProcesando(false);
    }
  }

  async function handleRechazar() {
    if (!textoMotivo.trim()) {
      setError('Escribe el motivo antes de rechazar la solicitud.');
      return;
    }
    setError('');
    setProcesando(true);
    try {
      const { error: errorUpdate } = await supabase
        .from('solicitudes_captacion')
        .update({ estado: 'rechazado', motivo_rechazo: textoMotivo })
        .eq('id', solicitud.id);
      if (errorUpdate) throw errorUpdate;

      setMensajeExito('Solicitud rechazada.');
      setMostrarRechazar(false);
      cargarTodo();
    } catch (err) {
      setError(err.message || 'Error al rechazar la solicitud.');
    } finally {
      setProcesando(false);
    }
  }

  if (cargandoUsuario || cargando) {
    return (
      <div className="container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (rolNombre && rolNombre !== 'gerente_operaciones') {
    return (
      <div className="container">
        <p>Esta sección es solo para el gerente de operaciones.</p>
        <a href="/inmuebles" className="btn-secondary">Volver</a>
      </div>
    );
  }

  if (!solicitud) {
    return (
      <div className="container">
        <p>No se encontró la solicitud.</p>
        <a href="/aprobaciones" className="btn-secondary">Volver</a>
      </div>
    );
  }

  const puedeActuar = solicitud.estado === 'pendiente' || solicitud.estado === 'devuelto';

  return (
    <div>
      <div className="top-bar">
        <h1>INMORED</h1>
        <a href="/aprobaciones" className="logout-link" style={{ color: 'white' }}>
          Volver
        </a>
      </div>

      <div className="container">
        <h2>Solicitud de captación #{solicitud.id}</h2>
        <span className="badge">{solicitud.estado}</span>

        {mensajeExito && (
          <div className="success-box" style={{ margin: '16px 0' }}>
            <p style={{ margin: 0 }}>{mensajeExito}</p>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}

        <div className="card" style={{ marginTop: 16 }}>
          <div className="form-section">
            <h3>Propietario</h3>
            <p><b>Nombre:</b> {solicitud.propietario?.nombre}</p>
            <p><b>CI:</b> {solicitud.propietario?.ci || '—'}</p>
            <p><b>Teléfono:</b> {solicitud.propietario?.telefono || '—'}</p>
          </div>

          <div className="form-section">
            <h3>Inmueble</h3>
            <p><b>Tipo:</b> {solicitud.tipo_inmueble?.nombre}</p>
            <p><b>Transacción:</b> {solicitud.tipo_transaccion?.nombre}</p>
            <p><b>Dimensiones:</b> {solicitud.dimensiones || '—'}</p>
            <p>
              <b>Dormitorios:</b> {solicitud.dormitorios ?? '—'} ·{' '}
              <b>Baños:</b> {solicitud.banos ?? '—'} ·{' '}
              <b>Garajes:</b> {solicitud.garajes ?? '—'}
            </p>
            <p><b>Descripción:</b> {solicitud.descripcion || '—'}</p>
            <p><b>Asesor:</b> {solicitud.asesor?.nombre || solicitud.asesor?.email}</p>
          </div>

          <div className="form-section">
            <h3>Documentos</h3>
            {documentos.length === 0 && <p>No se adjuntaron documentos.</p>}
             {documentos.map((doc) => (
              <p key={doc.id}>
                {doc.url_temporal ? (
                  <a href={doc.url_temporal} target="_blank" rel="noreferrer">
                    {DOC_LABELS[doc.tipo_documento] || doc.tipo_documento}
                  </a>
                ) : (
                  <span>{DOC_LABELS[doc.tipo_documento] || doc.tipo_documento} (no se pudo generar el enlace)</span>
                )}
              </p>
            ))}
               
          </div>

          {observaciones.length > 0 && (
            <div className="form-section">
              <h3>Historial de observaciones</h3>
              {observaciones.map((o) => (
                <p key={o.id} style={{ fontSize: 13, color: '#555' }}>
                  <b>Ronda {o.ronda}</b> — {o.gerente?.nombre || 'Gerente'} (
                  {new Date(o.fecha).toLocaleString('es-BO')}):<br />
                  {o.observacion}
                </p>
              ))}
            </div>
          )}

          {solicitud.motivo_rechazo && (
            <div className="form-section">
              <h3>Motivo de rechazo</h3>
              <p>{solicitud.motivo_rechazo}</p>
            </div>
          )}
        </div>

        {puedeActuar && (
          <div className="card">
            <h3 style={{ color: '#06416A', marginTop: 0 }}>Acciones</h3>

            {!mostrarDevolver && !mostrarRechazar && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAprobar} disabled={procesando}>
                  {procesando ? 'Procesando...' : 'Aprobar'}
                </button>
                <button
                  onClick={() => setMostrarDevolver(true)}
                  disabled={procesando}
                  style={{ background: '#b58900' }}
                >
                  Devolver
                </button>
                <button
                  onClick={() => setMostrarRechazar(true)}
                  disabled={procesando}
                  style={{ background: '#b3261e' }}
                >
                  Rechazar
                </button>
              </div>
            )}

            {mostrarDevolver && (
              <div>
                <label>Observación para el asesor</label>
                <textarea
                  value={textoObservacion}
                  onChange={(e) => setTextoObservacion(e.target.value)}
                  placeholder="Ej: Falta el certificado catastral, precio de comisión a confirmar..."
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleDevolver} disabled={procesando}>
                    {procesando ? 'Enviando...' : 'Confirmar devolución'}
                  </button>
                  <button
                    onClick={() => setMostrarDevolver(false)}
                    className="btn-secondary"
                    style={{ width: 'auto' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {mostrarRechazar && (
              <div>
                <label>Motivo del rechazo</label>
                <textarea
                  value={textoMotivo}
                  onChange={(e) => setTextoMotivo(e.target.value)}
                  placeholder="Ej: Inmueble ya captado por otra inmobiliaria..."
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleRechazar} disabled={procesando}>
                    {procesando ? 'Enviando...' : 'Confirmar rechazo'}
                  </button>
                  <button
                    onClick={() => setMostrarRechazar(false)}
                    className="btn-secondary"
                    style={{ width: 'auto' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
