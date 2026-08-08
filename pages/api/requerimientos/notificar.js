import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { buscarCoincidenciasParaRequerimiento } from '../../../lib/matching';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function enviarMensajeTelegram(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { requerimientoId } = req.body || {};
  if (!requerimientoId) {
    res.status(400).json({ error: 'Falta requerimientoId' });
    return;
  }

  const { data: requerimiento } = await supabaseAdmin
    .from('requerimientos')
    .select(
      'id, asesor_id, cliente_nombre, tipo_inmueble_id, tipo_transaccion_id, presupuesto_min, presupuesto_max, dormitorios_min'
    )
    .eq('id', requerimientoId)
    .maybeSingle();

  if (!requerimiento) {
    res.status(404).json({ error: 'Requerimiento no encontrado' });
    return;
  }

  const { data: zonasFilas } = await supabaseAdmin
    .from('requerimiento_zonas')
    .select('zona_id')
    .eq('requerimiento_id', requerimientoId);

  const zonaIds = (zonasFilas || []).map((z) => z.zona_id);

  const { inmuebles, referencias } = await buscarCoincidenciasParaRequerimiento(supabaseAdmin, {
    tipoInmuebleId: requerimiento.tipo_inmueble_id,
    tipoTransaccionId: requerimiento.tipo_transaccion_id,
    zonaIds,
    presupuestoMin: requerimiento.presupuesto_min,
    presupuestoMax: requerimiento.presupuesto_max,
    dormitoriosMin: requerimiento.dormitorios_min,
  });

  if (inmuebles.length + referencias.length > 0) {
    const { data: asesor } = await supabaseAdmin
      .from('usuarios')
      .select('telegram_chat_id, telegram_activo')
      .eq('id', requerimiento.asesor_id)
      .maybeSingle();

    if (asesor?.telegram_activo && asesor.telegram_chat_id) {
      const lineas = [
        `🔔 Encontré ${inmuebles.length + referencias.length} coincidencia(s) para "${requerimiento.cliente_nombre}":`,
      ];
      inmuebles.forEach((i) => {
        lineas.push(`• [Propio] ${i.nombre || i.ubicacion || `Inmueble #${i.id}`} — $us ${i.precio_venta ?? '?'}`);
      });
      referencias.forEach((r) => {
        const precioTexto = r.precio ? `${r.moneda === 'bob' ? 'Bs.' : '$us'} ${r.precio}` : 'precio no informado';
        lineas.push(`• [Referencia] ${r.ubicacion || r.descripcion?.slice(0, 60) || 'Sin ubicación'} — ${precioTexto}`);
      });
      await enviarMensajeTelegram(asesor.telegram_chat_id, lineas.join('\n'));
    }
  }

  res.status(200).json({ inmuebles, referencias });
}
