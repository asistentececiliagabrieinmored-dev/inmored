-- InmoRed — Permite eliminar requerimientos y sus zonas asociadas desde la web.
-- Antes solo existían políticas de lectura/creación/actualización.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

create policy "Usuarios InmoRed pueden eliminar requerimientos"
  on requerimientos for delete
  using (es_usuario_inmored());

create policy "Usuarios InmoRed pueden eliminar zonas de requerimientos"
  on requerimiento_zonas for delete
  using (es_usuario_inmored());
