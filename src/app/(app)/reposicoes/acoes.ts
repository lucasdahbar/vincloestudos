'use server'

import { revalidatePath } from 'next/cache'
import {
  agendarReposicao,
  cancelarAviso,
  desistirReposicao,
  registrarAviso,
} from '@/dados/reposicoes'
import { exigirGestora } from '@/dados/sessao'
import type { Decisao } from '@/dominio/reposicoes/desfecho'

/** Telas que mostram o aviso, a reposição ou o efeito dela na cobrança. */
function revalidarTudo() {
  revalidatePath('/reposicoes')
  revalidatePath('/agenda', 'layout')
  revalidatePath('/creditos')
}

export async function agendar(pendenciaId: number, aulaDestinoId: number) {
  await exigirGestora()
  const r = await agendarReposicao(pendenciaId, aulaDestinoId)
  revalidarTudo()
  return r
}

export async function desistir(pendenciaId: number, decisao: Decisao) {
  await exigirGestora()
  const r = await desistirReposicao(pendenciaId, decisao)
  revalidarTudo()
  return r
}

/** Registra que o aluno avisou que não vem a uma aula específica. */
export async function registrarFaltaAvisada(
  alunoId: number,
  aulaId: number,
  decisao: { gerarReposicao: true } | ({ gerarReposicao: false } & Decisao),
) {
  await exigirGestora()
  const r = await registrarAviso(alunoId, aulaId, decisao)
  revalidarTudo()
  return r
}

export async function desfazerAviso(pendenciaId: number) {
  await exigirGestora()
  const r = await cancelarAviso(pendenciaId)
  revalidarTudo()
  return r
}
