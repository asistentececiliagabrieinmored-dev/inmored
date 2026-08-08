-- InmoRed — Agrega dormitorios a referencias_externas para poder cruzarlo
-- contra requerimientos.dormitorios_min en el matching automático.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

alter table referencias_externas
  add column dormitorios integer;

notify pgrst, 'reload schema';
