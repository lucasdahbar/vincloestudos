# Mesinha Redonda OS — Plano 1: Fundação e Cadastros

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o sistema rodando com autenticação, design system, banco local e todos os cadastros do Módulo de Cadastros funcionando — incluindo Turmas e Matrículas.

**Architecture:** Next.js 15 (App Router) sobre Supabase Postgres local. Três camadas com dependência unidirecional: `app → dados → dominio`. Os dez cadastros base não são dez implementações — são uma engine de CRUD genérica alimentada por definições declarativas (Zod + metadados de UI), uma por entidade. Turmas e Matrículas têm telas próprias por causa das regras condicionais.

**Tech Stack:** Next.js 15, TypeScript strict, Supabase (Postgres + Auth), Tailwind CSS v4, Motion, React Hook Form, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-mesinha-redonda-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/dinheiro.ts` | Aritmética monetária em centavos inteiros |
| `src/dominio/tipos.ts` | Tipos compartilhados e enums do domínio |
| `src/dominio/turmas/nome.ts` | Geração do nome da turma |
| `src/dominio/turmas/regras.ts` | Campos condicionais e regra de ativação |
| `src/dominio/matriculas/regras.ts` | Validação de vínculo aluno–turma |
| `src/dados/cliente.ts` | Clientes Supabase (browser, server, admin) |
| `src/dados/crud.ts` | Repositório genérico tipado |
| `src/dados/turmas.ts` | Consultas de turma com joins |
| `src/dados/matriculas.ts` | Consultas de matrícula com joins |
| `src/cadastros/definicoes/*.ts` | Uma definição declarativa por entidade |
| `src/cadastros/motor/` | Lista, formulário e ações genéricas |
| `src/ui/*` | Design system |
| `supabase/migrations/*.sql` | Schema versionado |

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Criar o projeto Next.js na raiz**

Run:
```bash
cd /d/Desktop/Projetos/mesinharedonda
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

Expected: cria `src/app/`, `package.json`, `tsconfig.json`. Responde "y" se perguntar sobre diretório não vazio (README, docs e requisitos são preservados).

- [ ] **Step 2: Instalar dependências do projeto**

Run:
```bash
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers motion date-fns
npm install -D vitest @vitejs/plugin-react supabase
```

Expected: instala sem erro de peer dependency.

- [ ] **Step 3: Confirmar que o app sobe**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 com TypeScript, Tailwind e dependencias base"
```

---

### Task 2: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Criar a configuração**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 2: Adicionar os scripts**

Em `package.json`, dentro de `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verificar que o runner funciona**

Run: `npm test`
Expected: `No test files found` com exit code 1 — esperado, ainda não há testes.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: configura Vitest para os testes de dominio"
```

---

### Task 3: Aritmética monetária (TDD)

Toda a correção financeira do sistema depende deste módulo. Valores trafegam como inteiros de centavos; `float` nunca toca dinheiro.

**Files:**
- Create: `src/dominio/dinheiro.ts`
- Test: `src/dominio/dinheiro.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/dinheiro.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  aplicarPercentual,
  deNumeric,
  deReal,
  formatarBRL,
  paraNumeric,
  somar,
} from './dinheiro'

describe('deReal', () => {
  it('converte texto em real brasileiro para centavos', () => {
    expect(deReal('105,00')).toBe(10500)
    expect(deReal('1.234,56')).toBe(123456)
    expect(deReal('0,05')).toBe(5)
  })

  it('aceita numero e texto sem centavos', () => {
    expect(deReal(105)).toBe(10500)
    expect(deReal('80')).toBe(8000)
  })

  it('rejeita entrada invalida', () => {
    expect(() => deReal('abc')).toThrow()
  })
})

describe('deNumeric e paraNumeric', () => {
  it('faz a ponte com o numeric do Postgres', () => {
    expect(deNumeric('105.00')).toBe(10500)
    expect(deNumeric('1234.56')).toBe(123456)
    expect(paraNumeric(10500)).toBe('105.00')
    expect(paraNumeric(5)).toBe('0.05')
  })

  it('preserva o valor em ida e volta', () => {
    for (const centavos of [0, 1, 99, 100, 123456, 999999999]) {
      expect(deNumeric(paraNumeric(centavos))).toBe(centavos)
    }
  })
})

describe('somar', () => {
  it('nao acumula erro de ponto flutuante', () => {
    // 0,10 + 0,20 em float daria 0.30000000000000004
    expect(somar(deReal('0,10'), deReal('0,20'))).toBe(deReal('0,30'))
  })

  it('soma uma lista de valores', () => {
    expect(somar(10500, 8000, 5)).toBe(18505)
    expect(somar()).toBe(0)
  })
})

describe('aplicarPercentual', () => {
  it('calcula o repasse do professor', () => {
    expect(aplicarPercentual(10500, 60)).toBe(6300)
    expect(aplicarPercentual(8000, 50)).toBe(4000)
  })

  it('arredonda meio para cima, como no comercio', () => {
    // 10001 * 33,33% = 3333,3333 centavos
    expect(aplicarPercentual(10001, 33.33)).toBe(3333)
    // 1000 * 12,345% = 123,45 centavos
    expect(aplicarPercentual(1000, 12.35)).toBe(124)
  })

  it('trata os extremos', () => {
    expect(aplicarPercentual(10500, 0)).toBe(0)
    expect(aplicarPercentual(10500, 100)).toBe(10500)
  })
})

describe('formatarBRL', () => {
  it('formata para exibicao', () => {
    expect(formatarBRL(10500)).toBe('R$ 105,00')
    expect(formatarBRL(123456)).toBe('R$ 1.234,56')
    expect(formatarBRL(0)).toBe('R$ 0,00')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- dinheiro`
Expected: FAIL — `Failed to resolve import "./dinheiro"`

- [ ] **Step 3: Implementar**

`src/dominio/dinheiro.ts`:
```ts
/**
 * Valores monetarios trafegam como inteiros de centavos em todo o sistema.
 * Nenhuma operacao aritmetica usa ponto flutuante: o RNF de precisao
 * monetaria do documento de requisitos depende disso.
 */
export type Centavos = number

/** Converte texto digitado em real brasileiro ("1.234,56") para centavos. */
export function deReal(valor: string | number): Centavos {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error(`Valor monetario invalido: ${valor}`)
    return Math.round(valor * 100)
  }

  const limpo = valor.trim().replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.')
  if (limpo === '' || !/^-?\d+(\.\d+)?$/.test(limpo)) {
    throw new Error(`Valor monetario invalido: ${valor}`)
  }
  return Math.round(Number(limpo) * 100)
}

/** Converte o `numeric` do Postgres, que a driver entrega como texto, para centavos. */
export function deNumeric(valor: string | number | null): Centavos {
  if (valor === null) return 0
  const texto = String(valor)
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    throw new Error(`Numeric invalido vindo do banco: ${texto}`)
  }
  return Math.round(Number(texto) * 100)
}

/** Converte centavos para o texto aceito por uma coluna `numeric(12,2)`. */
export function paraNumeric(centavos: Centavos): string {
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  const inteiros = Math.trunc(abs / 100)
  const resto = abs % 100
  return `${negativo ? '-' : ''}${inteiros}.${String(resto).padStart(2, '0')}`
}

export function somar(...valores: Centavos[]): Centavos {
  return valores.reduce((total, valor) => total + valor, 0)
}

export function subtrair(a: Centavos, b: Centavos): Centavos {
  return a - b
}

/**
 * Aplica um percentual (ex.: 60 para 60%) com arredondamento comercial
 * (meio para cima). Usado no repasse ao professor.
 */
export function aplicarPercentual(centavos: Centavos, percentual: number): Centavos {
  return Math.round((centavos * percentual) / 100)
}

const formatador = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatarBRL(centavos: Centavos): string {
  return formatador.format(centavos / 100).replace(/ /g, ' ')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- dinheiro`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/dinheiro.ts src/dominio/dinheiro.test.ts
git commit -m "feat(dominio): aritmetica monetaria em centavos inteiros"
```

---

### Task 4: Tipos e enums do domínio

**Files:**
- Create: `src/dominio/tipos.ts`

- [ ] **Step 1: Escrever os tipos**

`src/dominio/tipos.ts`:
```ts
export const MODALIDADES = ['Presencial', 'Online'] as const
export type Modalidade = (typeof MODALIDADES)[number]

export const STATUS_TURMA = ['Ativa', 'Encerrada'] as const
export type StatusTurma = (typeof STATUS_TURMA)[number]

export const STATUS_MATRICULA = ['Ativa', 'Encerrada'] as const
export type StatusMatricula = (typeof STATUS_MATRICULA)[number]

export const DESTINATARIOS_NOTIFICACAO = ['Aluno', 'Responsável', 'Ambos'] as const
export type DestinatarioNotificacao = (typeof DESTINATARIOS_NOTIFICACAO)[number]

export const CANAIS_NOTIFICACAO = ['WhatsApp', 'E-mail', 'Ambos'] as const
export type CanalNotificacao = (typeof CANAIS_NOTIFICACAO)[number]

export const TIPOS_CONTA = ['Banco', 'Dinheiro', 'Carteira digital'] as const
export type TipoConta = (typeof TIPOS_CONTA)[number]

export const ABRANGENCIAS_FERIADO = ['Nacional', 'Estadual', 'Municipal'] as const
export type AbrangenciaFeriado = (typeof ABRANGENCIAS_FERIADO)[number]

export const PAPEIS = ['gestora', 'professor'] as const
export type Papel = (typeof PAPEIS)[number]

/** Dias da semana no mesmo indice de `Date.getDay()`: 0 = domingo. */
export const DIAS_SEMANA = [
  { valor: 0, nome: 'Domingo', curto: 'Dom' },
  { valor: 1, nome: 'Segunda', curto: 'Seg' },
  { valor: 2, nome: 'Terça', curto: 'Ter' },
  { valor: 3, nome: 'Quarta', curto: 'Qua' },
  { valor: 4, nome: 'Quinta', curto: 'Qui' },
  { valor: 5, nome: 'Sexta', curto: 'Sex' },
  { valor: 6, nome: 'Sábado', curto: 'Sáb' },
] as const

export function nomesDosDias(dias: number[]): string {
  return dias
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DIAS_SEMANA.find((dia) => dia.valor === d)?.curto ?? '?')
    .join(', ')
}
```

- [ ] **Step 2: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/dominio/tipos.ts
git commit -m "feat(dominio): tipos e enums compartilhados"
```

---

### Task 5: Nome gerado da turma (TDD)

Regra 5.2 do Adendo: o nome é a concatenação de Matéria + Ano Escolar + Escola + Tipo de Serviço + Modalidade, recalculado sempre que um componente muda. Matéria e escola são condicionais, então podem faltar.

**Files:**
- Create: `src/dominio/turmas/nome.ts`
- Test: `src/dominio/turmas/nome.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/turmas/nome.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { gerarNomeTurma } from './nome'

describe('gerarNomeTurma', () => {
  it('concatena todos os componentes na ordem do requisito', () => {
    expect(
      gerarNomeTurma({
        materia: 'Matemática',
        anoEscolar: '9º ano',
        escola: 'Colégio São José',
        servico: 'Reforço',
        modalidade: 'Presencial',
      }),
    ).toBe('Matemática · 9º ano · Colégio São José · Reforço · Presencial')
  })

  it('omite materia quando o servico nao permite', () => {
    expect(
      gerarNomeTurma({
        materia: null,
        anoEscolar: '7º ano',
        escola: 'Colégio São José',
        servico: 'Aulão de revisão',
        modalidade: 'Online',
      }),
    ).toBe('7º ano · Colégio São José · Aulão de revisão · Online')
  })

  it('omite escola quando o servico nao permite', () => {
    expect(
      gerarNomeTurma({
        materia: 'Português',
        anoEscolar: '7º ano',
        escola: null,
        servico: 'Aula particular',
        modalidade: 'Online',
      }),
    ).toBe('Português · 7º ano · Aula particular · Online')
  })

  it('ignora componentes vazios ou so com espacos', () => {
    expect(
      gerarNomeTurma({
        materia: '  ',
        anoEscolar: '1º ano',
        escola: '',
        servico: 'Reforço',
        modalidade: 'Presencial',
      }),
    ).toBe('1º ano · Reforço · Presencial')
  })

  it('descreve a turma incompleta enquanto o formulario e preenchido', () => {
    expect(
      gerarNomeTurma({
        materia: null,
        anoEscolar: null,
        escola: null,
        servico: null,
        modalidade: null,
      }),
    ).toBe('')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- turmas/nome`
Expected: FAIL — `Failed to resolve import "./nome"`

- [ ] **Step 3: Implementar**

`src/dominio/turmas/nome.ts`:
```ts
import type { Modalidade } from '@/dominio/tipos'

export interface ComponentesDoNome {
  materia: string | null
  anoEscolar: string | null
  escola: string | null
  servico: string | null
  modalidade: Modalidade | null
}

const SEPARADOR = ' · '

/**
 * Adendo v1.1, secao 5.2: o nome da turma e gerado por concatenacao e
 * recalculado sempre que um dos componentes muda. Componentes ausentes
 * (materia/escola condicionais, ou formulario ainda em preenchimento)
 * simplesmente nao entram.
 */
export function gerarNomeTurma(componentes: ComponentesDoNome): string {
  return [
    componentes.materia,
    componentes.anoEscolar,
    componentes.escola,
    componentes.servico,
    componentes.modalidade,
  ]
    .map((parte) => parte?.trim() ?? '')
    .filter((parte) => parte !== '')
    .join(SEPARADOR)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- turmas/nome`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/turmas/
git commit -m "feat(dominio): geracao do nome da turma por concatenacao"
```

---

### Task 6: Regras de validação da turma (TDD)

**Files:**
- Create: `src/dominio/turmas/regras.ts`
- Test: `src/dominio/turmas/regras.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/turmas/regras.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { validarTurma, type EntradaTurma, type ServicoDaTurma } from './regras'

const servicoCompleto: ServicoDaTurma = {
  permite_materia: true,
  permite_escola: true,
}

const servicoSimples: ServicoDaTurma = {
  permite_materia: false,
  permite_escola: false,
}

const turmaValida: EntradaTurma = {
  servico_id: 1,
  materia_id: 2,
  escola_id: 3,
  ano_escolar_id: 4,
  professor_id: 5,
  modalidade: 'Presencial',
  dias_semana: [2, 4],
  horario_inicio: '15:00',
  horario_fim: '16:00',
  status: 'Ativa',
}

describe('validarTurma', () => {
  it('aceita uma turma completa e valida', () => {
    expect(validarTurma(turmaValida, servicoCompleto)).toEqual([])
  })

  it('exige materia quando o servico permite materia', () => {
    const erros = validarTurma({ ...turmaValida, materia_id: null }, servicoCompleto)
    expect(erros).toContain('Selecione a matéria: o serviço escolhido exige esse campo.')
  })

  it('exige escola quando o servico permite escola', () => {
    const erros = validarTurma({ ...turmaValida, escola_id: null }, servicoCompleto)
    expect(erros).toContain('Selecione a escola: o serviço escolhido exige esse campo.')
  })

  it('rejeita materia e escola quando o servico nao os permite', () => {
    const erros = validarTurma(turmaValida, servicoSimples)
    expect(erros).toContain('O serviço escolhido não usa matéria.')
    expect(erros).toContain('O serviço escolhido não usa escola.')
  })

  it('aceita turma sem materia nem escola quando o servico nao os permite', () => {
    const erros = validarTurma(
      { ...turmaValida, materia_id: null, escola_id: null },
      servicoSimples,
    )
    expect(erros).toEqual([])
  })

  it('exige horario final maior que o inicial', () => {
    const erros = validarTurma(
      { ...turmaValida, horario_inicio: '16:00', horario_fim: '15:00' },
      servicoCompleto,
    )
    expect(erros).toContain('O horário de término deve ser maior que o de início.')
  })

  it('rejeita horarios iguais', () => {
    const erros = validarTurma(
      { ...turmaValida, horario_inicio: '15:00', horario_fim: '15:00' },
      servicoCompleto,
    )
    expect(erros).toContain('O horário de término deve ser maior que o de início.')
  })

  it('so permite turma Ativa com ao menos um dia da semana', () => {
    const erros = validarTurma({ ...turmaValida, dias_semana: [] }, servicoCompleto)
    expect(erros).toContain('Escolha ao menos um dia da semana para ativar a turma.')
  })

  it('permite turma Encerrada sem dia da semana', () => {
    const erros = validarTurma(
      { ...turmaValida, dias_semana: [], status: 'Encerrada' },
      servicoCompleto,
    )
    expect(erros).toEqual([])
  })

  it('rejeita dia da semana fora do intervalo 0 a 6', () => {
    const erros = validarTurma({ ...turmaValida, dias_semana: [2, 9] }, servicoCompleto)
    expect(erros).toContain('Dia da semana inválido.')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- turmas/regras`
Expected: FAIL — `Failed to resolve import "./regras"`

- [ ] **Step 3: Implementar**

`src/dominio/turmas/regras.ts`:
```ts
import type { Modalidade, StatusTurma } from '@/dominio/tipos'

export interface ServicoDaTurma {
  permite_materia: boolean
  permite_escola: boolean
}

export interface EntradaTurma {
  servico_id: number | null
  materia_id: number | null
  escola_id: number | null
  ano_escolar_id: number | null
  professor_id: number | null
  modalidade: Modalidade | null
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
}

/**
 * Adendo v1.1, secao 5.1 e 5.2. As mensagens sao escritas para a gestora,
 * nao para o desenvolvedor: dizem o que fazer, nao o que falhou.
 */
export function validarTurma(turma: EntradaTurma, servico: ServicoDaTurma): string[] {
  const erros: string[] = []

  if (turma.servico_id === null) erros.push('Selecione o serviço.')
  if (turma.ano_escolar_id === null) erros.push('Selecione o ano escolar.')
  if (turma.professor_id === null) erros.push('Selecione o professor responsável.')
  if (turma.modalidade === null) erros.push('Selecione a modalidade.')

  if (servico.permite_materia && turma.materia_id === null) {
    erros.push('Selecione a matéria: o serviço escolhido exige esse campo.')
  }
  if (!servico.permite_materia && turma.materia_id !== null) {
    erros.push('O serviço escolhido não usa matéria.')
  }

  if (servico.permite_escola && turma.escola_id === null) {
    erros.push('Selecione a escola: o serviço escolhido exige esse campo.')
  }
  if (!servico.permite_escola && turma.escola_id !== null) {
    erros.push('O serviço escolhido não usa escola.')
  }

  if (turma.horario_fim <= turma.horario_inicio) {
    erros.push('O horário de término deve ser maior que o de início.')
  }

  if (turma.dias_semana.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    erros.push('Dia da semana inválido.')
  }

  if (turma.status === 'Ativa' && turma.dias_semana.length === 0) {
    erros.push('Escolha ao menos um dia da semana para ativar a turma.')
  }

  return erros
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- turmas/regras`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/turmas/regras.ts src/dominio/turmas/regras.test.ts
git commit -m "feat(dominio): validacao condicional da turma conforme o servico"
```

---

### Task 7: Regras de matrícula (TDD)

**Files:**
- Create: `src/dominio/matriculas/regras.ts`
- Test: `src/dominio/matriculas/regras.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/matriculas/regras.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { validarMatricula, type EntradaMatricula, type TurmaDaMatricula } from './regras'

const turmaAtiva: TurmaDaMatricula = { status: 'Ativa' }
const turmaEncerrada: TurmaDaMatricula = { status: 'Encerrada' }

const matriculaValida: EntradaMatricula = {
  aluno_id: 1,
  turma_id: 2,
  data_inicio: '2026-08-01',
  data_fim: null,
  flag_reposicao: false,
  alunoAtivo: true,
}

describe('validarMatricula', () => {
  it('aceita uma matricula valida em aberto', () => {
    expect(validarMatricula(matriculaValida, turmaAtiva)).toEqual([])
  })

  it('aceita data de fim posterior a de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-12-15' }, turmaAtiva)
    expect(erros).toEqual([])
  })

  it('rejeita matricula em turma encerrada', () => {
    const erros = validarMatricula(matriculaValida, turmaEncerrada)
    expect(erros).toContain('Esta turma está encerrada e não aceita novas matrículas.')
  })

  it('rejeita data de fim anterior a de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-07-01' }, turmaAtiva)
    expect(erros).toContain('A data de fim deve ser posterior à data de início.')
  })

  it('rejeita data de fim igual a de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-08-01' }, turmaAtiva)
    expect(erros).toContain('A data de fim deve ser posterior à data de início.')
  })

  it('rejeita aluno inativo', () => {
    const erros = validarMatricula({ ...matriculaValida, alunoAtivo: false }, turmaAtiva)
    expect(erros).toContain('Este aluno está inativo.')
  })

  it('exige data de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '' }, turmaAtiva)
    expect(erros).toContain('Informe a data de início.')
  })
})

describe('avisoDeReposicao', () => {
  it('avisa que matricula de reposicao nao gera cobranca', async () => {
    const { avisoDeReposicao } = await import('./regras')
    expect(avisoDeReposicao(true)).toBe(
      'Esta matrícula é apenas para uma reposição: ela não gera cobrança para o responsável.',
    )
    expect(avisoDeReposicao(false)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- matriculas/regras`
Expected: FAIL — `Failed to resolve import "./regras"`

- [ ] **Step 3: Implementar**

`src/dominio/matriculas/regras.ts`:
```ts
import type { StatusTurma } from '@/dominio/tipos'

export interface TurmaDaMatricula {
  status: StatusTurma
}

export interface EntradaMatricula {
  aluno_id: number | null
  turma_id: number | null
  /** Datas em ISO (AAAA-MM-DD), comparaveis lexicograficamente. */
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  alunoAtivo: boolean
}

/** Modulos Operacionais, secao 3.2. */
export function validarMatricula(
  matricula: EntradaMatricula,
  turma: TurmaDaMatricula,
): string[] {
  const erros: string[] = []

  if (matricula.aluno_id === null) erros.push('Selecione o aluno.')
  if (matricula.turma_id === null) erros.push('Selecione a turma.')
  if (!matricula.alunoAtivo) erros.push('Este aluno está inativo.')

  if (turma.status !== 'Ativa') {
    erros.push('Esta turma está encerrada e não aceita novas matrículas.')
  }

  if (matricula.data_inicio === '') {
    erros.push('Informe a data de início.')
  } else if (matricula.data_fim !== null && matricula.data_fim <= matricula.data_inicio) {
    erros.push('A data de fim deve ser posterior à data de início.')
  }

  return erros
}

/**
 * Secao 3.3: o formulario exibe um aviso quando a matricula e de reposicao,
 * porque a consequencia (nao gerar cobranca) nao e obvia pelo nome do campo.
 */
export function avisoDeReposicao(flagReposicao: boolean): string | null {
  return flagReposicao
    ? 'Esta matrícula é apenas para uma reposição: ela não gera cobrança para o responsável.'
    : null
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 4 arquivos, 35 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/matriculas/
git commit -m "feat(dominio): validacao de matricula aluno-turma"
```

---

### Task 8: Supabase local e migration de fundação

**Files:**
- Create: `supabase/config.toml` (gerado), `supabase/migrations/20260813000100_fundacao.sql`, `.env.local`, `.env.example`

- [ ] **Step 1: Subir o Docker Desktop**

Docker está instalado mas o daemon não está rodando. Abra o Docker Desktop e aguarde o ícone ficar verde.

Run: `docker info --format '{{.ServerVersion}}'`
Expected: um número de versão, não erro de pipe.

- [ ] **Step 2: Inicializar o Supabase**

Run: `npx supabase init`
Expected: cria `supabase/config.toml`.

- [ ] **Step 3: Criar a migration de fundação**

`supabase/migrations/20260813000100_fundacao.sql`:
```sql
-- Fundacao: trigger de updated_at e tipos enumerados usados em todo o schema.

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.tocar_updated_at is
  'Mantem updated_at atualizado. Aplicada por trigger em todas as tabelas.';

create type public.modalidade as enum ('Presencial', 'Online');
create type public.status_turma as enum ('Ativa', 'Encerrada');
create type public.status_matricula as enum ('Ativa', 'Encerrada');
create type public.destinatario_notificacao as enum ('Aluno', 'Responsável', 'Ambos');
create type public.canal_notificacao as enum ('WhatsApp', 'E-mail', 'Ambos');
create type public.tipo_conta as enum ('Banco', 'Dinheiro', 'Carteira digital');
create type public.abrangencia_feriado as enum ('Nacional', 'Estadual', 'Municipal');
create type public.papel_usuario as enum ('gestora', 'professor');
```

- [ ] **Step 4: Subir o banco local**

Run: `npx supabase start`
Expected: imprime `API URL`, `anon key` e `service_role key`. Guarde-os para o próximo passo.

- [ ] **Step 5: Criar os arquivos de ambiente**

`.env.example`:
```
# Supabase local: rode `npx supabase start` e copie os valores impressos.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=cole-a-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=cole-a-service-role-key-aqui

# Google Calendar: desligado ate haver credenciais (spec, secao 6).
GOOGLE_CALENDAR_ATIVO=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`.env.local`: mesma estrutura, com os valores reais impressos por `supabase start`.

- [ ] **Step 6: Garantir que `.env.local` está ignorado**

Run: `grep -n "env" .gitignore`
Expected: contém `.env*` (o create-next-app já inclui). Se não, adicionar `.env*.local`.

- [ ] **Step 7: Commit**

```bash
git add supabase/ .env.example .gitignore
git commit -m "feat(banco): supabase local e migration de fundacao"
```

---

### Task 9: Migration dos cadastros de apoio

**Files:**
- Create: `supabase/migrations/20260813000200_cadastros_apoio.sql`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260813000200_cadastros_apoio.sql`:
```sql
-- Cadastros de apoio. Campos marcados [INFERIDO] no spec, secao 4.1, sao
-- nulaveis para permitir ajuste sem migration destrutiva apos validacao.

create table public.cidades (
  id bigint generated always as identity primary key,
  nome text not null,
  uf char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome, uf)
);

create table public.escolas (
  id bigint generated always as identity primary key,
  nome text not null,
  cidade_id bigint references public.cidades (id) on delete set null,
  endereco text,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.anos_escolares (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.anos_escolares.ordem is
  'Ordena "9º ano" depois de "1º ano". Ordenacao alfabetica nao serve.';

create table public.materias (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.servicos (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text,
  valor_padrao numeric(12, 2) not null check (valor_padrao >= 0),
  permite_materia boolean not null default true,
  permite_escola boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Requisitos Operacionais 6.2: o valor cobrado e o do servico NA DATA DA AULA.
-- Sem historico, um reajuste reescreveria cobrancas e repasses ja fechados.
create table public.servico_valor_historico (
  id bigint generated always as identity primary key,
  servico_id bigint not null references public.servicos (id) on delete cascade,
  valor numeric(12, 2) not null check (valor >= 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index on public.servico_valor_historico (servico_id, vigencia_inicio desc);

create table public.contas (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo public.tipo_conta not null default 'Banco',
  banco text,
  chave_pix text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feriados (
  id bigint generated always as identity primary key,
  data date not null,
  nome text not null,
  abrangencia public.abrangencia_feriado not null default 'Nacional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data, nome)
);

create trigger tocar_updated_at before update on public.cidades
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.escolas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.anos_escolares
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.materias
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.servicos
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.contas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.feriados
  for each row execute function public.tocar_updated_at();
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npx supabase db reset`
Expected: `Finished supabase db reset` sem erro de SQL.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813000200_cadastros_apoio.sql
git commit -m "feat(banco): cadastros de apoio com historico de valor do servico"
```

---

### Task 10: Migration de pessoas

**Files:**
- Create: `supabase/migrations/20260813000300_pessoas.sql`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260813000300_pessoas.sql`:
```sql
create table public.professores (
  id bigint generated always as identity primary key,
  nome text not null,
  percentual_repasse numeric(5, 2) not null
    check (percentual_repasse >= 0 and percentual_repasse <= 100),
  telefone text,
  email text,
  cpf text,
  chave_pix text,
  ativo boolean not null default true,
  usuario_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.professores.usuario_id is
  'Liga o professor a uma conta de login. Nulo para professor sem acesso ao sistema.';

-- Requisitos Operacionais 8.2: o repasse usa o percentual VIGENTE NA DATA DA AULA.
create table public.professor_percentual_historico (
  id bigint generated always as identity primary key,
  professor_id bigint not null references public.professores (id) on delete cascade,
  percentual numeric(5, 2) not null check (percentual >= 0 and percentual <= 100),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index on public.professor_percentual_historico (professor_id, vigencia_inicio desc);

create table public.responsaveis (
  id bigint generated always as identity primary key,
  nome text not null,
  telefone text,
  email text,
  cpf text,
  endereco text,
  cidade_id bigint references public.cidades (id) on delete set null,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alunos (
  id bigint generated always as identity primary key,
  nome text not null,
  responsavel_id bigint not null references public.responsaveis (id) on delete restrict,
  escola_id bigint references public.escolas (id) on delete set null,
  data_nascimento date,
  telefone text,
  email text,
  observacao text,
  ativo boolean not null default true,
  destinatario_notificacao public.destinatario_notificacao not null default 'Responsável',
  canal_notificacao public.canal_notificacao not null default 'WhatsApp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.alunos is
  'Sem campo de ano escolar: o ano e definido pela Turma em que o aluno se matricula (Adendo v1.1, Ajuste 3).';

create index on public.alunos (responsavel_id);

create trigger tocar_updated_at before update on public.professores
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.responsaveis
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.alunos
  for each row execute function public.tocar_updated_at();
```

- [ ] **Step 2: Aplicar e verificar**

Run: `npx supabase db reset`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813000300_pessoas.sql
git commit -m "feat(banco): professores, responsaveis e alunos"
```

---

### Task 11: Triggers de vigência histórica

Alterar `servicos.valor_padrao` ou `professores.percentual_repasse` precisa fechar a vigência anterior e abrir uma nova, automaticamente. Isso é infraestrutura de correção financeira: se ficar a cargo da aplicação, uma edição direta no banco quebra o histórico.

**Files:**
- Create: `supabase/migrations/20260813000400_vigencias.sql`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260813000400_vigencias.sql`:
```sql
-- Mantem o historico de vigencia sincronizado com o valor corrente.
-- A aplicacao nunca escreve nas tabelas de historico: elas sao derivadas.

create or replace function public.registrar_vigencia_servico()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.valor_padrao = old.valor_padrao then
    return new;
  end if;

  update public.servico_valor_historico
     set vigencia_fim = current_date - 1
   where servico_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.servico_valor_historico
   where servico_id = new.id
     and vigencia_inicio = current_date;

  insert into public.servico_valor_historico (servico_id, valor, vigencia_inicio)
  values (new.id, new.valor_padrao, current_date);

  return new;
end;
$$;

create trigger registrar_vigencia
  after insert or update of valor_padrao on public.servicos
  for each row execute function public.registrar_vigencia_servico();

create or replace function public.registrar_vigencia_professor()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.percentual_repasse = old.percentual_repasse then
    return new;
  end if;

  update public.professor_percentual_historico
     set vigencia_fim = current_date - 1
   where professor_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.professor_percentual_historico
   where professor_id = new.id
     and vigencia_inicio = current_date;

  insert into public.professor_percentual_historico (professor_id, percentual, vigencia_inicio)
  values (new.id, new.percentual_repasse, current_date);

  return new;
end;
$$;

create trigger registrar_vigencia
  after insert or update of percentual_repasse on public.professores
  for each row execute function public.registrar_vigencia_professor();

-- Consultas usadas pelos modulos de cobranca e pagamento (Planos 2 e 3).
create or replace function public.valor_servico_em(p_servico_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select h.valor
    from public.servico_valor_historico h
   where h.servico_id = p_servico_id
     and h.vigencia_inicio <= p_data
     and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
   order by h.vigencia_inicio desc
   limit 1;
$$;

create or replace function public.percentual_professor_em(p_professor_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select h.percentual
    from public.professor_percentual_historico h
   where h.professor_id = p_professor_id
     and h.vigencia_inicio <= p_data
     and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
   order by h.vigencia_inicio desc
   limit 1;
$$;
```

- [ ] **Step 2: Aplicar**

Run: `npx supabase db reset`
Expected: sem erro.

- [ ] **Step 3: Verificar o comportamento na prática**

Run:
```bash
npx supabase db reset && npx supabase db psql -c "
insert into public.servicos (nome, valor_padrao) values ('Reforço', 100.00);
update public.servicos set valor_padrao = 120.00 where nome = 'Reforço';
select valor, vigencia_inicio, vigencia_fim from public.servico_valor_historico order by id;
select public.valor_servico_em(1, current_date) as vigente;
"
```
Expected: uma linha de histórico com `valor = 120.00` e `vigencia_fim` nulo (mesma data, substitui), e `vigente = 120.00`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260813000400_vigencias.sql
git commit -m "feat(banco): triggers de vigencia historica de valor e repasse"
```

---

### Task 12: Migration de turmas e matrículas

**Files:**
- Create: `supabase/migrations/20260813000500_turmas_matriculas.sql`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260813000500_turmas_matriculas.sql`:
```sql
create table public.turmas (
  id bigint generated always as identity primary key,
  nome text not null,
  servico_id bigint not null references public.servicos (id) on delete restrict,
  materia_id bigint references public.materias (id) on delete restrict,
  escola_id bigint references public.escolas (id) on delete restrict,
  ano_escolar_id bigint not null references public.anos_escolares (id) on delete restrict,
  professor_id bigint not null references public.professores (id) on delete restrict,
  modalidade public.modalidade not null,
  dias_semana smallint[] not null default '{}',
  horario_inicio time not null,
  horario_fim time not null,
  google_calendar_event_id text unique,
  status public.status_turma not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint horario_coerente check (horario_fim > horario_inicio),
  constraint dias_validos check (
    dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint ativa_exige_dia check (
    status <> 'Ativa' or array_length(dias_semana, 1) >= 1
  )
);

comment on column public.turmas.nome is
  'Gerado por concatenacao (Adendo v1.1, 5.2). Nao e unico: duas turmas podem ter a mesma composicao em horarios diferentes.';
comment on column public.turmas.dias_semana is
  'Mesmo indice de Date.getDay(): 0 = domingo.';

create index on public.turmas (professor_id);
create index on public.turmas (status);

-- A condicionalidade de materia/escola depende do servico, entao vive em trigger,
-- nao em CHECK (que nao pode consultar outra tabela).
create or replace function public.validar_condicionais_turma()
returns trigger
language plpgsql
as $$
declare
  s record;
begin
  select permite_materia, permite_escola into s
    from public.servicos where id = new.servico_id;

  if s.permite_materia and new.materia_id is null then
    raise exception 'O serviço desta turma exige matéria.';
  end if;
  if not s.permite_materia and new.materia_id is not null then
    raise exception 'O serviço desta turma não usa matéria.';
  end if;
  if s.permite_escola and new.escola_id is null then
    raise exception 'O serviço desta turma exige escola.';
  end if;
  if not s.permite_escola and new.escola_id is not null then
    raise exception 'O serviço desta turma não usa escola.';
  end if;

  return new;
end;
$$;

create trigger validar_condicionais
  before insert or update on public.turmas
  for each row execute function public.validar_condicionais_turma();

create table public.matriculas (
  id bigint generated always as identity primary key,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  turma_id bigint not null references public.turmas (id) on delete restrict,
  data_inicio date not null default current_date,
  data_fim date,
  flag_reposicao boolean not null default false,
  status public.status_matricula not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periodo_coerente check (data_fim is null or data_fim > data_inicio)
);

comment on column public.matriculas.flag_reposicao is
  'Matricula pontual para cumprir reposicao em outra turma. NUNCA entra na base de calculo de cobranca (Operacionais 3.2 e 6.3).';

create index on public.matriculas (aluno_id);
create index on public.matriculas (turma_id);
create index on public.matriculas (status) where status = 'Ativa';

create trigger tocar_updated_at before update on public.turmas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.matriculas
  for each row execute function public.tocar_updated_at();
```

- [ ] **Step 2: Aplicar**

Run: `npx supabase db reset`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813000500_turmas_matriculas.sql
git commit -m "feat(banco): turmas com validacao condicional e matriculas"
```

---

### Task 13: Perfis e RLS

**Files:**
- Create: `supabase/migrations/20260813000600_perfis_e_rls.sql`

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260813000600_perfis_e_rls.sql`:
```sql
create table public.perfis (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel public.papel_usuario not null default 'professor',
  professor_id bigint references public.professores (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tocar_updated_at before update on public.perfis
  for each row execute function public.tocar_updated_at();

create or replace function public.e_gestora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
     where usuario_id = auth.uid() and papel = 'gestora'
  );
$$;

create or replace function public.professor_do_usuario()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select professor_id from public.perfis where usuario_id = auth.uid();
$$;

alter table public.perfis enable row level security;

create policy "usuario le o proprio perfil" on public.perfis
  for select using (usuario_id = auth.uid() or public.e_gestora());
create policy "gestora administra perfis" on public.perfis
  for all using (public.e_gestora()) with check (public.e_gestora());

-- Cadastros: gestora escreve, professor apenas le (precisa dos nomes na agenda).
do $$
declare
  t text;
begin
  foreach t in array array[
    'cidades', 'escolas', 'anos_escolares', 'materias', 'servicos',
    'servico_valor_historico', 'contas', 'feriados', 'professores',
    'professor_percentual_historico', 'responsaveis', 'alunos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "gestora total" on public.%I for all
         using (public.e_gestora()) with check (public.e_gestora())', t);
    execute format(
      'create policy "autenticado le" on public.%I for select
         to authenticated using (true)', t);
  end loop;
end;
$$;

-- Dados financeiros do professor nao sao visiveis a outros professores.
drop policy "autenticado le" on public.professores;
create policy "professor le colegas sem financeiro" on public.professores
  for select to authenticated using (true);
revoke select on public.professor_percentual_historico from authenticated;
drop policy "autenticado le" on public.professor_percentual_historico;

alter table public.turmas enable row level security;
create policy "gestora total" on public.turmas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "professor le suas turmas" on public.turmas for select
  to authenticated using (professor_id = public.professor_do_usuario());

alter table public.matriculas enable row level security;
create policy "gestora total" on public.matriculas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "professor le matriculas de suas turmas" on public.matriculas for select
  to authenticated using (
    exists (
      select 1 from public.turmas t
       where t.id = matriculas.turma_id
         and t.professor_id = public.professor_do_usuario()
    )
  );
```

- [ ] **Step 2: Aplicar**

Run: `npx supabase db reset`
Expected: sem erro.

- [ ] **Step 3: Verificar que o anônimo não lê nada**

Run:
```bash
curl -s "http://127.0.0.1:54321/rest/v1/alunos?select=id" \
  -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2)"
```
Expected: `[]` — RLS bloqueia o anônimo, sem vazar linha alguma.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260813000600_perfis_e_rls.sql
git commit -m "feat(banco): perfis gestora/professor e politicas RLS"
```

---

### Task 14: Clientes Supabase

**Files:**
- Create: `src/dados/cliente.ts`, `src/dados/admin.ts`, `src/dados/middleware.ts`, `middleware.ts`

- [ ] **Step 1: Cliente de navegador e de servidor**

`src/dados/cliente.ts`:
```ts
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
```

- [ ] **Step 2: Cliente administrativo**

`src/dados/admin.ts`:
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Ignora RLS. Uso restrito ao formulario publico de presenca (Plano 2),
 * que valida um token proprio antes de escrever. A service role key nunca
 * pode aparecer em codigo de cliente: o import de `server-only` garante
 * erro de build se isso acontecer.
 */
export function clienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

Run: `npm install server-only`

- [ ] **Step 3: Middleware de sessão**

`middleware.ts` (na raiz do projeto):
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLICAS = ['/login', '/p/']

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (novos) => {
          novos.forEach(({ name, value }) => request.cookies.set(name, value))
          resposta = NextResponse.next({ request })
          novos.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const caminho = request.nextUrl.pathname
  const ehPublica = PUBLICAS.some((p) => caminho.startsWith(p))

  if (!user && !ehPublica) {
    const destino = request.nextUrl.clone()
    destino.pathname = '/login'
    return NextResponse.redirect(destino)
  }

  return resposta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
}
```

- [ ] **Step 4: Verificar a compilação**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/dados/ middleware.ts package.json package-lock.json
git commit -m "feat(dados): clientes Supabase e middleware de sessao"
```

---

## Próximas tarefas deste plano

As tarefas 15–30 cobrem design system, autenticação, motor de cadastros, as dez definições de entidade, telas de Turma e Matrícula, navegação cruzada e seed. Estão detalhadas na continuação do plano, escrita na sequência.

---

## Cobertura do spec neste plano

| Requisito do spec | Tarefas |
|---|---|
| §3.1 Stack | 1, 2 |
| §3.2 Camadas | 3–7 (domínio), 14 (dados) |
| §3.3 Precisão monetária | 3 |
| §4.1 Cadastros | 9, 10, 11 |
| §4.1 Turmas | 12 |
| §4.2 Matrículas | 12 |
| §4.4 Perfis e RLS | 13 |
| §5 Regras de negócio (turma, matrícula) | 5, 6, 7 |
| §8 Testes de domínio | 3, 5, 6, 7 |
