'use server'

import { revalidatePath } from 'next/cache'
import { darBaixaPagamento, gerarContaPagar, previaFechamento } from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'

export async function calcular(professorId: number, de: string, ate: string) {
  await exigirGestora()
  const f = await previaFechamento(professorId, de, ate)
  return {
    valor_total: f.valor_total,
    itens: f.itens.map((i) => ({
      aluno_nome: i.aluno_nome,
      turma_nome: i.turma_nome,
      data_aula: i.data_aula,
      valor_servico: i.valor_servico,
      percentual_aplicado: i.percentual_aplicado,
      valor_professor: i.valor_professor,
    })),
  }
}

export async function fechar(professorId: number, de: string, ate: string) {
  const sessao = await exigirGestora()
  const r = await gerarContaPagar(professorId, de, ate, sessao.nome)
  revalidatePath('/pagamentos')
  return r
}

export async function pagar(contaId: number, data: string, contaOrigemId: number) {
  const sessao = await exigirGestora()
  await darBaixaPagamento(contaId, data, contaOrigemId, sessao.nome)
  revalidatePath('/pagamentos')
}
