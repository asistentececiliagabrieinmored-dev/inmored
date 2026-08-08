-- InmoRed — Retención de referencias externas diferenciada por tipo de transacción
-- Venta: 60 días. Alquiler y anticrético: 30 días.
-- La clave 'retencion_dias_referencias_externas' (ya existente, valor 30) se mantiene
-- como respaldo genérico para cuando no se logra identificar el tipo de transacción.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

insert into configuracion_sistema (clave, valor, descripcion)
values
  ('retencion_dias_referencias_venta', '60', 'Días que una referencia externa de venta permanece activa antes de expirar'),
  ('retencion_dias_referencias_alquiler_anticretico', '30', 'Días que una referencia externa de alquiler o anticrético permanece activa antes de expirar')
on conflict (clave) do update
set valor = excluded.valor,
    descripcion = excluded.descripcion,
    fecha_actualizacion = now();

notify pgrst, 'reload schema';
