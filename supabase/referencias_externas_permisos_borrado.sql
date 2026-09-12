-- InmoRed — Permite eliminar referencias externas desde la web.
-- Antes solo existían políticas de lectura/creación/actualización (ver
-- supabase/referencias_externas_y_requerimientos.sql).
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

create policy "Usuarios InmoRed pueden eliminar referencias externas"
  on referencias_externas for delete
  using (es_usuario_inmored());
