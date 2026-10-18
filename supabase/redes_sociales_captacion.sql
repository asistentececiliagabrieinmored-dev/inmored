-- InmoRed — Redes Sociales: origen de la captación y datos del captador.
--
-- Cada inmueble de la sección Redes Sociales indica:
--   * si es una captación propia de InmoRed o externa (otra inmobiliaria u otro asesor),
--   * el nombre y el teléfono de quien lo captó (obligatorio para todos).
--
-- ⚠️ Modifica datos reales: todos los inmuebles ya cargados quedan como
-- captación InmoRed, con captadora Cecilia Gabriel (75090043).
--
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

alter table material_redes
  add column captacion_inmored boolean not null default true,
  add column captador_nombre text,
  add column captador_telefono text;

update material_redes
set captacion_inmored = true,
    captador_nombre = 'Cecilia Gabriel',
    captador_telefono = '75090043';

-- Recién después de completar los existentes se puede exigir el dato.
alter table material_redes
  alter column captador_nombre set not null,
  alter column captador_telefono set not null;

NOTIFY pgrst, 'reload schema';
