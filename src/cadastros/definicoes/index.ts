import type { DefinicaoCadastro } from '@/cadastros/tipos'
import {
  anosEscolares,
  contas,
  escolas,
  feriados,
  materias,
  recessos,
  servicos,
} from './simples'
import { alunos, professores, responsaveis } from './pessoas'

export const CADASTROS: Record<string, DefinicaoCadastro> = Object.fromEntries(
  [
    responsaveis,
    alunos,
    professores,
    escolas,
    servicos,
    materias,
    anosEscolares,
    contas,
    feriados,
    recessos,
  ].map((d) => [d.rota, d]),
)

export const ROTAS_DE_CADASTRO = Object.keys(CADASTROS)
