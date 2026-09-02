'use server'

import { revalidatePath } from 'next/cache'
import {
  cancelarContaPagar,
  gerarContaPagar,
  previaFechamento,
  registrarBaixa,
} from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'
import { deReal } from '@/dominio/dinheiro'
import type { OrigemBaixa } from '@/dominio/tipos'

/** P2: o fechamento passou a ter só a data final. */
export async function calcular(professorId: number, ate: string) {
  await exigirGestora()
  const f = await previaFechamento(professorId, ate)
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

export async function fechar(professorId: number, ate: string) {
  const sessao = await exigirGestora()
  const r = await gerarContaPagar(professorId, ate, sessao.nome)
  revalidatePath('/pagamentos')
  return r
}

/** P3 e P4: baixa com valor parcial e origem (conta da empresa ou responsável). */
export async function pagar(
  contaId: number,
  entrada: {
    valorTexto: string
    data: string
    origem: OrigemBaixa
    conta_id: number | null
    responsavel_id: number | null
    forma_pagamento: string | null
    observacao: string | null
  },
) {
  const sessao = await exigirGestora()

  const r = await registrarBaixa(
    contaId,
    {
      valor: deReal(entrada.valorTexto || '0'),
      data: entrada.data,
      origem: entrada.origem,
      // Os dois campos são mutuamente exclusivos: a origem decide qual vale, e
      // limpar o outro aqui evita que uma troca de opção na tela deixe lixo.
      conta_id: entrada.origem === 'Conta própria' ? entrada.conta_id : null,
      responsavel_id: entrada.origem === 'Pago por responsável' ? entrada.responsavel_id : null,
      forma_pagamento: entrada.forma_pagamento,
      observacao: entrada.observacao,
    },
    sessao.nome,
  )

  if (r.ok) {
    revalidatePath('/pagamentos')
    revalidatePath(`/pagamentos/${contaId}`)
  }
  return r
}

/** P5: cancela a conta pendente e solta as presenças dela. */
export async function cancelarConta(contaId: number) {
  const sessao = await exigirGestora()
  const r = await cancelarContaPagar(contaId, sessao.nome)
  if (r.ok) {
    revalidatePath('/pagamentos')
    revalidatePath(`/pagamentos/${contaId}`)
  }
  return r
}
