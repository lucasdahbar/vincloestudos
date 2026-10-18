'use server'

import { enviarCadastro } from '@/dados/cadastro-publico'
import type { EntradaEnvio } from '@/dominio/cadastro-publico/envio'

/** Sem sessao: quem protege e o token do convite, validado em `enviarCadastro`. */
export async function enviar(token: string, entrada: EntradaEnvio) {
  return enviarCadastro(token, entrada)
}
