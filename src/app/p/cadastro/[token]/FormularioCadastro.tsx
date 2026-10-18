'use client'

import { useState, useTransition } from 'react'
import { enviar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { buscarCep } from '@/dominio/documentos/cep'
import { aplicarMascara } from '@/dominio/documentos/formato'
import { MOTIVO_INDISPONIVEL } from '@/dominio/cadastro-publico/convite'
import {
  MAXIMO_DE_ALUNOS,
  validarEnvio,
  type EntradaAluno,
  type EntradaResponsavel,
} from '@/dominio/cadastro-publico/envio'
import {
  AVISO_DE_PRIVACIDADE,
  MOTIVO_DO_CAMPO,
  TEXTO_DO_ACEITE,
} from '@/dominio/cadastro-publico/privacidade'

const RESPONSAVEL_VAZIO: EntradaResponsavel = {
  nome: '',
  telefone: '',
  email: '',
  cpf: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

const ALUNO_VAZIO: EntradaAluno = { nome: '', telefone: '', email: '', data_nascimento: '' }

export function FormularioCadastro({ token }: { token: string }) {
  const [resp, setResp] = useState<EntradaResponsavel>(RESPONSAVEL_VAZIO)
  const [alunos, setAlunos] = useState<EntradaAluno[]>([{ ...ALUNO_VAZIO }])
  const [aceite, setAceite] = useState(false)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [avisoCep, setAvisoCep] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [pendente, iniciar] = useTransition()

  function mudarResp(campo: keyof EntradaResponsavel, valor: string, mascara?: string) {
    setResp((r) => ({ ...r, [campo]: mascara ? aplicarMascara(mascara, valor) : valor }))
  }

  function mudarAluno(i: number, campo: keyof EntradaAluno, valor: string, mascara?: string) {
    setAlunos((lista) =>
      lista.map((a, j) =>
        j === i ? { ...a, [campo]: mascara ? aplicarMascara(mascara, valor) : valor } : a,
      ),
    )
  }

  async function aoSairDoCep() {
    if (resp.cep.replace(/\D/g, '').length !== 8) return
    setAvisoCep('Buscando o endereço…')
    const r = await buscarCep(resp.cep)
    if (!r.ok) {
      setAvisoCep(r.motivo)
      return
    }
    setAvisoCep(null)
    setResp((atual) => ({ ...atual, ...r.endereco }))
  }

  function aoEnviar(e: React.FormEvent) {
    e.preventDefault()
    setFalha(null)
    const entrada = { responsavel: resp, alunos, aceite }

    // A mesma regra do servidor, para o erro aparecer sem esperar a rede. O
    // servidor valida de novo: o que vale e la.
    const local = validarEnvio(entrada, agoraNaEscola(new Date()).slice(0, 10))
    if (!local.ok) {
      setErros(local.erros)
      return
    }
    setErros({})

    iniciar(async () => {
      const r = await enviar(token, entrada)
      if (r.ok) {
        setEnviado(true)
        window.scrollTo({ top: 0 })
        return
      }
      if ('erros' in r) {
        setErros(r.erros)
        return
      }
      setFalha(
        r.motivo === 'falha'
          ? 'Não deu para enviar agora. Tente de novo em alguns minutos.'
          : r.motivo === 'inexistente'
            ? 'Este link não existe mais. Peça um novo à escola.'
            : MOTIVO_INDISPONIVEL[r.motivo === 'valido' ? 'usado' : r.motivo],
      )
    })
  }

  if (enviado) {
    return (
      <div className="rounded-cartao border border-borda bg-superficie p-8 text-center" role="status">
        <h2 className="font-titulo text-2xl">Dados recebidos</h2>
        <p className="mt-3 text-tinta-suave">
          Obrigado! A escola vai conferir e entrar em contato para combinar a turma.
        </p>
      </div>
    )
  }

  const M = MOTIVO_DO_CAMPO
  const temErro = Object.keys(erros).length > 0

  return (
    <form onSubmit={aoEnviar} noValidate className="space-y-8">
      <fieldset className="space-y-5 rounded-cartao border border-borda bg-superficie p-5">
        <legend className="px-1 font-titulo text-xl">Responsável</legend>

        <Campo etiqueta="Nome completo" ajuda={M.responsavel.nome} erro={erros['responsavel.nome']} obrigatorio>
          <input
            className={entradaClasse}
            autoComplete="name"
            maxLength={120}
            value={resp.nome}
            onChange={(e) => mudarResp('nome', e.target.value)}
          />
        </Campo>

        <Campo etiqueta="CPF" ajuda={M.responsavel.cpf} erro={erros['responsavel.cpf']} obrigatorio>
          <input
            className={entradaClasse}
            inputMode="numeric"
            value={resp.cpf}
            onChange={(e) => mudarResp('cpf', e.target.value, 'cpf')}
          />
        </Campo>

        <Campo
          etiqueta="Telefone (WhatsApp)"
          ajuda={M.responsavel.telefone}
          erro={erros['responsavel.telefone']}
          obrigatorio
        >
          <input
            className={entradaClasse}
            type="tel"
            autoComplete="tel-national"
            value={resp.telefone}
            onChange={(e) => mudarResp('telefone', e.target.value, 'telefone')}
          />
        </Campo>

        <Campo etiqueta="E-mail" ajuda={M.responsavel.email} erro={erros['responsavel.email']} obrigatorio>
          <input
            className={entradaClasse}
            type="email"
            autoComplete="email"
            maxLength={254}
            value={resp.email}
            onChange={(e) => mudarResp('email', e.target.value)}
          />
        </Campo>

        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="CEP" ajuda={M.responsavel.cep} erro={erros['responsavel.cep'] ?? avisoCep ?? undefined} obrigatorio>
            <input
              className={entradaClasse}
              inputMode="numeric"
              autoComplete="postal-code"
              value={resp.cep}
              onChange={(e) => mudarResp('cep', e.target.value, 'cep')}
              onBlur={aoSairDoCep}
            />
          </Campo>
          <Campo etiqueta="Número" ajuda={M.responsavel.numero} erro={erros['responsavel.numero']} obrigatorio>
            <input
              className={entradaClasse}
              maxLength={120}
              value={resp.numero}
              onChange={(e) => mudarResp('numero', e.target.value)}
            />
          </Campo>
        </div>

        <Campo etiqueta="Complemento" ajuda="Opcional. Ex.: Apto 301, Bloco B." erro={erros['responsavel.complemento']}>
          <input
            className={entradaClasse}
            maxLength={120}
            value={resp.complemento}
            onChange={(e) => mudarResp('complemento', e.target.value)}
          />
        </Campo>

        {/* Preenchidos pelo CEP; ficam editaveis para o CEP que o ViaCEP nao conhece. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="Rua" erro={erros['responsavel.endereco']}>
            <input
              className={entradaClasse}
              autoComplete="address-line1"
              maxLength={120}
              value={resp.endereco}
              onChange={(e) => mudarResp('endereco', e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Bairro" erro={erros['responsavel.bairro']}>
            <input
              className={entradaClasse}
              maxLength={120}
              value={resp.bairro}
              onChange={(e) => mudarResp('bairro', e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Cidade" erro={erros['responsavel.cidade']}>
            <input
              className={entradaClasse}
              maxLength={120}
              value={resp.cidade}
              onChange={(e) => mudarResp('cidade', e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Estado (UF)" erro={erros['responsavel.estado']}>
            <input
              className={entradaClasse}
              maxLength={2}
              value={resp.estado}
              onChange={(e) => mudarResp('estado', e.target.value.toUpperCase())}
            />
          </Campo>
        </div>
      </fieldset>

      {alunos.map((a, i) => (
        <fieldset key={i} className="space-y-5 rounded-cartao border border-borda bg-superficie p-5">
          <legend className="px-1 font-titulo text-xl">
            {alunos.length > 1 ? `Aluno ${i + 1}` : 'Aluno'}
          </legend>

          <Campo etiqueta="Nome completo do aluno" ajuda={M.aluno.nome} erro={erros[`alunos.${i}.nome`]} obrigatorio>
            <input
              className={entradaClasse}
              maxLength={120}
              value={a.nome}
              onChange={(e) => mudarAluno(i, 'nome', e.target.value)}
            />
          </Campo>

          <p className="text-sm text-tinta-suave">
            {M.aluno.contato}
            {erros[`alunos.${i}.contato`] && (
              <span className="mt-1.5 block text-erro">• {erros[`alunos.${i}.contato`]}</span>
            )}
          </p>

          <div className="grid gap-5 sm:grid-cols-2">
            <Campo etiqueta="Telefone do aluno" erro={erros[`alunos.${i}.telefone`]}>
              <input
                className={entradaClasse}
                type="tel"
                value={a.telefone}
                onChange={(e) => mudarAluno(i, 'telefone', e.target.value, 'telefone')}
              />
            </Campo>
            <Campo etiqueta="E-mail do aluno" erro={erros[`alunos.${i}.email`]}>
              <input
                className={entradaClasse}
                type="email"
                maxLength={254}
                value={a.email}
                onChange={(e) => mudarAluno(i, 'email', e.target.value)}
              />
            </Campo>
          </div>

          <Campo
            etiqueta="Data de nascimento"
            ajuda={M.aluno.data_nascimento}
            erro={erros[`alunos.${i}.data_nascimento`]}
          >
            <input
              className={entradaClasse}
              type="date"
              value={a.data_nascimento}
              onChange={(e) => mudarAluno(i, 'data_nascimento', e.target.value)}
            />
          </Campo>

          {alunos.length > 1 && (
            <Botao
              type="button"
              aparencia="discreto"
              onClick={() => setAlunos((lista) => lista.filter((_, j) => j !== i))}
            >
              Remover este aluno
            </Botao>
          )}
        </fieldset>
      ))}

      {erros.alunos && <p className="text-sm text-erro">• {erros.alunos}</p>}

      {alunos.length < MAXIMO_DE_ALUNOS && (
        <Botao
          type="button"
          aparencia="secundario"
          onClick={() => setAlunos((lista) => [...lista, { ...ALUNO_VAZIO }])}
        >
          Adicionar outro aluno
        </Botao>
      )}

      <section className="space-y-3 rounded-cartao border border-borda bg-superficie-2 p-5 text-sm text-tinta-suave">
        <h2 className="font-medium text-tinta">Privacidade dos dados</h2>
        {AVISO_DE_PRIVACIDADE.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <label className="flex items-start gap-3 pt-1 text-tinta">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-destaque"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
          />
          <span>{TEXTO_DO_ACEITE}</span>
        </label>
        {erros.aceite && <p className="text-erro">• {erros.aceite}</p>}
      </section>

      {temErro && (
        <p className="text-sm text-erro" role="alert">
          Confira os campos marcados acima.
        </p>
      )}
      {falha && (
        <p className="text-sm text-erro" role="alert">
          {falha}
        </p>
      )}

      <Botao type="submit" disabled={pendente} className="w-full">
        {pendente ? 'Enviando…' : 'Enviar cadastro'}
      </Botao>
    </form>
  )
}
