-- InmoRed — Corrige "anticretico" a "anticrético" en el catálogo de
-- tipos de transacción. El código ya se actualizó para comparar contra el
-- valor correcto (con tilde) en telegram-webhook.js y nueva-solicitud.js.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

update tipos_transaccion
set nombre = 'anticrético'
where nombre = 'anticretico';

notify pgrst, 'reload schema';

-- Verificación: revisá si hay otros nombres de catálogo con alguna tilde
-- faltante (los que yo puedo revisar en el código ya están corregidos, pero
-- estos catálogos los cargaste vos directamente en Supabase, así que conviene
-- que los mires con tus propios ojos).
select 'tipos_inmueble' as tabla, id, nombre from tipos_inmueble
union all
select 'tipos_transaccion' as tabla, id, nombre from tipos_transaccion
union all
select 'zonas' as tabla, id, nombre from zonas
order by tabla, id;
