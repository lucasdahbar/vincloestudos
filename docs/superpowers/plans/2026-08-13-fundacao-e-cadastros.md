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

### Task 15: Tokens visuais e tipografia

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Escrever os tokens**

Substituir o conteúdo de `src/app/globals.css` por:
```css
@import 'tailwindcss';

@theme {
  --color-fundo: #fbf8f3;
  --color-superficie: #ffffff;
  --color-superficie-2: #f4efe6;
  --color-borda: #e5dccd;
  --color-tinta: #2b2724;
  --color-tinta-suave: #6b6259;
  --color-destaque: #c0603f;
  --color-destaque-forte: #a34d2f;
  --color-destaque-suave: #f7e9e3;
  --color-apoio: #5c7a63;
  --color-apoio-suave: #e8efe9;
  --color-alerta: #b4571f;
  --color-alerta-suave: #fbeee2;
  --color-erro: #a32f2f;
  --color-erro-suave: #f9e6e6;

  --radius-campo: 0.75rem;
  --radius-cartao: 1.25rem;

  --font-texto: var(--fonte-texto), system-ui, sans-serif;
  --font-titulo: var(--fonte-titulo), Georgia, serif;

  --shadow-cartao: 0 1px 2px rgb(43 39 36 / 0.04), 0 8px 24px rgb(43 39 36 / 0.06);
}

@layer base {
  html {
    background: var(--color-fundo);
    color: var(--color-tinta);
  }

  body {
    font-family: var(--font-texto);
    /* O sistema e usado por muitas horas seguidas: corpo maior que o padrao. */
    font-size: 1.0625rem;
    line-height: 1.6;
  }

  h1, h2, h3 {
    font-family: var(--font-titulo);
    letter-spacing: -0.01em;
  }

  /* Foco sempre visivel: navegacao por teclado e um requisito de acessibilidade. */
  :focus-visible {
    outline: 3px solid var(--color-destaque);
    outline-offset: 2px;
    border-radius: 4px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

- [ ] **Step 2: Carregar as fontes e definir o idioma**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'

const texto = Inter({
  subsets: ['latin'],
  variable: '--fonte-texto',
  display: 'swap',
})

const titulo = Fraunces({
  subsets: ['latin'],
  variable: '--fonte-titulo',
  weight: ['500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mesinha Redonda',
  description: 'Gestão de reforço escolar e aulas particulares',
}

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`}>
      <body className="min-h-dvh bg-fundo text-tinta antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): tokens visuais e tipografia do design system"
```

---

### Task 16: Componentes base do design system

**Files:**
- Create: `src/ui/Botao.tsx`, `src/ui/Campo.tsx`, `src/ui/Cartao.tsx`, `src/ui/Selo.tsx`, `src/ui/EstadoVazio.tsx`

- [ ] **Step 1: Botão**

`src/ui/Botao.tsx`:
```tsx
import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Aparencia = 'primario' | 'secundario' | 'discreto' | 'perigo'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[--radius-campo] ' +
  'px-5 min-h-[44px] font-medium transition-all duration-150 ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none'

const APARENCIAS: Record<Aparencia, string> = {
  primario: 'bg-destaque text-white hover:bg-destaque-forte shadow-sm',
  secundario: 'bg-superficie text-tinta border border-borda hover:bg-superficie-2',
  discreto: 'text-tinta-suave hover:text-tinta hover:bg-superficie-2',
  perigo: 'bg-erro-suave text-erro border border-erro/20 hover:bg-erro hover:text-white',
}

interface Comum {
  aparencia?: Aparencia
  children: ReactNode
}

export function Botao({
  aparencia = 'primario',
  className = '',
  ...props
}: Comum & ComponentProps<'button'>) {
  return <button className={`${BASE} ${APARENCIAS[aparencia]} ${className}`} {...props} />
}

export function BotaoLink({
  aparencia = 'primario',
  className = '',
  ...props
}: Comum & ComponentProps<typeof Link>) {
  return <Link className={`${BASE} ${APARENCIAS[aparencia]} ${className}`} {...props} />
}
```

**Nota sobre alvos de toque:** `min-h-[44px]` não é estético. É o mínimo recomendado para toque confiável, e a usuária principal opera o sistema também no celular.

- [ ] **Step 2: Campo de formulário**

`src/ui/Campo.tsx`:
```tsx
import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  /** Explicacao em linguagem comum. Aparece sempre, nao em tooltip escondido. */
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
  children: ReactNode
}

export function Campo({ etiqueta, ajuda, erro, obrigatorio, children }: CampoProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-tinta">
        {etiqueta}
        {obrigatorio && <span className="ml-1 text-destaque">*</span>}
      </span>
      {ajuda && <span className="mb-2 block text-sm text-tinta-suave">{ajuda}</span>}
      {children}
      {erro && <span className="mt-1 block text-sm text-erro">{erro}</span>}
    </label>
  )
}

export const entradaClasse =
  'w-full min-h-[44px] rounded-[--radius-campo] border border-borda bg-superficie ' +
  'px-4 py-2 text-tinta placeholder:text-tinta-suave/60 ' +
  'transition-colors focus:border-destaque focus:outline-none ' +
  'focus-visible:outline-3 focus-visible:outline-destaque'
```

- [ ] **Step 3: Cartão, selo e estado vazio**

`src/ui/Cartao.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Cartao({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[--radius-cartao] border border-borda bg-superficie p-6 shadow-[--shadow-cartao] ${className}`}
    >
      {children}
    </div>
  )
}
```

`src/ui/Selo.tsx`:
```tsx
type Tom = 'ativo' | 'encerrado' | 'alerta' | 'neutro'

const TONS: Record<Tom, string> = {
  ativo: 'bg-apoio-suave text-apoio',
  encerrado: 'bg-superficie-2 text-tinta-suave',
  alerta: 'bg-alerta-suave text-alerta',
  neutro: 'bg-destaque-suave text-destaque-forte',
}

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function tomDoStatus(status: string): Tom {
  if (status === 'Ativa' || status === 'Ativo' || status === 'Pago') return 'ativo'
  if (status === 'Encerrada' || status === 'Encerrado') return 'encerrado'
  if (status === 'Pendente' || status === 'Parcial') return 'alerta'
  return 'neutro'
}
```

`src/ui/EstadoVazio.tsx`:
```tsx
import type { ReactNode } from 'react'

/**
 * Tabela vazia nao diz o que fazer. Este componente sempre nomeia o proximo passo:
 * e a diferenca entre a usuaria travar e a usuaria seguir sozinha.
 */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[--radius-cartao] border border-dashed border-borda bg-superficie-2/50 px-6 py-16 text-center">
      <h3 className="text-xl">{titulo}</h3>
      <p className="max-w-md text-tinta-suave">{descricao}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Verificar**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/ui/
git commit -m "feat(ui): botao, campo, cartao, selo e estado vazio"
```

---

### Task 17: Animações compartilhadas

**Files:**
- Create: `src/ui/animacoes.ts`, `src/ui/ListaAnimada.tsx`

- [ ] **Step 1: Variantes**

`src/ui/animacoes.ts`:
```ts
import type { Variants } from 'motion/react'

/** Entrada suave de conteudo de pagina. */
export const entrada: Variants = {
  oculto: { opacity: 0, y: 8 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

/** Lista com atraso progressivo entre itens: guia o olho de cima para baixo. */
export const containerEscalonado: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.035 } },
}

export const itemEscalonado: Variants = {
  oculto: { opacity: 0, y: 6 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}
```

- [ ] **Step 2: Wrapper de lista**

`src/ui/ListaAnimada.tsx`:
```tsx
'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { containerEscalonado, itemEscalonado } from './animacoes'

export function ListaAnimada({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={containerEscalonado} initial="oculto" animate="visivel">
      {children}
    </motion.div>
  )
}

export function ItemAnimado({ children }: { children: ReactNode }) {
  return <motion.div variants={itemEscalonado}>{children}</motion.div>
}
```

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/ui/animacoes.ts src/ui/ListaAnimada.tsx
git commit -m "feat(ui): variantes de animacao e lista escalonada"
```

---

### Task 18: Login e sessão

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/acoes.ts`, `src/dados/sessao.ts`

- [ ] **Step 1: Leitura da sessão**

`src/dados/sessao.ts`:
```ts
import 'server-only'
import { redirect } from 'next/navigation'
import { clienteServidor } from './cliente'
import type { Papel } from '@/dominio/tipos'

export interface SessaoAtual {
  usuarioId: string
  nome: string
  papel: Papel
  professorId: number | null
}

export async function sessaoAtual(): Promise<SessaoAtual | null> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome, papel, professor_id')
    .eq('usuario_id', user.id)
    .single()

  if (!perfil) return null

  return {
    usuarioId: user.id,
    nome: perfil.nome,
    papel: perfil.papel,
    professorId: perfil.professor_id,
  }
}

/** Usar no topo de toda pagina protegida. */
export async function exigirSessao(): Promise<SessaoAtual> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/login')
  return sessao
}

export async function exigirGestora(): Promise<SessaoAtual> {
  const sessao = await exigirSessao()
  if (sessao.papel !== 'gestora') redirect('/')
  return sessao
}
```

- [ ] **Step 2: Ações de login e logout**

`src/app/login/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/dados/cliente'

export async function entrar(_anterior: string | null, dados: FormData): Promise<string | null> {
  const email = String(dados.get('email') ?? '').trim()
  const senha = String(dados.get('senha') ?? '')

  if (!email || !senha) return 'Preencha o e-mail e a senha.'

  const supabase = await clienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) return 'E-mail ou senha incorretos. Confira e tente de novo.'

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function sair() {
  const supabase = await clienteServidor()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

- [ ] **Step 3: Tela de login**

`src/app/login/page.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { motion } from 'motion/react'
import { entrar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { entrada } from '@/ui/animacoes'

export default function PaginaLogin() {
  const [erro, acao, pendente] = useActionState(entrar, null)

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.div variants={entrada} initial="oculto" animate="visivel" className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl">Mesinha Redonda</h1>
          <p className="mt-2 text-tinta-suave">Entre para acessar o sistema</p>
        </div>

        <form action={acao} className="flex flex-col gap-5">
          <Campo etiqueta="E-mail" obrigatorio>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className={entradaClasse}
            />
          </Campo>

          <Campo etiqueta="Senha" obrigatorio>
            <input
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className={entradaClasse}
            />
          </Campo>

          {erro && (
            <p role="alert" className="rounded-[--radius-campo] bg-erro-suave px-4 py-3 text-erro">
              {erro}
            </p>
          )}

          <Botao type="submit" disabled={pendente}>
            {pendente ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </motion.div>
    </main>
  )
}
```

- [ ] **Step 4: Criar a gestora no banco local**

Run:
```bash
npx supabase db psql -c "
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'gestora@mesinharedonda.local', crypt('mesinha123', gen_salt('bf')), now(), now(), now());
insert into public.perfis (usuario_id, nome, papel)
select id, 'Gestora', 'gestora' from auth.users where email = 'gestora@mesinharedonda.local';
"
```
Expected: `INSERT 0 1` duas vezes.

- [ ] **Step 5: Testar o login**

Run: `npm run dev` e abrir `http://localhost:3000` no navegador.
Expected: redireciona para `/login`; entrar com `gestora@mesinharedonda.local` / `mesinha123` leva à raiz.

- [ ] **Step 6: Commit**

```bash
git add src/app/login/ src/dados/sessao.ts
git commit -m "feat(auth): login, logout e leitura de sessao com papel"
```

---

### Task 19: Layout do app e navegação

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/ui/NavLateral.tsx`
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`

- [ ] **Step 1: Navegação lateral**

`src/ui/NavLateral.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import type { Papel } from '@/dominio/tipos'

interface Secao {
  titulo: string
  itens: { rotulo: string; href: string; papeis?: Papel[] }[]
}

const SECOES: Secao[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      { rotulo: 'Início', href: '/' },
      { rotulo: 'Turmas', href: '/turmas' },
      { rotulo: 'Matrículas', href: '/matriculas', papeis: ['gestora'] },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { rotulo: 'Responsáveis', href: '/cadastros/responsaveis', papeis: ['gestora'] },
      { rotulo: 'Alunos', href: '/cadastros/alunos', papeis: ['gestora'] },
      { rotulo: 'Professores', href: '/cadastros/professores', papeis: ['gestora'] },
      { rotulo: 'Escolas', href: '/cadastros/escolas', papeis: ['gestora'] },
      { rotulo: 'Serviços', href: '/cadastros/servicos', papeis: ['gestora'] },
      { rotulo: 'Matérias', href: '/cadastros/materias', papeis: ['gestora'] },
      { rotulo: 'Anos escolares', href: '/cadastros/anos-escolares', papeis: ['gestora'] },
      { rotulo: 'Cidades', href: '/cadastros/cidades', papeis: ['gestora'] },
      { rotulo: 'Contas', href: '/cadastros/contas', papeis: ['gestora'] },
      { rotulo: 'Feriados', href: '/cadastros/feriados', papeis: ['gestora'] },
    ],
  },
]

export function NavLateral({ papel }: { papel: Papel }) {
  const caminho = usePathname()

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6 p-4">
      {SECOES.map((secao) => {
        const visiveis = secao.itens.filter((i) => !i.papeis || i.papeis.includes(papel))
        if (visiveis.length === 0) return null

        return (
          <div key={secao.titulo}>
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-tinta-suave">
              {secao.titulo}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {visiveis.map((item) => {
                const ativo =
                  item.href === '/' ? caminho === '/' : caminho.startsWith(item.href)
                return (
                  <li key={item.href} className="relative">
                    {ativo && (
                      <motion.span
                        layoutId="nav-ativo"
                        className="absolute inset-0 rounded-[--radius-campo] bg-destaque-suave"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Link
                      href={item.href}
                      aria-current={ativo ? 'page' : undefined}
                      className={`relative flex min-h-[44px] items-center rounded-[--radius-campo] px-3 transition-colors ${
                        ativo ? 'font-medium text-destaque-forte' : 'text-tinta-suave hover:text-tinta'
                      }`}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
```

**Nota:** o `layoutId` faz o realce deslizar entre itens em vez de piscar. É a animação que mais comunica "você está aqui".

- [ ] **Step 2: Layout protegido**

`src/app/(app)/layout.tsx`:
```tsx
import { exigirSessao } from '@/dados/sessao'
import { NavLateral } from '@/ui/NavLateral'
import { sair } from '@/app/login/acoes'
import { Botao } from '@/ui/Botao'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao()

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px]">
      <aside className="hidden w-64 shrink-0 border-r border-borda bg-superficie-2/40 md:flex md:flex-col">
        <div className="px-7 py-6">
          <p className="font-[family-name:--font-titulo] text-xl leading-tight">
            Mesinha
            <br />
            Redonda
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLateral papel={sessao.papel} />
        </div>
        <div className="border-t border-borda p-4">
          <p className="px-3 pb-2 text-sm text-tinta-suave">{sessao.nome}</p>
          <form action={sair}>
            <Botao aparencia="discreto" className="w-full justify-start px-3">
              Sair
            </Botao>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Mover a página inicial**

Run:
```bash
mkdir -p "src/app/(app)"
git mv src/app/page.tsx "src/app/(app)/page.tsx"
```

- [ ] **Step 4: Página inicial provisória**

`src/app/(app)/page.tsx`:
```tsx
import { exigirSessao } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'

export default async function PaginaInicial() {
  const sessao = await exigirSessao()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Olá, {sessao.nome}</h1>
        <p className="mt-1 text-tinta-suave">Bem-vinda ao sistema da Mesinha Redonda.</p>
      </header>
      <Cartao>
        <p className="text-tinta-suave">
          O painel com aulas do dia, reposições pendentes e cobranças em aberto chega no
          Plano 3. Por enquanto, use o menu ao lado para os cadastros.
        </p>
      </Cartao>
    </div>
  )
}
```

- [ ] **Step 5: Verificar**

Run: `npm run build && npm run dev`
Expected: build limpo; a raiz mostra a navegação lateral com o nome da gestora.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): layout do app com navegacao lateral por papel"
```

---

### Task 20: Motor de cadastros — definição de entidade

O sistema tem dez cadastros com o mesmo comportamento: listar, filtrar, criar, editar, ativar/desativar. Implementar dez vezes seria dez vezes a superfície de bug. Em vez disso, uma definição declarativa por entidade alimenta uma engine única.

**Files:**
- Create: `src/cadastros/tipos.ts`
- Test: `src/cadastros/tipos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/cadastros/tipos.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCadastro, valoresIniciais } from './tipos'

const materias = defineCadastro({
  tabela: 'materias',
  rotulo: { singular: 'Matéria', plural: 'Matérias', genero: 'f' },
  rota: 'materias',
  ordenacao: { coluna: 'nome' },
  campos: [
    { nome: 'nome', etiqueta: 'Nome', tipo: 'texto', schema: z.string().min(1), naLista: true },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

describe('defineCadastro', () => {
  it('preserva a definicao', () => {
    expect(materias.tabela).toBe('materias')
    expect(materias.campos).toHaveLength(2)
  })

  it('monta um schema Zod a partir dos campos', () => {
    expect(materias.schema.parse({ nome: 'Matemática', ativo: true })).toEqual({
      nome: 'Matemática',
      ativo: true,
    })
    expect(() => materias.schema.parse({ nome: '', ativo: true })).toThrow()
  })

  it('expoe apenas os campos marcados para a lista', () => {
    expect(materias.camposDaLista.map((c) => c.nome)).toEqual(['nome'])
  })
})

describe('valoresIniciais', () => {
  it('usa o padrao declarado quando existe', () => {
    expect(valoresIniciais(materias)).toEqual({ nome: '', ativo: true })
  })

  it('usa o registro existente na edicao', () => {
    expect(valoresIniciais(materias, { nome: 'Física', ativo: false })).toEqual({
      nome: 'Física',
      ativo: false,
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- cadastros/tipos`
Expected: FAIL — `Failed to resolve import "./tipos"`

- [ ] **Step 3: Implementar**

`src/cadastros/tipos.ts`:
```ts
import { z } from 'zod'

export type TipoCampo =
  | 'texto'
  | 'texto-longo'
  | 'numero'
  | 'dinheiro'
  | 'percentual'
  | 'data'
  | 'booleano'
  | 'selecao'
  | 'referencia'

export interface DefinicaoCampo {
  nome: string
  etiqueta: string
  tipo: TipoCampo
  schema: z.ZodTypeAny
  /** Explicacao em linguagem comum, exibida sob a etiqueta. */
  ajuda?: string
  padrao?: unknown
  /** Aparece na tabela de listagem. */
  naLista?: boolean
  /** Entra na busca por texto livre. */
  buscavel?: boolean
  /** Opcoes para `selecao`. */
  opcoes?: readonly string[]
  /** Tabela alvo para `referencia`. */
  referencia?: { tabela: string; rotulo: string; rota?: string }
}

export interface DefinicaoCadastro {
  tabela: string
  rota: string
  rotulo: { singular: string; plural: string; genero: 'm' | 'f' }
  ordenacao: { coluna: string; ascendente?: boolean }
  campos: DefinicaoCampo[]
  /** Texto do estado vazio. Sempre nomeia o proximo passo. */
  dicaVazio?: string
  schema: z.ZodObject<z.ZodRawShape>
  camposDaLista: DefinicaoCampo[]
  camposBuscaveis: DefinicaoCampo[]
}

type EntradaDefinicao = Omit<
  DefinicaoCadastro,
  'schema' | 'camposDaLista' | 'camposBuscaveis'
>

export function defineCadastro(entrada: EntradaDefinicao): DefinicaoCadastro {
  const forma: z.ZodRawShape = {}
  for (const campo of entrada.campos) forma[campo.nome] = campo.schema

  return {
    ...entrada,
    schema: z.object(forma),
    camposDaLista: entrada.campos.filter((c) => c.naLista),
    camposBuscaveis: entrada.campos.filter((c) => c.buscavel),
  }
}

const VAZIO_POR_TIPO: Record<TipoCampo, unknown> = {
  texto: '',
  'texto-longo': '',
  numero: null,
  dinheiro: '',
  percentual: '',
  data: '',
  booleano: false,
  selecao: '',
  referencia: null,
}

export function valoresIniciais(
  definicao: DefinicaoCadastro,
  registro?: Record<string, unknown>,
): Record<string, unknown> {
  const valores: Record<string, unknown> = {}
  for (const campo of definicao.campos) {
    if (registro && campo.nome in registro) {
      valores[campo.nome] = registro[campo.nome]
    } else if ('padrao' in campo) {
      valores[campo.nome] = campo.padrao
    } else {
      valores[campo.nome] = VAZIO_POR_TIPO[campo.tipo]
    }
  }
  return valores
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- cadastros/tipos`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/cadastros/
git commit -m "feat(cadastros): definicao declarativa de entidade com schema derivado"
```

---

### Task 21: Repositório genérico

**Files:**
- Create: `src/dados/crud.ts`

- [ ] **Step 1: Implementar**

`src/dados/crud.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'
import type { DefinicaoCadastro } from '@/cadastros/tipos'

export interface Registro {
  id: number
  [coluna: string]: unknown
}

/** Monta o `select` do PostgREST incluindo o rotulo de cada referencia. */
function selectDe(definicao: DefinicaoCadastro): string {
  const colunas = ['id', ...definicao.campos.map((c) => c.nome)]
  const juncoes = definicao.campos
    .filter((c) => c.tipo === 'referencia' && c.referencia)
    .map((c) => `${c.nome}_ref:${c.referencia!.tabela}!${c.nome}(id, ${c.referencia!.rotulo})`)
  return [...colunas, ...juncoes].join(', ')
}

export async function listar(
  definicao: DefinicaoCadastro,
  opcoes: { busca?: string; somenteAtivos?: boolean } = {},
): Promise<Registro[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from(definicao.tabela).select(selectDe(definicao))

  if (opcoes.busca && definicao.camposBuscaveis.length > 0) {
    const termo = opcoes.busca.replace(/[%,()]/g, '')
    const clausulas = definicao.camposBuscaveis.map((c) => `${c.nome}.ilike.%${termo}%`)
    consulta = consulta.or(clausulas.join(','))
  }

  if (opcoes.somenteAtivos && definicao.campos.some((c) => c.nome === 'ativo')) {
    consulta = consulta.eq('ativo', true)
  }

  const { data, error } = await consulta.order(definicao.ordenacao.coluna, {
    ascending: definicao.ordenacao.ascendente ?? true,
  })

  if (error) throw new Error(`Falha ao listar ${definicao.rotulo.plural}: ${error.message}`)
  return (data ?? []) as unknown as Registro[]
}

export async function obter(
  definicao: DefinicaoCadastro,
  id: number,
): Promise<Registro | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from(definicao.tabela)
    .select(selectDe(definicao))
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar ${definicao.rotulo.singular}: ${error.message}`)
  return (data ?? null) as unknown as Registro | null
}

export async function criar(
  definicao: DefinicaoCadastro,
  valores: Record<string, unknown>,
): Promise<number> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from(definicao.tabela)
    .insert(valores)
    .select('id')
    .single()

  if (error) throw new Error(traduzirErro(error.message, definicao))
  return data.id as number
}

export async function atualizar(
  definicao: DefinicaoCadastro,
  id: number,
  valores: Record<string, unknown>,
): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase.from(definicao.tabela).update(valores).eq('id', id)
  if (error) throw new Error(traduzirErro(error.message, definicao))
}

/**
 * Registros nunca sao removidos: cadastros sao referenciados por historico
 * financeiro. Desativar preserva o passado e some das listas de escolha.
 */
export async function alternarAtivo(
  definicao: DefinicaoCadastro,
  id: number,
  ativo: boolean,
): Promise<void> {
  await atualizar(definicao, id, { ativo })
}

/** Mensagens do Postgres nao servem para a gestora. Estas servem. */
function traduzirErro(mensagem: string, definicao: DefinicaoCadastro): string {
  if (mensagem.includes('duplicate key')) {
    return `Já existe ${definicao.rotulo.genero === 'f' ? 'uma' : 'um'} ${definicao.rotulo.singular.toLowerCase()} com esses dados.`
  }
  if (mensagem.includes('violates foreign key')) {
    return 'Um dos itens selecionados não existe mais. Recarregue a página e tente de novo.'
  }
  if (mensagem.includes('violates row-level security')) {
    return 'Você não tem permissão para esta ação.'
  }
  return mensagem
}
```

- [ ] **Step 2: Verificar a compilação**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/dados/crud.ts
git commit -m "feat(dados): repositorio generico com traducao de erros"
```

---

### Task 22: Formulário genérico

**Files:**
- Create: `src/cadastros/motor/CampoDinamico.tsx`, `src/cadastros/motor/Formulario.tsx`, `src/cadastros/motor/acoes.ts`

- [ ] **Step 1: Renderizador de campo**

`src/cadastros/motor/CampoDinamico.tsx`:
```tsx
'use client'

import { Campo, entradaClasse } from '@/ui/Campo'
import type { DefinicaoCampo } from '@/cadastros/tipos'

export interface OpcaoReferencia {
  id: number
  rotulo: string
}

interface Props {
  campo: DefinicaoCampo
  valor: unknown
  erro?: string
  referencias: Record<string, OpcaoReferencia[]>
  aoMudar: (nome: string, valor: unknown) => void
}

export function CampoDinamico({ campo, valor, erro, referencias, aoMudar }: Props) {
  const obrigatorio = !campo.schema.isOptional() && !campo.schema.isNullable()

  if (campo.tipo === 'booleano') {
    return (
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => aoMudar(campo.nome, e.target.checked)}
          className="size-5 accent-[--color-destaque]"
        />
        <span>
          <span className="font-medium">{campo.etiqueta}</span>
          {campo.ajuda && <span className="block text-sm text-tinta-suave">{campo.ajuda}</span>}
        </span>
      </label>
    )
  }

  return (
    <Campo etiqueta={campo.etiqueta} ajuda={campo.ajuda} erro={erro} obrigatorio={obrigatorio}>
      {campo.tipo === 'texto-longo' ? (
        <textarea
          rows={3}
          value={String(valor ?? '')}
          onChange={(e) => aoMudar(campo.nome, e.target.value)}
          className={entradaClasse}
        />
      ) : campo.tipo === 'selecao' ? (
        <select
          value={String(valor ?? '')}
          onChange={(e) => aoMudar(campo.nome, e.target.value)}
          className={entradaClasse}
        >
          <option value="">Selecione…</option>
          {campo.opcoes?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : campo.tipo === 'referencia' ? (
        <select
          value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={(e) =>
            aoMudar(campo.nome, e.target.value === '' ? null : Number(e.target.value))
          }
          className={entradaClasse}
        >
          <option value="">Selecione…</option>
          {(referencias[campo.nome] ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={
            campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'
          }
          inputMode={
            campo.tipo === 'dinheiro' || campo.tipo === 'percentual' ? 'decimal' : undefined
          }
          placeholder={
            campo.tipo === 'dinheiro' ? '0,00' : campo.tipo === 'percentual' ? '60' : undefined
          }
          value={String(valor ?? '')}
          onChange={(e) =>
            aoMudar(
              campo.nome,
              campo.tipo === 'numero'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          className={entradaClasse}
        />
      )}
    </Campo>
  )
}
```

- [ ] **Step 2: Ações de servidor**

`src/cadastros/motor/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { atualizar, criar } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'
import { CADASTROS } from '@/cadastros/definicoes'
import { deReal } from '@/dominio/dinheiro'

export interface ResultadoSalvar {
  ok: boolean
  mensagem?: string
  errosPorCampo?: Record<string, string>
  id?: number
}

/** Converte os valores da UI para o formato aceito pelo banco. */
function normalizar(rota: string, valores: Record<string, unknown>) {
  const definicao = CADASTROS[rota]
  const saida: Record<string, unknown> = {}

  for (const campo of definicao.campos) {
    const bruto = valores[campo.nome]

    if (campo.tipo === 'dinheiro') {
      saida[campo.nome] = (deReal(String(bruto ?? '0')) / 100).toFixed(2)
    } else if (campo.tipo === 'percentual') {
      saida[campo.nome] = Number(String(bruto ?? '0').replace(',', '.'))
    } else if (typeof bruto === 'string' && bruto.trim() === '') {
      saida[campo.nome] = campo.tipo === 'texto' || campo.tipo === 'texto-longo' ? null : null
    } else {
      saida[campo.nome] = bruto
    }
  }

  return saida
}

export async function salvarCadastro(
  rota: string,
  id: number | null,
  valores: Record<string, unknown>,
): Promise<ResultadoSalvar> {
  await exigirGestora()

  const definicao = CADASTROS[rota]
  if (!definicao) return { ok: false, mensagem: 'Cadastro desconhecido.' }

  const validacao = definicao.schema.safeParse(valores)
  if (!validacao.success) {
    const errosPorCampo: Record<string, string> = {}
    for (const issue of validacao.error.issues) {
      const campo = String(issue.path[0] ?? '')
      if (campo && !errosPorCampo[campo]) errosPorCampo[campo] = issue.message
    }
    return { ok: false, mensagem: 'Confira os campos destacados.', errosPorCampo }
  }

  try {
    const dados = normalizar(rota, validacao.data as Record<string, unknown>)
    const idFinal = id === null ? await criar(definicao, dados) : (await atualizar(definicao, id, dados), id)
    revalidatePath(`/cadastros/${rota}`)
    return { ok: true, id: idFinal }
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : 'Erro ao salvar.' }
  }
}

export async function alternarAtivoCadastro(rota: string, id: number, ativo: boolean) {
  await exigirGestora()
  const definicao = CADASTROS[rota]
  await atualizar(definicao, id, { ativo })
  revalidatePath(`/cadastros/${rota}`)
}
```

- [ ] **Step 3: Formulário**

`src/cadastros/motor/Formulario.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { CampoDinamico, type OpcaoReferencia } from './CampoDinamico'
import { salvarCadastro } from './acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entrada } from '@/ui/animacoes'
import { valoresIniciais, type DefinicaoCadastro } from '@/cadastros/tipos'

interface Props {
  definicao: DefinicaoCadastro
  registro?: Record<string, unknown> & { id: number }
  referencias: Record<string, OpcaoReferencia[]>
}

export function Formulario({ definicao, registro, referencias }: Props) {
  const router = useRouter()
  const [valores, setValores] = useState(() => valoresIniciais(definicao, registro))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function mudar(nome: string, valor: unknown) {
    setValores((atual) => ({ ...atual, [nome]: valor }))
    setErros(({ [nome]: _removido, ...resto }) => resto)
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setMensagem(null)

    iniciar(async () => {
      const resultado = await salvarCadastro(definicao.rota, registro?.id ?? null, valores)
      if (resultado.ok) {
        router.push(`/cadastros/${definicao.rota}`)
        router.refresh()
      } else {
        setErros(resultado.errosPorCampo ?? {})
        setMensagem(resultado.mensagem ?? 'Não foi possível salvar.')
      }
    })
  }

  return (
    <motion.form
      variants={entrada}
      initial="oculto"
      animate="visivel"
      onSubmit={enviar}
      className="max-w-2xl"
    >
      <Cartao className="flex flex-col gap-5">
        {definicao.campos.map((campo) => (
          <CampoDinamico
            key={campo.nome}
            campo={campo}
            valor={valores[campo.nome]}
            erro={erros[campo.nome]}
            referencias={referencias}
            aoMudar={mudar}
          />
        ))}
      </Cartao>

      {mensagem && (
        <p role="alert" className="mt-4 rounded-[--radius-campo] bg-erro-suave px-4 py-3 text-erro">
          {mensagem}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </motion.form>
  )
}
```

- [ ] **Step 4: Commit** (a compilação só fecha após a Task 23, que cria `@/cadastros/definicoes`)

```bash
git add src/cadastros/motor/
git commit -m "feat(cadastros): formulario generico com validacao por campo"
```

---

### Task 23: Definições das dez entidades

**Files:**
- Create: `src/cadastros/definicoes/index.ts` e um arquivo por entidade

- [ ] **Step 1: Cadastros simples**

`src/cadastros/definicoes/simples.ts`:
```ts
import { z } from 'zod'
import { defineCadastro } from '@/cadastros/tipos'
import { ABRANGENCIAS_FERIADO, TIPOS_CONTA } from '@/dominio/tipos'

const textoObrigatorio = (rotulo: string) =>
  z.string().trim().min(1, `Informe ${rotulo}.`)

export const materias = defineCadastro({
  tabela: 'materias',
  rota: 'materias',
  rotulo: { singular: 'Matéria', plural: 'Matérias', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre as matérias que sua equipe ensina, como Matemática ou Português.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da matéria',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da matéria'),
      naLista: true,
      buscavel: true,
    },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const anosEscolares = defineCadastro({
  tabela: 'anos_escolares',
  rota: 'anos-escolares',
  rotulo: { singular: 'Ano escolar', plural: 'Anos escolares', genero: 'm' },
  ordenacao: { coluna: 'ordem' },
  dicaVazio: 'Cadastre os anos escolares atendidos, como "9º ano — Fundamental".',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do ano escolar'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'ordem',
      etiqueta: 'Ordem de exibição',
      tipo: 'numero',
      ajuda: 'Define a sequência nas listas. O 1º ano vem antes do 9º.',
      schema: z.number().int().min(0),
      padrao: 0,
      naLista: true,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const cidades = defineCadastro({
  tabela: 'cidades',
  rota: 'cidades',
  rotulo: { singular: 'Cidade', plural: 'Cidades', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre as cidades onde ficam as escolas e os responsáveis.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da cidade'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'uf',
      etiqueta: 'Estado (UF)',
      tipo: 'texto',
      schema: z.string().trim().length(2, 'Use a sigla de 2 letras, como SP.').nullable(),
      naLista: true,
    },
  ],
})

export const contas = defineCadastro({
  tabela: 'contas',
  rota: 'contas',
  rotulo: { singular: 'Conta', plural: 'Contas', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre onde o dinheiro entra e sai: conta do banco, Pix, dinheiro em espécie.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da conta',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da conta'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'tipo',
      etiqueta: 'Tipo',
      tipo: 'selecao',
      opcoes: TIPOS_CONTA,
      schema: z.enum(TIPOS_CONTA),
      padrao: 'Banco',
      naLista: true,
    },
    { nome: 'banco', etiqueta: 'Banco', tipo: 'texto', schema: z.string().nullable() },
    {
      nome: 'chave_pix',
      etiqueta: 'Chave Pix',
      tipo: 'texto',
      ajuda: 'Aparece no texto de cobrança enviado aos responsáveis.',
      schema: z.string().nullable(),
    },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const feriados = defineCadastro({
  tabela: 'feriados',
  rota: 'feriados',
  rotulo: { singular: 'Feriado', plural: 'Feriados', genero: 'm' },
  ordenacao: { coluna: 'data' },
  dicaVazio:
    'Cadastre os feriados para o sistema avisar quando uma aula cair em um deles.',
  campos: [
    {
      nome: 'data',
      etiqueta: 'Data',
      tipo: 'data',
      schema: z.string().min(1, 'Informe a data.'),
      naLista: true,
    },
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do feriado'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'abrangencia',
      etiqueta: 'Abrangência',
      tipo: 'selecao',
      opcoes: ABRANGENCIAS_FERIADO,
      schema: z.enum(ABRANGENCIAS_FERIADO),
      padrao: 'Nacional',
      naLista: true,
    },
  ],
})

export const escolas = defineCadastro({
  tabela: 'escolas',
  rota: 'escolas',
  rotulo: { singular: 'Escola', plural: 'Escolas', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre as escolas dos seus alunos.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da escola',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da escola'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'cidade_id',
      etiqueta: 'Cidade',
      tipo: 'referencia',
      referencia: { tabela: 'cidades', rotulo: 'nome', rota: 'cidades' },
      schema: z.number().int().nullable(),
      naLista: true,
    },
    { nome: 'endereco', etiqueta: 'Endereço', tipo: 'texto', schema: z.string().nullable() },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'texto', schema: z.string().nullable() },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const servicos = defineCadastro({
  tabela: 'servicos',
  rota: 'servicos',
  rotulo: { singular: 'Serviço', plural: 'Serviços', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio:
    'Cadastre o que você vende: aula regular, aulão de revisão, aula particular.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome do serviço',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do serviço'),
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'descricao',
      etiqueta: 'Descrição',
      tipo: 'texto-longo',
      schema: z.string().nullable(),
    },
    {
      nome: 'valor_padrao',
      etiqueta: 'Valor por aula',
      tipo: 'dinheiro',
      ajuda: 'Usado nas cobranças e no cálculo do repasse ao professor.',
      schema: z.string().min(1, 'Informe o valor por aula.'),
      naLista: true,
    },
    {
      nome: 'permite_materia',
      etiqueta: 'Este serviço tem matéria',
      tipo: 'booleano',
      ajuda: 'Marque se as turmas deste serviço precisam indicar a matéria ensinada.',
      schema: z.boolean(),
      padrao: true,
    },
    {
      nome: 'permite_escola',
      etiqueta: 'Este serviço tem escola',
      tipo: 'booleano',
      ajuda: 'Marque se as turmas deste serviço são ligadas a uma escola específica.',
      schema: z.boolean(),
      padrao: true,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})
```

- [ ] **Step 2: Pessoas**

`src/cadastros/definicoes/pessoas.ts`:
```ts
import { z } from 'zod'
import { defineCadastro } from '@/cadastros/tipos'
import { CANAIS_NOTIFICACAO, DESTINATARIOS_NOTIFICACAO } from '@/dominio/tipos'

const nome = z.string().trim().min(1, 'Informe o nome.')
const opcional = z.string().nullable()

export const professores = defineCadastro({
  tabela: 'professores',
  rota: 'professores',
  rotulo: { singular: 'Professor', plural: 'Professores', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre os professores que dão as aulas.',
  campos: [
    { nome: 'nome', etiqueta: 'Nome', tipo: 'texto', schema: nome, naLista: true, buscavel: true },
    {
      nome: 'percentual_repasse',
      etiqueta: 'Percentual de repasse (%)',
      tipo: 'percentual',
      ajuda:
        'Quanto o professor recebe por aula, em porcentagem do valor do serviço. Ex.: 60. Alterar aqui não muda pagamentos já fechados.',
      schema: z
        .string()
        .min(1, 'Informe o percentual.')
        .refine((v) => {
          const n = Number(v.replace(',', '.'))
          return Number.isFinite(n) && n >= 0 && n <= 100
        }, 'Use um número entre 0 e 100.'),
      naLista: true,
    },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'texto', schema: opcional, naLista: true },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'texto', schema: opcional },
    {
      nome: 'chave_pix',
      etiqueta: 'Chave Pix',
      tipo: 'texto',
      ajuda: 'Para onde o pagamento do professor é enviado.',
      schema: opcional,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const responsaveis = defineCadastro({
  tabela: 'responsaveis',
  rota: 'responsaveis',
  rotulo: { singular: 'Responsável', plural: 'Responsáveis', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre os pais e responsáveis. É para eles que as cobranças são emitidas.',
  campos: [
    { nome: 'nome', etiqueta: 'Nome', tipo: 'texto', schema: nome, naLista: true, buscavel: true },
    {
      nome: 'telefone',
      etiqueta: 'Telefone (WhatsApp)',
      tipo: 'texto',
      ajuda: 'Número usado para enviar cobranças e avisos.',
      schema: opcional,
      naLista: true,
      buscavel: true,
    },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'texto', schema: opcional },
    { nome: 'endereco', etiqueta: 'Endereço', tipo: 'texto', schema: opcional },
    {
      nome: 'cidade_id',
      etiqueta: 'Cidade',
      tipo: 'referencia',
      referencia: { tabela: 'cidades', rotulo: 'nome', rota: 'cidades' },
      schema: z.number().int().nullable(),
    },
    { nome: 'observacao', etiqueta: 'Observações', tipo: 'texto-longo', schema: opcional },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const alunos = defineCadastro({
  tabela: 'alunos',
  rota: 'alunos',
  rotulo: { singular: 'Aluno', plural: 'Alunos', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio:
    'Cadastre os alunos. Cada aluno precisa de um responsável cadastrado antes.',
  campos: [
    { nome: 'nome', etiqueta: 'Nome', tipo: 'texto', schema: nome, naLista: true, buscavel: true },
    {
      nome: 'responsavel_id',
      etiqueta: 'Responsável',
      tipo: 'referencia',
      ajuda: 'Quem recebe e paga as cobranças deste aluno.',
      referencia: { tabela: 'responsaveis', rotulo: 'nome', rota: 'responsaveis' },
      schema: z.number({ message: 'Selecione o responsável.' }).int(),
      naLista: true,
    },
    {
      nome: 'escola_id',
      etiqueta: 'Escola',
      tipo: 'referencia',
      referencia: { tabela: 'escolas', rotulo: 'nome', rota: 'escolas' },
      schema: z.number().int().nullable(),
      naLista: true,
    },
    { nome: 'data_nascimento', etiqueta: 'Data de nascimento', tipo: 'data', schema: opcional },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'texto', schema: opcional },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    {
      nome: 'destinatario_notificacao',
      etiqueta: 'Quem recebe os avisos',
      tipo: 'selecao',
      ajuda: 'Para quem enviar o link das aulas online e as boas-vindas.',
      opcoes: DESTINATARIOS_NOTIFICACAO,
      schema: z.enum(DESTINATARIOS_NOTIFICACAO),
      padrao: 'Responsável',
    },
    {
      nome: 'canal_notificacao',
      etiqueta: 'Por onde avisar',
      tipo: 'selecao',
      opcoes: CANAIS_NOTIFICACAO,
      schema: z.enum(CANAIS_NOTIFICACAO),
      padrao: 'WhatsApp',
    },
    { nome: 'observacao', etiqueta: 'Observações', tipo: 'texto-longo', schema: opcional },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})
```

**Nota:** `alunos` não tem campo de ano escolar. Isso é deliberado — Ajuste 3 do Adendo. O ano vem da Turma.

- [ ] **Step 3: Índice**

`src/cadastros/definicoes/index.ts`:
```ts
import type { DefinicaoCadastro } from '@/cadastros/tipos'
import {
  anosEscolares,
  cidades,
  contas,
  escolas,
  feriados,
  materias,
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
    cidades,
    contas,
    feriados,
  ].map((d) => [d.rota, d]),
)

export const ROTAS_DE_CADASTRO = Object.keys(CADASTROS)
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: sem erros de tipo; testes passando.

- [ ] **Step 5: Commit**

```bash
git add src/cadastros/definicoes/
git commit -m "feat(cadastros): definicoes das dez entidades base"
```

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
