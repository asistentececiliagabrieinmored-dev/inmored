-- InmoRed — Agrega un campo de ubicación específica a requerimientos, para
-- que el matching automático pueda filtrar por texto libre (ej: "avenida
-- Beni", "9no anillo") además de zona, presupuesto y dormitorios.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

alter table requerimientos
  add column ubicacion_referencia text;

notify pgrst, 'reload schema';
