-- InmoRed — Schema: activación de asesores para el bot de Telegram
-- Diseño documentado en CLAUDE.md, sección "Sistema de bot de Telegram + red de referencias externas".
-- Este archivo es solo documentación versionada: no se ejecuta automáticamente.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

-- ============================================
-- Vínculo entre un usuario de InmoRed y su chat de Telegram
-- ============================================
alter table usuarios
  add column telegram_chat_id text,
  add column telegram_activo boolean not null default false,
  add column telegram_acceso_hasta timestamptz;

create unique index idx_usuarios_telegram_chat_id
  on usuarios(telegram_chat_id)
  where telegram_chat_id is not null;

-- ============================================
-- Códigos de activación (expiración tipo suscripción)
-- ============================================
-- dias_acceso: cuántos días de acceso otorga el código una vez canjeado.
-- fecha_expiracion: hasta cuándo se puede canjear el código (no la duración del acceso).
create table codigos_activacion_telegram (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references usuarios(id),
  codigo text not null unique,
  dias_acceso integer not null default 30,
  fecha_expiracion timestamptz not null default (now() + interval '7 days'),
  usado boolean not null default false,
  fecha_uso timestamptz,
  fecha_creacion timestamptz not null default now()
);

alter table codigos_activacion_telegram enable row level security;
-- Sin políticas para usuarios normales: solo el bot (vía Service Role Key,
-- que ignora RLS) y Romano desde el SQL Editor (rol postgres) necesitan acceso.

-- No olvides recargar el schema de la API:
notify pgrst, 'reload schema';

-- ============================================
-- Cómo generar un código de activación para un asesor (ejemplo)
-- ============================================
-- Reemplazá <ID_DEL_USUARIO> por el id del asesor en la tabla `usuarios`
-- y <CODIGO> por un código corto que le vas a pasar por WhatsApp (ej: "ABC123").
--
-- insert into codigos_activacion_telegram (usuario_id, codigo)
-- values (<ID_DEL_USUARIO>, '<CODIGO>');
--
-- Por defecto el código vence en 7 días si no se usa, y al canjearlo otorga
-- 30 días de acceso. Para cambiar esos valores en un caso puntual:
--
-- insert into codigos_activacion_telegram (usuario_id, codigo, dias_acceso, fecha_expiracion)
-- values (<ID_DEL_USUARIO>, '<CODIGO>', 90, now() + interval '3 days');
