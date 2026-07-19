import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

// Documentos requeridos según el tipo de transacción (nombre en la tabla tipos_transaccion)
const DOCUMENTOS_POR_TRANSACCION = {
  venta: [
    { tipo: 'alodial', label: 'Folio real / Alodial', accept: '.pdf,image/*' },
    { tipo: 'ci_propietario', label: 'Carnet de identidad del propietario', accept: '.pdf,image/*' },
    { tipo: 'catastral', label: 'Certificado catastral', accept: '.pdf,image/*' },
    { tipo: 'testimonio', label: 'Testimonio de propiedad', accept: '.pdf,image/*' },
    { tipo: 'plano_uso_suelo', label: 'Plano de uso de suelo', accept: '.pdf,image/*' },
    { tipo: 'analisis_precio_excel', label: 'Análisis de precio de venta (Excel)', accept: '.xlsx,.xls' },
  ],
  alquiler: [
    { tipo: 'alodial', label: 'Folio real / Alodial', accept: '.pdf,image/*' },
    { tipo: 'ci_propietario', label: 'Carnet de identidad del propietario', accept: '.pdf,image/*' },
  ],
  anticretico: [
    { tipo: 'alodial', label: 'Folio real / Alodial', accept: '.pdf,image/*' },
    { tipo: 'ci_propietario', label: 'Carnet de identidad del propietario', accept: '.pdf,image/*' },
  ],
};

const BUCKET = 'documentos';

export default function NuevaSolicitud() {
  const router = useRouter();

  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [usuario, setUsuario] = useState(null);

  const [tiposInmueble, setTiposInmueble] = useState([]);
  const [tiposTransaccion, setTiposTransaccion] = useState([]);

  const [propietarioNombre, setPropietarioNombre] = useState('');
  const [propietarioCi, setPropietarioCi] = useState('');
  const [propietarioTelefono, setPropietarioTelefono] = useState('');

  const [tipoInmuebleId, setTipoInmuebleId] = useState('');
  const [tipoTransaccionId, setTipoTransaccionId] = useState('');
  const [tipoTransaccionNombre, setTipoTransaccionNombre] = useState('');

  const [dimensiones, setDimensiones] = useState('');
  const [dormitorios, setDormitorios] = useState('');
  const [banos, setBanos] = useState('');
  const [garajes, setGarajes] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const [archivos, setArchivos] = useState({});

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  useEffect(() => {
    async function iniciar() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace('/login');
        return;
      }
      setUsuario(sessionData.session.user);

      const { data: tiposInm } = await supabase
        .from('tipos_inmueble')
        .select('id, nombre')
        .order('id');
      const { data: tiposTrans } = await supabase
        .from('tipos_transaccion')
        .select('id, nombre')
        .order('id');

      setTiposInmueble(tiposInm || []);
      setTiposTransaccion(tiposTrans || []);
      setCargandoSesion(false);
    }
    iniciar();
  }, [router]);

  function handleTipoTransaccionChange(e) {
    const id = e.target.value;
    setTipoTransaccionId(id);
    const encontrado = tiposTransaccion.find((t) => String(t.id) === String(id));
    setTipoTransaccionNombre(encontrado ? encontrado.nombre : '');
    setArchivos({});
  }

  function handleArchivoChange(tipoDocumento, file) {
    setArchivos((prev) => ({ ...prev, [tipoDocumento]: file }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!propietarioNombre || !tipoInmuebleId || !tipoTransaccionId) {
      setError('Completa al menos el nombre del propietario, tipo de inmueble y tipo de transacción.');
      return;
    }

    setEnviando(true);

    try {
      // 1. Buscar usuario en tabla "usuarios" a partir del email de sesión
      const { data: usuarioFila, error: errorUsuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', usuario.email)
        .maybeSingle();

      if (errorUsuario || !usuarioFila) {
        throw new Error(
          'Tu usuario de login todavía no está vinculado en la tabla "usuarios" de la base de datos. Avisa a Claude para vincularlo.'
        );
      }

      // 2. Crear propietario
      const { data: propietario, error: errorPropietario } = await supabase
        .from('propietarios')
        .insert({
          nombre: propietarioNombre,
          ci: propietarioCi,
          telefono: propietarioTelefono,
        })
        .select()
        .single();

      if (errorPropietario) throw errorPropietario;

      // 3. Crear solicitud de captación
      const fechaLimite = new Date();
      fechaLimite.setHours(fechaLimite.getHours() + 48);

      const { data: solicitud, error: errorSolicitud } = await supabase
        .from('solicitudes_captacion')
        .insert({
          asesor_id: usuarioFila.id,
          propietario_id: propietario.id,
          tipo_inmueble_id: tipoInmuebleId,
          tipo_transaccion_id: tipoTransaccionId,
          dimensiones,
          dormitorios: dormitorios || null,
          banos: banos || null,
          garajes: garajes || null,
          descripcion,
          estado: 'pendiente',
          fecha_limite_revision: fechaLimite.toISOString(),
        })
        .select()
        .single();

      if (errorSolicitud) throw errorSolicitud;

      // 4. Subir documentos (los que se hayan adjuntado)
      const documentosRequeridos = DOCUMENTOS_POR_TRANSACCION[tipoTransaccionNombre] || [];

      for (const doc of documentosRequeridos) {
        const file = archivos[doc.tipo];
        if (!file) continue;

        const rutaArchivo = `solicitudes/${solicitud.id}/${doc.tipo}-${Date.now()}-${file.name}`;

        const { error: errorUpload } = await supabase.storage
          .from(BUCKET)
          .upload(rutaArchivo, file);

        if (errorUpload) {
          throw new Error(`Error al subir "${doc.label}": ${errorUpload.message}`);
        }

        const { data: urlPublica } = supabase.storage.from(BUCKET).getPublicUrl(rutaArchivo);

        const { error: errorDoc } = await supabase.from('documentos_solicitud').insert({
          solicitud_id: solicitud.id,
          tipo_documento: doc.tipo,
          archivo_url: urlPublica.publicUrl,
        });

        if (errorDoc) throw errorDoc;
      }

      setExito(true);
    } catch (err) {
      setError(err.message || 'Ocurrió un error al guardar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoSesion) {
    return (
      <div className="container">
        <p>Cargando...</p>
      </div>
    );
  }

  if (exito) {
    return (
      <div>
        <div className="top-bar">
          <h1>INMORED</h1>
        </div>
        <div className="container">
          <div className="success-box">
            <h2>Solicitud enviada</h2>
            <p>
              Tu solicitud de captación quedó registrada con estado <b>pendiente</b>. El
              gerente de operaciones tiene 48 horas para revisarla.
            </p>
            <a href="/inmuebles" className="btn-secondary">
              Volver a inmuebles
            </a>
          </div>
        </div>
      </div>
    );
  }

  const documentosRequeridos = DOCUMENTOS_POR_TRANSACCION[tipoTransaccionNombre] || [];

  return (
    <div>
      <div className="top-bar">
        <h1>INMORED</h1>
        <a href="/inmuebles" className="logout-link" style={{ color: 'white' }}>
          Volver
        </a>
      </div>

      <div className="container">
        <h2>Nueva solicitud de captación</h2>
        <p style={{ color: '#666', fontSize: 13, marginTop: -8 }}>
          Completa los datos de la reunión con el propietario. El gerente de operaciones
          revisará esta solicitud antes de que el inmueble quede publicado.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <p className="error-text">{error}</p>}

          <div className="card">
            <div className="form-section">
              <h3>Datos del propietario</h3>
              <label>Nombre completo</label>
              <input
                type="text"
                value={propietarioNombre}
                onChange={(e) => setPropietarioNombre(e.target.value)}
                required
              />
              <div className="form-row">
                <div>
                  <label>Carnet de identidad</label>
                  <input
                    type="text"
                    value={propietarioCi}
                    onChange={(e) => setPropietarioCi(e.target.value)}
                  />
                </div>
                <div>
                  <label>Teléfono</label>
                  <input
                    type="text"
                    value={propietarioTelefono}
                    onChange={(e) => setPropietarioTelefono(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Datos del inmueble</h3>
              <div className="form-row">
                <div>
                  <label>Tipo de inmueble</label>
                  <select
                    value={tipoInmuebleId}
                    onChange={(e) => setTipoInmuebleId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona...</option>
                    {tiposInmueble.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tipo de transacción</label>
                  <select
                    value={tipoTransaccionId}
                    onChange={handleTipoTransaccionChange}
                    required
                  >
                    <option value="">Selecciona...</option>
                    {tiposTransaccion.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label>Dimensiones (ej: 300 m² / 10x30 m)</label>
              <input
                type="text"
                value={dimensiones}
                onChange={(e) => setDimensiones(e.target.value)}
              />

              <div className="form-row">
                <div>
                  <label>Dormitorios</label>
                  <input
                    type="number"
                    min="0"
                    value={dormitorios}
                    onChange={(e) => setDormitorios(e.target.value)}
                  />
                </div>
                <div>
                  <label>Baños</label>
                  <input
                    type="number"
                    min="0"
                    value={banos}
                    onChange={(e) => setBanos(e.target.value)}
                  />
                </div>
              </div>
              <label>Garajes</label>
              <input
                type="number"
                min="0"
                value={garajes}
                onChange={(e) => setGarajes(e.target.value)}
              />

              <label>Descripción / comentarios</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalles adicionales del inmueble..."
              />
            </div>

            {tipoTransaccionNombre && (
              <div className="form-section">
                <h3>Documentos ({tipoTransaccionNombre})</h3>
                {documentosRequeridos.map((doc) => (
                  <div className="file-field" key={doc.tipo}>
                    <label>{doc.label}</label>
                    <input
                      type="file"
                      accept={doc.accept}
                      onChange={(e) => handleArchivoChange(doc.tipo, e.target.files[0])}
                    />
                  </div>
                ))}
                <p style={{ fontSize: 12, color: '#888' }}>
                  Puedes enviar la solicitud aunque falte algún documento y cargarlo
                  después — pero recuerda que el gerente puede devolverla si falta algo
                  clave.
                </p>
              </div>
            )}
          </div>

          <button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar solicitud de captación'}
          </button>
        </form>
      </div>
    </div>
  );
}
