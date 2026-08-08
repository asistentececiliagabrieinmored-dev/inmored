-- InmoRed — Agrega la moneda del precio a referencias_externas
-- Motivo: los anuncios de alquiler en Bolivia suelen cotizar en bolivianos (Bs.),
-- no solo en dólares. El bot ahora guarda el monto tal cual aparece en el
-- mensaje original, junto con la moneda en la que está expresado.
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

alter table referencias_externas
  add column moneda text check (moneda in ('usd', 'bob'));

-- Backfill: las filas cargadas hasta ahora tenían el precio en dólares
-- (los mensajes de prueba usados hasta el momento). Ajustá manualmente si
-- alguna de las existentes en realidad estaba en bolivianos.
update referencias_externas
set moneda = 'usd'
where precio is not null and moneda is null;

notify pgrst, 'reload schema';
