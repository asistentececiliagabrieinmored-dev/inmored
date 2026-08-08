-- InmoRed — Renombra cliente_nombre a nombre_requerimiento en requerimientos.
-- Motivo: dejó de ser "el nombre real del cliente" (que ningún asesor va a
-- querer compartir, menos si es de otra inmobiliaria) y pasó a ser una
-- referencia que el asesor elige libremente para identificar el requerimiento.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

alter table requerimientos rename column cliente_nombre to nombre_requerimiento;

notify pgrst, 'reload schema';
