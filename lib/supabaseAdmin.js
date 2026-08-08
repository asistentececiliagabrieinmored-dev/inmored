import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente con la service role key: se usa SOLO en rutas de servidor (pages/api)
// que no tienen una sesión de usuario de Supabase Auth, como el webhook del
// bot de Telegram. Nunca debe importarse desde código que corre en el navegador.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
