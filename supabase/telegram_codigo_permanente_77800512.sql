-- InmoRed — Código de activación de Telegram "permanente" para el asesor con teléfono 77800512
-- Este archivo es solo documentación versionada: no se ejecuta automáticamente.
-- Para aplicarlo, pegar el contenido en el SQL Editor de Supabase y correrlo por pasos.
--
-- Nota de diseño: el bot no tiene un concepto de "acceso permanente". Toda la validación
-- de acceso es `telegram_acceso_hasta > now()` (ver pages/api/telegram-webhook.js).
-- Por eso "permanente" se implementa como 36500 días de acceso (100 años), sin tocar código.

-- ============================================
-- PASO 1 — Encontrar el id del usuario
-- ============================================
-- Correr esto primero y anotar el `id` de la fila correcta.
-- (Ajustá el filtro si la columna del teléfono tiene otro nombre en la tabla `usuarios`.)

select id, nombre, email
from usuarios
order by id;

-- ============================================
-- PASO 2 — Crear el código permanente
-- ============================================
-- Reemplazá <ID_DEL_USUARIO> por el id que anotaste en el paso 1.
--
--   dias_acceso      = 36500  -> 100 años de acceso una vez canjeado (permanente en la práctica)
--   fecha_expiracion = 1 año  -> hasta cuándo se puede CANJEAR el código si todavía no lo usó
--
-- El código es sensible a mayúsculas: el asesor lo tiene que enviar al bot tal cual: RED778PERM

insert into codigos_activacion_telegram (usuario_id, codigo, dias_acceso, fecha_expiracion)
values (1, 'RED778PERM', 36500, now() + interval '365 days');

-- ============================================
-- PASO 3 — Verificar que quedó bien cargado
-- ============================================

select c.id,
       c.codigo,
       u.nombre,
       c.dias_acceso,
       c.fecha_expiracion,
       c.usado
from codigos_activacion_telegram c
join usuarios u on u.id = c.usuario_id
where c.codigo = 'RED778PERM';

-- ============================================
-- OPCIONAL — Si el asesor YA está activado y solo querés volverle permanente el acceso
-- ============================================
-- En ese caso no hace falta un código nuevo: se extiende directamente su vencimiento.
-- Reemplazá <ID_DEL_USUARIO> y descomentá.
--
-- update usuarios
-- set telegram_activo = true,
--     telegram_acceso_hasta = now() + interval '36500 days'
-- where id = <ID_DEL_USUARIO>;
