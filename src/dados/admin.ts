import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Ignora RLS. Uso restrito ao formulario publico de presenca (Plano 2),
 * que valida um token proprio antes de escrever. A service role key nunca
 * pode aparecer em codigo de cliente: o import de `server-only` garante
 * erro de build se isso acontecer.
 */
export function clienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
