import 'server-only'
import { clienteAdmin } from './admin'
import { gravarChamada } from './gravar-chamada'
import type { RespostaChamada } from '@/dominio/presencas/registro'

const MENSAGEM_PAGAMENTO_FECHADO =
  'O pagamento do professor desta aula já foi fechado: não dá para corrigir a chamada.'

/**
 * A chamada desta aula pode ser mexida? Não, se alguma presença dela já entrou
 * num pagamento do professor (pedido do tio, 13/10/2026). `null` = pode.
 */
export async function bloqueioDaChamada(aulaId: number): Promise<string | null> {
  const { count, error } = await clienteAdmin()
    .from('presencas')
    .select('id', { count: 'exact', head: true })
    .eq('aula_id', aulaId)
    .not('conta_pagar_id', 'is', null)
  if (error) return 'Não foi possível conferir o pagamento do professor agora. Tente de novo.'
  return (count ?? 0) > 0 ? MENSAGEM_PAGAMENTO_FECHADO : null
}

/**
 * A gestora corrige a chamada direto, sem depender do professor. Só mexe em
 * quem já tem presença registrada: aluno matriculado depois da chamada não
 * ganha presença por esta tela.
 */
export async function corrigirChamadaDaAula(
  aulaId: number,
  respostas: RespostaChamada[],
  usuario: string,
): Promise<{ ok: true; ausentes: string[] } | { ok: false; motivo: string }> {
  const admin = clienteAdmin()

  const { data: aula, error } = await admin.from('aulas').select('id, status').eq('id', aulaId).maybeSingle()
  if (error) return { ok: false, motivo: 'Não foi possível abrir a aula agora. Tente de novo.' }
  if (!aula) return { ok: false, motivo: 'Esta aula não existe mais.' }
  if (aula.status !== 'Realizada') {
    return { ok: false, motivo: 'Só dá para corrigir uma chamada já registrada.' }
  }

  const { data: presencas, error: erroPresencas } = await admin
    .from('presencas')
    .select('aluno_id, flag_reposicao, aluno:alunos!aluno_id (nome)')
    .eq('aula_id', aulaId)
  if (erroPresencas) {
    return { ok: false, motivo: 'Não foi possível abrir a chamada agora. Tente de novo.' }
  }

  const matriculados = (presencas ?? []).map((p) => ({
    aluno_id: p.aluno_id as number,
    nome: (p.aluno as unknown as { nome: string } | null)?.nome ?? 'Aluno',
    flag_reposicao: p.flag_reposicao as boolean,
  }))

  // Resposta de quem nao esta na chamada e ignorada; quem nao foi tocado
  // continua como estava (nao vira "presente" por falta de resposta).
  const atuais = new Map(
    (
      (await admin.from('presencas').select('aluno_id, presente, observacao').eq('aula_id', aulaId))
        .data ?? []
    ).map((p) => [p.aluno_id as number, p]),
  )
  const completas: RespostaChamada[] = matriculados.map((m) => {
    const dada = respostas.find((r) => r.aluno_id === m.aluno_id)
    const velha = atuais.get(m.aluno_id)
    return {
      aluno_id: m.aluno_id,
      presente: dada?.presente ?? (velha?.presente as boolean | undefined) ?? true,
      observacao: dada ? dada.observacao : ((velha?.observacao as string | null) ?? undefined),
    }
  })

  return gravarChamada(admin, {
    aulaId,
    professorId: null,
    matriculados,
    respostas: completas,
    usuario,
    via: 'gestora',
  })
}
