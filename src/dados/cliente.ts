import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export function clienteNavegador() {
  return createBrowserClient(url, anonKey)
}

/** Cliente para Server Components e Server Actions. Respeita o RLS do usuario logado. */
export async function clienteServidor() {
  const jar = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (novos) => {
        try {
          novos.forEach(({ name, value, options }) => jar.set(name, value, options))
        } catch {
          // Server Component nao pode escrever cookie. O middleware renova a sessao.
        }
      },
    },
  })
}
