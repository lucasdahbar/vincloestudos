'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { garantirTokenDoProfessor, regerarTokenDoProfessor } from '@/dados/professores'

export type ResultadoLink = { ok: true; link: string } | { ok: false; motivo: string }

/**
 * R1: devolve o link permanente do professor, criando o token na primeira vez.
 *
 * Com `trocar`, gera um token novo e derruba o anterior — o caso do professor
 * que perdeu o celular. Fica atras de uma confirmacao na tela porque e
 * irreversivel: o link que ele guardou para de abrir na hora.
 */
export async function gerarLinkDoProfessor(
  professorId: number,
  trocar = false,
): Promise<ResultadoLink> {
  const sessao = await exigirGestora()

  try {
    const token = trocar
      ? await regerarTokenDoProfessor(professorId)
      : await garantirTokenDoProfessor(professorId)

    if (!token) return { ok: false, motivo: 'Não foi possível gerar o link. Tente de novo.' }

    if (trocar) {
      const supabase = await clienteServidor()
      await supabase.from('logs_operacionais').insert({
        acao: 'regerar_link_presenca',
        entidade: 'professores',
        entidade_id: professorId,
        usuario: sessao.nome,
        detalhe: { motivo: 'link anterior invalidado pela gestora' },
      })
    }

    const cabecalhos = await headers()
    const anfitriao = cabecalhos.get('host') ?? ''
    const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'

    revalidatePath(`/cadastros/professores/${professorId}`)
    return { ok: true, link: `${protocolo}://${anfitriao}/p/professor/${token}` }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Falha ao gerar o link.' }
  }
}
