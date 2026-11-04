'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { refazerNoGoogle } from '../acoes'
import { Botao } from '@/ui/Botao'

/**
 * Aviso de que a agenda do Google ficou para trás desta turma (bug de
 * 04/11/2026: o aluno sumia da aula no Google e ninguém ficava sabendo).
 *
 * O botão refaz a agenda na hora e mostra o resultado. Sem ele a gestora só
 * teria como salvar a turma de novo, sem saber que era isso que resolvia, ou
 * escrever o aluno à mão no Google — que o sistema sobrescreve depois.
 */
export function AvisoGoogle({ id, motivo }: { id: number; motivo: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [falha, setFalha] = useState<string | null>(null)

  function refazer() {
    setFalha(null)
    iniciar(async () => {
      try {
        const r = await refazerNoGoogle(id)
        if (r.ok) router.refresh()
        else setFalha(r.motivo ?? 'O Google não aceitou a atualização.')
      } catch {
        setFalha('Não foi possível refazer agora. Tente de novo em instantes.')
      }
    })
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-alerta-borda bg-alerta-suave p-4"
    >
      <div className="text-sm">
        <p className="font-medium text-alerta">A agenda do Google desta turma está desatualizada</p>
        <p className="mt-1 text-tinta-suave">
          O professor pode ver a lista de alunos errada no Google. Último erro: {falha ?? motivo}
        </p>
      </div>
      <Botao aparencia="secundario" onClick={refazer} disabled={pendente}>
        {pendente ? 'Refazendo…' : 'Refazer no Google'}
      </Botao>
    </div>
  )
}
