-- InmoRed — Schema: referencias externas (WhatsApp/Telegram) y requerimientos de clientes
-- Diseño documentado en CLAUDE.md, sección "Sistema de bot de Telegram + red de referencias externas".
-- Este archivo es solo documentación versionada: no se ejecuta automáticamente.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

-- ============================================
-- Configuración editable sin redeploy
-- ============================================
create table configuracion_sistema (
  clave text primary key,
  valor text not null,
  descripcion text,
  fecha_actualizacion timestamptz not null default now()
);

insert into configuracion_sistema (clave, valor, descripcion)
values ('retencion_dias_referencias_externas', '30', 'Días que una referencia externa permanece activa antes de expirar');

alter table configuracion_sistema enable row level security;

create policy "Usuarios InmoRed pueden leer configuración"
  on configuracion_sistema for select
  using (es_usuario_inmored());

-- ============================================
-- Referencias externas (WhatsApp / bot de Telegram)
-- ============================================
create table referencias_externas (
  id bigint generated always as identity primary key,
  origen text not null default 'telegram_bot' check (origen in ('telegram_bot', 'manual_webapp')),
  cargado_por_usuario_id bigint references usuarios(id),
  telegram_chat_id text,
  telegram_message_id text,
  texto_original text,

  tipo_inmueble_id bigint references tipos_inmueble(id),
  tipo_transaccion_id bigint references tipos_transaccion(id),
  zona_id bigint references zonas(id),
  ubicacion text,
  precio numeric,
  dimensiones text,
  descripcion text,

  contacto_nombre text,
  contacto_telefono text,

  contador_contactos integer not null default 0,

  fecha_recibido timestamptz not null default now(),
  fecha_expiracion timestamptz not null,
  activa boolean not null default true
);

alter table referencias_externas enable row level security;

create policy "Usuarios InmoRed pueden leer referencias externas"
  on referencias_externas for select
  using (es_usuario_inmored());

create policy "Usuarios InmoRed pueden crear referencias externas"
  on referencias_externas for insert
  with check (es_usuario_inmored());

create policy "Usuarios InmoRed pueden actualizar referencias externas"
  on referencias_externas for update
  using (es_usuario_inmored());

-- ============================================
-- Fotografías de referencias externas (carga futura desde webapp)
-- ============================================
create table fotografias_referencia_externa (
  id bigint generated always as identity primary key,
  referencia_id bigint not null references referencias_externas(id) on delete cascade,
  url text not null,
  orden integer not null default 0,
  fecha_carga timestamptz not null default now()
);

alter table fotografias_referencia_externa enable row level security;

create policy "Usuarios InmoRed pueden leer fotos de referencias externas"
  on fotografias_referencia_externa for select
  using (es_usuario_inmored());

create policy "Usuarios InmoRed pueden agregar fotos de referencias externas"
  on fotografias_referencia_externa for insert
  with check (es_usuario_inmored());

-- ============================================
-- Requerimientos (búsquedas activas de clientes)
-- ============================================
create table requerimientos (
  id bigint generated always as identity primary key,
  asesor_id bigint not null references usuarios(id),
  cliente_nombre text not null,
  cliente_telefono text,

  tipo_inmueble_id bigint references tipos_inmueble(id),
  tipo_transaccion_id bigint references tipos_transaccion(id),

  presupuesto_min numeric,
  presupuesto_max numeric,
  dormitorios_min integer,
  descripcion text,

  estado text not null default 'activo' check (estado in ('activo', 'cerrado')),
  fecha_creacion timestamptz not null default now(),
  fecha_cierre timestamptz
);

alter table requerimientos enable row level security;

create policy "Usuarios InmoRed pueden leer requerimientos"
  on requerimientos for select
  using (es_usuario_inmored());

create policy "Usuarios InmoRed pueden crear requerimientos"
  on requerimientos for insert
  with check (es_usuario_inmored());

create policy "Usuarios InmoRed pueden actualizar requerimientos"
  on requerimientos for update
  using (es_usuario_inmored());

-- ============================================
-- Zonas múltiples por requerimiento
-- ============================================
create table requerimiento_zonas (
  requerimiento_id bigint not null references requerimientos(id) on delete cascade,
  zona_id bigint not null references zonas(id),
  primary key (requerimiento_id, zona_id)
);

alter table requerimiento_zonas enable row level security;

create policy "Usuarios InmoRed pueden leer zonas de requerimientos"
  on requerimiento_zonas for select
  using (es_usuario_inmored());

create policy "Usuarios InmoRed pueden asociar zonas a requerimientos"
  on requerimiento_zonas for insert
  with check (es_usuario_inmored());

-- No olvides recargar el schema de la API:
notify pgrst, 'reload schema';
