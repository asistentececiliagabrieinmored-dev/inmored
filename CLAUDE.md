# InmoRed — Contexto del proyecto

Este archivo le da contexto a Claude Code sobre InmoRed. Léelo siempre al empezar a trabajar en este repo.

## Qué es InmoRed

InmoRed es una plataforma de gestión inmobiliaria para una agencia pequeña en Santa Cruz de la Sierra, Bolivia. La empresa comercializa inmuebles como intermediaria entre propietarios y compradores/inquilinos. La plataforma cubre el ciclo completo: captación de inmuebles, flujo de aprobación, listados, cierres, cálculo de comisiones y dashboards.

**El dueño/gerente del proyecto (Romano) no tiene background de programación.** Trabaja a través de Claude (chat) y ahora también Claude Code, pero prefiere que cada cambio se le explique en términos claros y que se le pida confirmación antes de aplicar ediciones grandes o irreversibles (especialmente `git push`, cambios de schema en Supabase, o cualquier cosa que toque datos reales).

## Stack técnico

- **Frontend/Backend:** Next.js (Pages Router), desplegado en Vercel
- **Base de datos:** Supabase (Postgres) — acceso vía SQL Editor de Supabase (no hay entorno de desarrollo local con Supabase CLI)
- **Auth:** Supabase Auth, con tabla `usuarios` vinculada vía trigger automático (`trg_vincular_usuario_nuevo`) y función `es_usuario_inmored()` para RLS
- **Storage:** dos buckets —
  - `documentos-privados` (bucket PRIVADO, protegido por `es_usuario_inmored()`): carnets, contratos, documentación legal/sensible. Se debe guardar la **ruta del storage** (no URL pública) en la columna `archivo_url`, y generar URLs firmadas (`createSignedUrl`, expiración 3600s) al momento de leer/mostrar el documento.
  - `documentos` (bucket PÚBLICO): fotos de marketing, artes/copies para redes sociales. Acá sí se usa `getPublicUrl`.
- **Repo:** `github.com/asistentececiliagabrieinmored-dev/inmored`
- **URL en producción:** `inmored-dusky.vercel.app` (dominio personalizado tipo `inmored.com.bo` evaluado pero no decidido aún)

⚠️ **Nunca asumas que un archivo con una constante `BUCKET` maneja documentos sensibles sin verificarlo primero.** Ya hubo un error de este tipo (`carga-historica.js` apuntando al bucket equivocado) que hubo que corregir. `carga-historica.js` maneja solo artes de marketing y debe usar siempre el bucket `documentos` (público).

## Estructura de páginas (Next.js Pages Router)

- `pages/index.js` — redirige según sesión
- `pages/login.js` — login con Supabase Auth
- `pages/inmuebles/index.js` — listado de inmuebles cargados
- `pages/inmuebles/[id].js` — detalle/edición de un inmueble (fotos, artes, copies)
- `pages/inmuebles/nueva-solicitud.js` — formulario para que un asesor cree una solicitud de captación nueva (pasa por flujo de aprobación)
- `pages/inmuebles/carga-historica.js` — carga manual de inmuebles ya existentes (históricos, vendidos/alquilados o aún disponibles). NO pasa por flujo de aprobación.
- `pages/aprobaciones/index.js` — bandeja del gerente de operaciones con las solicitudes (pendiente/devuelto/rechazado/aprobado)
- `pages/aprobaciones/[id].js` — detalle de una solicitud para aprobarla, devolverla (con observación) o rechazarla (con motivo)
- `pages/requerimientos/index.js` — listado de requerimientos (búsquedas activas de clientes), con filtro por estado y botón para cerrarlos
- `pages/requerimientos/nueva.js` — formulario para cargar un requerimiento nuevo; al guardar, busca coincidencias de inmediato (inmuebles propios primero, después referencias externas) y las muestra en pantalla
- `pages/api/telegram-webhook.js` — webhook del bot de Telegram (activación + parsing de referencias externas con Claude Haiku + aviso automático a asesores con requerimientos coincidentes)
- `pages/api/requerimientos/notificar.js` — dado un `requerimientoId`, busca coincidencias y avisa por Telegram al asesor dueño si tiene el bot activado
- `lib/supabaseClient.js` — instancia única del cliente de Supabase
- `lib/supabaseAdmin.js` — cliente de Supabase con la Service Role Key, para rutas de servidor sin sesión de usuario (el webhook del bot)
- `lib/matching.js` — lógica de cruce compartida entre requerimientos, inmuebles propios y referencias externas
- `lib/useUsuarioActual.js` — hook que trae la sesión activa y el rol del usuario desde la tabla `usuarios`

## Roles

- **asesor**: capta inmuebles, sube documentación, gestiona sus propias solicitudes
- **gerente_operaciones**: aprueba/devuelve/rechaza solicitudes de captación

## Convenciones de UI ya establecidas

- **Patrón de tarjeta (cards):** cuando una tarjeta representa un inmueble o una solicitud, el **nombre del inmueble va como título principal** (negrita, ~16px, color `#06416A`), y debajo va la información secundaria (propietario/tipo/ubicación) como subtítulo más chico y gris. Este patrón ya se aplicó en `aprobaciones/index.js` y se está extendiendo a `inmuebles/index.js`.
- Color corporativo principal: `#06416A` (azul InmoRed, ver manual de marca del proyecto)
- El campo `nombre` en la tabla `inmuebles` existe y se propaga desde `solicitudes_captacion.nombre_inmueble` al aprobar una solicitud (ver `handleAprobar` en `aprobaciones/[id].js`). Los inmuebles cargados históricamente también deben tener este campo poblado (en desarrollo).

## Aprendizajes clave (no repetir estos errores)

- **RLS bloqueaba lecturas silenciosamente** en desarrollo temprano — hay que tener cuidado al debuggear problemas de acceso a datos, porque el síntoma es "no devuelve nada" sin error explícito, no un error visible.
- **Distinción ruta de storage vs. URL pública es crítica.** Documentos privados: guardar ruta (`rutaArchivo`), generar signed URL al leer. Nunca guardar `getPublicUrl()` para el bucket privado.
- **Después de crear tablas nuevas en el SQL Editor de Supabase**, correr `NOTIFY pgrst, 'reload schema';` para que la API las reconozca.
- **Los precios inmobiliarios en Santa Cruz deben segmentarse siempre por zona, anillo y calle** — nunca promediar a nivel ciudad. Zonas premium (Equipetrol, Las Palmas) son muy distintas a zonas periféricas/sur.
- Usuarios nuevos de Supabase Auth no aparecen automáticamente en la tabla `usuarios` de la app — requiere INSERT manual (a futuro, los nuevos usuarios quedan cubiertos por el trigger de auto-vinculación).

## Funcionalidades diseñadas pero NO construidas todavía

### Sistema de bot de Telegram + red de referencias externas
Diseño ya definido. Progreso:

- **Schema de referencias/requerimientos**: creado en Supabase (ver `supabase/referencias_externas_y_requerimientos.sql`, corrido el 2026-08-08): tablas `configuracion_sistema`, `referencias_externas`, `fotografias_referencia_externa`, `requerimientos` y `requerimiento_zonas`, con RLS basado en `es_usuario_inmored()`.
- **Schema de activación de Telegram**: SQL listo en `supabase/telegram_bot_activacion.sql` (columnas `telegram_chat_id`/`telegram_activo`/`telegram_acceso_hasta` en `usuarios`, tabla `codigos_activacion_telegram`) — **pendiente de correr en Supabase**.
- **Webhook del bot**: `pages/api/telegram-webhook.js`. Maneja activación por código (con expiración tipo suscripción) y, una vez activado el asesor, guarda cada mensaje reenviado como una fila en `referencias_externas`, parseado con **Claude Haiku 4.5** (`lib/supabaseAdmin.js` usa la Service Role Key para bypassear RLS, porque el bot no tiene sesión de Supabase Auth).
- **Variables de entorno nuevas que hacen falta en Vercel** (además de las de Supabase que ya existen): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (opcional, recomendado), `SUPABASE_SERVICE_ROLE_KEY` (⚠️ nunca con prefijo `NEXT_PUBLIC_`, es server-only), `ANTHROPIC_API_KEY`.
- **Estado: MVP funcionando en producción** (verificado 2026-08-08). Bot creado, variables de entorno cargadas en Vercel, SQL de activación corrido, webhook registrado. Probado de punta a punta con un mensaje real de WhatsApp (anuncio de "Casa en venta - El Dorado Norte"): activación por código OK, parsing con Claude Haiku OK (tipo, transacción, zona — coincidió correctamente con la tabla `zonas` existente —, precio, dimensiones y contacto todos guardados bien).
- **Precio guarda la moneda original** (columna `moneda`, `usd`/`bob`) — no se convierte automáticamente. Se agregó después de detectar que un anuncio en bolivianos ("Bs. 22.000") no guardaba precio porque el prompt original solo aceptaba dólares. Ver `supabase/referencias_externas_moneda.sql`.
- **Matching automático construido** (`lib/matching.js`, `pages/requerimientos/*`, `pages/api/requerimientos/notificar.js`) — **pendiente de correr el SQL y probar en producción**. Orden de búsqueda: primero inmuebles propios (tabla `inmuebles`), después referencias externas. Se dispara en dos direcciones: (1) al cargar un requerimiento nuevo, busca coincidencias existentes al instante y las muestra en pantalla; (2) al llegar una referencia nueva por el bot, busca requerimientos activos que coincidan. En ambos casos, si el asesor dueño del requerimiento tiene Telegram activado, se le avisa por ahí. El precio solo se compara cuando la referencia está en dólares (no se convierte bolivianos). Falta correr `supabase/referencias_externas_dormitorios.sql` en Supabase.
- **Retención diferenciada por tipo de transacción**: venta 60 días, alquiler y anticrético 30 días (`supabase/referencias_externas_retencion_por_tipo.sql`, claves `retencion_dias_referencias_venta` / `retencion_dias_referencias_alquiler_anticretico` en `configuracion_sistema`). La clave original `retencion_dias_referencias_externas` queda como respaldo genérico cuando no se logra identificar el tipo de transacción del mensaje.
- **Filtro de ubicación específica** en requerimientos (`ubicacion_referencia`, texto libre tipo "avenida Beni") — se usa como filtro adicional (`ilike`) sobre `ubicacion` de inmuebles/referencias, además de zonas/presupuesto/dormitorios. Se agregó porque el matching por zona sola devolvía demasiadas coincidencias en requerimientos poco específicos. Ver `supabase/requerimientos_ubicacion_referencia.sql` — **pendiente de correr**.
- **Comandos del bot**: `/ayuda` y `/estado` no se guardan como referencia (antes cualquier texto se guardaba como inmueble, incluso mensajes de prueba).
- **Matching de ubicación con IA** (`lib/matching.js`): el filtro de `ubicacion_referencia` usa Claude Haiku para juzgar coincidencias razonables (sinónimos, abreviaturas, cercanía real entre zonas/anillos), no solo texto literal. Solo se llama a la IA sobre candidatos que ya pasaron los filtros baratos (tipo/zona/presupuesto/dormitorios) y solo si hay un criterio de ubicación cargado — así el costo es proporcional a candidatos razonables, no al inventario total. Si la llamada a Claude falla, cae en un respaldo por comparación de texto (sin acentos, sin abreviaturas) para no dejar el matching sin funcionar.
- **Bot de Telegram y matching probados en producción de punta a punta** (2026-08-08).
- **Pendiente**: correr `referencias_externas_dormitorios.sql`, `referencias_externas_retencion_por_tipo.sql` y `requerimientos_ubicacion_referencia.sql`, generar códigos de activación para el resto de los asesores (ver ejemplo de INSERT en `supabase/telegram_bot_activacion.sql`), y la webapp pública multi-agencia (fuera de alcance por ahora).

- **Tabla `referencias_externas`**: inmuebles compartidos desde grupos de WhatsApp (no captados directamente por InmoRed, sino "vistos" en grupos de intercambio entre inmobiliarias). Campos pensados: retención configurable (tiempo de vida del dato), `contador_contactos` (cuántas veces se consultó/contactó por esa referencia), y lógica de auto-matching contra `requerimientos`.
- **Tabla `requerimientos`**: búsquedas activas de clientes, cargadas por cada asesor (qué está buscando un cliente puntual: tipo, zona, presupuesto, etc.), para cruzar contra referencias externas y también contra inmuebles propios.
- **Control de acceso**: códigos de activación con expiración tipo suscripción — columnas `telegram_acceso_hasta` y `telegram_activo` en `usuarios`.
- **Parsing de mensajes reenviados de WhatsApp**: se usaría Claude Haiku (vía API) para extraer datos estructurados (tipo, zona, precio, contacto) desde el texto reenviado de WhatsApp a Telegram.
- **Público objetivo ampliado**: está pensado que esto no sea solo para el equipo interno de InmoRed — la idea es una futura **webapp pública** con una interfaz tipo carrusel mobile-first, donde **asesores de OTRAS inmobiliarias** también puedan participar de esta red de referencias compartidas (no solo consumir, sino también publicar sus propias referencias). Es decir, es un sistema pensado para ser multi-agencia, no exclusivo de InmoRed, aunque InmoRed lo administraría.

Este es un diseño conceptual — si en algún momento se pide avanzar con esto, consultar con Romano antes de tomar decisiones de arquitectura no confirmadas explícitamente, porque el diseño de arriba es la última versión acordada pero puede haber evolucionado en conversaciones posteriores en el chat de claude.ai que este archivo no capture automáticamente.

### Otras funcionalidades pendientes (menor detalle de diseño, no iniciadas)
- Notificaciones por email (requiere servidor de correo — deferido)
- Generación de contratos en PDF (módulo separado a futuro)
- Estrategia de redes sociales (identificada como prioridad, no desarrollada)
- Manual de identidad corporativa completo (estructura definida: identidad, misión/visión/valores, propuesta de valor, estructura de equipo, identidad visual — redacción no completada)

## Decisiones explícitamente pausadas/rechazadas

- **Carga histórica masiva vía SQL:** se evaluó cargar ~405 registros históricos de un Excel con un INSERT masivo. Romano decidió NO hacerlo así por la mala calidad de los datos de origen (precios en formatos mixtos, zonas con variantes de escritura, tipos duplicados). En su lugar, la carga histórica se hace **manualmente**, un inmueble a la vez, a través del formulario `carga-historica.js`. No proponer de nuevo un enfoque de carga masiva por SQL a menos que Romano lo pida explícitamente.
- **Dominio personalizado (`inmored.com.bo`):** evaluado, no decidido. Se sigue usando `inmored-dusky.vercel.app` por ahora.

## Cómo trabajar en este repo

- Romano revisa cada cambio antes de aprobarlo (Claude Code le va a pedir confirmación en cada paso — está bien, es el flujo esperado, no lo saltees).
- Antes de hacer `git push`, confirmá explícitamente que se está subiendo a `main` (no hay otras ramas en uso).
- Si un cambio toca datos reales de producción en Supabase (no solo código), avisá explícitamente y esperá confirmación extra antes de ejecutar cualquier sentencia SQL destructiva.
- El remoto de este repo está configurado con un Personal Access Token embebido en la URL (no usa el Credential Manager de Windows), para no interferir con otras cuentas de GitHub que Romano usa en esta misma computadora para otros proyectos. No cambies esta configuración sin avisar.
