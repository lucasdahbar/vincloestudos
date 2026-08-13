# Mesinha Redonda OS — Plano 1: Fundação e Cadastros

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o sistema rodando com autenticação, design system, banco local e todos os cadastros do Módulo de Cadastros funcionando — incluindo Turmas e Matrículas.

**Architecture:** Next.js 15 (App Router) sobre Supabase Postgres local. Três camadas com dependência unidirecional: `app → dados → dominio`. Os dez cadastros base não são dez implementações — são uma engine de CRUD genérica alimentada por definições declarativas (Zod + metadados de UI), uma por entidade. Turmas e Matrículas têm telas próprias por causa das regras condicionais.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript strict, Supabase (Postgres + Auth), Tailwind CSS v4, Motion, Zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-13-mesinha-redonda-design.md`

## Notas de versão — leia antes de escrever código

O scaffold instalou **Next.js 16.3**, não a 15. O Next 16 tem mudanças que invalidam padrões comuns:

| Mudança | O que fazer |
|---|---|
| `middleware.ts` foi renomeado para **`proxy.ts`** | Arquivo `proxy.ts` na raiz, exportando `proxy`, não `middleware`. Runtime é sempre Node.js. |
| `params` e `searchParams` são **sempre Promise** | Já assumido em todo este plano: `params: Promise<{...}>` com `await`. |
| `next lint` foi removido | `npm run lint` roda `eslint` direto (já configurado pelo scaffold). `next build` não roda lint. |
| Turbopack é o padrão | Nada a fazer. |
| `revalidateTag` exige segundo argumento | Este plano usa apenas `revalidatePath`, que não mudou. |

**Tailwind v4:** tokens declarados em `@theme` viram utilitários automaticamente. Um token `--radius-cartao` gera a classe `rounded-cartao`; `--shadow-cartao` gera `shadow-cartao`; `--font-titulo` gera `font-titulo`. **Use sempre o nome do utilitário gerado**, nunca a sintaxe de valor arbitrário `rounded-cartao`, que não resolve em v4.

**Zod 4:** `z.enum(arrayReadonly)` e `z.number({ message: '...' })` são a sintaxe correta (a v3 usava `required_error`). Não use `schema.isOptional()` para inferir obrigatoriedade — este plano declara um campo `obrigatorio` explícito. `z.ZodRawShape` é readonly: construa a forma de uma vez com `Object.fromEntries`, não por mutação.

**⚠️ Fronteira Server → Client (aprendido na marra):** um Server Component só pode passar **objetos simples** como prop para um Client Component. Instância de classe — como um schema Zod — quebra a renderização com `Only plain objects... can be passed to Client Components`, **em runtime**. Nem `npm run build` nem `tsc --noEmit` acusam: o build compila e os tipos fecham. Foi assim que as dez rotas `/cadastros/*` foram parar em HTTP 500 sem ninguém perceber.

Por isso `DefinicaoCadastro` (com schemas, server-side) tem uma projeção `CadastroCliente` (sem schemas), e `paraCliente()` faz a conversão. **Toda prop que atravessa para um Client Component precisa ser serializável.** Antes de passar qualquer objeto rico como prop, pergunte se ele carrega classe, função ou `Date` dentro.

**Verificação só vale com sessão.** Rota protegida devolve 307 para `/login` sem cookie — o que prova apenas que a rota existe, não que funciona. Verificação de verdade faz login pela API de auth, monta o cookie `sb-<ref>-auth-token` no formato do `@supabase/ssr` (base64, fatiado em `.0`/`.1` se passar de ~3180 chars) e confere que o dado do banco aparece no HTML.

A documentação da versão exata instalada está em `node_modules/next/dist/docs/`. Em caso de dúvida sobre uma API do Next, consulte lá antes de escrever.

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
  // O ICU insere um espaco nao-quebravel depois de "R$" -- U+00A0 em versoes
  // antigas, U+202F nas atuais. \s cobre os dois sem depender de escape, e
  // nao ha outro espaco possivel nesta string. Normalizar importa: o texto
  // vai para o WhatsApp e e comparado em teste.
  return formatador.format(centavos / 100).replace(/\s/g, ' ')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- dinheiro`
Expected: PASS, 11 testes.

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
Expected: PASS, 4 arquivos, 34 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/matriculas/
git commit -m "feat(dominio): validacao de matricula aluno-turma"
```

---

### Task 8: Supabase local e migration de fundação

**Files:**
- Create: `supabase/config.toml` (gerado), `supabase/migrations/20260813000100_fundacao.sql`, `.env.local`, `.env.example`

> **Ambiente: banco REMOTO, sem Docker.** O WSL desta máquina não tem distribuição instalada, então o Supabase local (que roda em contêiner) não sobe. O projeto **Mesinha Redonda** (`ixegxvjimyhlvkyarcyr`, Postgres 17.6, us-east-2) já está criado e vinculado via `supabase link`, e `.env.local` já tem URL, anon key e service_role key.
>
> ⚠️ **Nunca rode `supabase db reset` neste projeto.** Com o projeto vinculado, ele apaga o banco remoto. O comando para aplicar migrations aqui é **`npx supabase db push`**, que é incremental e só aplica o que ainda não está no histórico.
>
> Para conferir dados, o CLI remoto não oferece `db psql`. Use `node scripts/consultar.mjs <tabela> [colunas]`, que consulta via service_role key.

- [x] **Step 1: Vincular o projeto remoto** — feito

```bash
npx supabase init
npx supabase link --project-ref ixegxvjimyhlvkyarcyr
npx supabase migration list   # confirma a conexão
```

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

- [ ] **Step 4: Aplicar no banco remoto**

Run: `npx supabase db push`
Expected: `Applying migration 20260813000100_fundacao.sql...` e `Finished supabase db push.` sem erro de SQL.

- [x] **Step 5: Arquivos de ambiente** — feito

`.env.example` (versionado, sem segredo) e `.env.local` (ignorado, com os valores reais) já existem. `.gitignore` tem `.env*` com exceção `!.env.example`, confirmado por `git check-ignore -v .env.local`.

- [ ] **Step 6: Commit**

```bash
git add supabase/ scripts/
git commit -m "feat(banco): vinculo remoto e migration de fundacao"
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

Run: `npx supabase db push`
Expected: `Finished supabase db push.` sem erro de SQL.

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

Run: `npx supabase db push`
Expected: `Finished supabase db push.` sem erro.

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

Run: `npx supabase db push`
Expected: `Finished supabase db push.` sem erro.

- [ ] **Step 3: Verificar o comportamento na prática**

Run:
```bash
npx supabase db push
node scripts/consultar.mjs servicos "id,nome,valor_padrao"
node scripts/consultar.mjs servico_valor_historico "servico_id,valor,vigencia_inicio,vigencia_fim"
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

Run: `npx supabase db push`
Expected: `Finished supabase db push.` sem erro.

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

Run: `npx supabase db push`
Expected: `Finished supabase db push.` sem erro.

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

- [ ] **Step 3: Proxy de sessão**

No Next 16 este arquivo se chama `proxy.ts` (era `middleware.ts` até a 15) e a função exportada é `proxy`.

`proxy.ts` (na raiz do projeto):
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLICAS = ['/login', '/p/']

export async function proxy(request: NextRequest) {
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
git add src/dados/ proxy.ts package.json package-lock.json
git commit -m "feat(dados): clientes Supabase e proxy de sessao"
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
  'inline-flex items-center justify-center gap-2 rounded-campo ' +
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
  'w-full min-h-[44px] rounded-campo border border-borda bg-superficie ' +
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
      className={`rounded-cartao border border-borda bg-superficie p-6 shadow-cartao ${className}`}
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
    <div className="flex flex-col items-center gap-3 rounded-cartao border border-dashed border-borda bg-superficie-2/50 px-6 py-16 text-center">
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
            <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
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

- [ ] **Step 4: Criar a gestora**

O schema `auth` é gerenciado pelo GoTrue; inserir nele por SQL funciona no Supabase local mas é frágil em projeto remoto. Use a API de admin, via `scripts/criar-usuario.mjs` (já existe no repo):

```bash
node scripts/criar-usuario.mjs gestora@mesinharedonda.app "mesinha123" "Gestora" gestora
```
Expected: `Usuario ... criado` seguido de `Perfil gravado: Gestora (gestora).`
O script é seguro de rodar duas vezes — se o usuário já existir, reaproveita.

- [ ] **Step 5: Testar o login**

Run: `npm run dev` e abrir `http://localhost:3000` no navegador.
Expected: redireciona para `/login`; entrar com `gestora@mesinharedonda.app` / `mesinha123` leva à raiz.

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
                        className="absolute inset-0 rounded-campo bg-destaque-suave"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Link
                      href={item.href}
                      aria-current={ativo ? 'page' : undefined}
                      className={`relative flex min-h-[44px] items-center rounded-campo px-3 transition-colors ${
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
          <p className="font-titulo text-xl leading-tight">
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
  /** Marca o asterisco no formulario. Declarado, nao inferido do Zod. */
  obrigatorio?: boolean
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
  // `z.ZodRawShape` e readonly no Zod 4, entao a forma e construida de uma vez
  // em vez de por mutacao.
  const forma = Object.fromEntries(
    entrada.campos.map((campo) => [campo.nome, campo.schema]),
  ) as z.ZodRawShape

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

// Registros nunca sao removidos: cadastros sao referenciados por historico
// financeiro. Desativar (campo `ativo`) preserva o passado e some das listas
// de escolha. A alternancia usa `atualizar` direto, em `motor/acoes.ts`.

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
  if (campo.tipo === 'booleano') {
    return (
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => aoMudar(campo.nome, e.target.checked)}
          className="size-5 accent-destaque"
        />
        <span>
          <span className="font-medium">{campo.etiqueta}</span>
          {campo.ajuda && <span className="block text-sm text-tinta-suave">{campo.ajuda}</span>}
        </span>
      </label>
    )
  }

  return (
    <Campo
      etiqueta={campo.etiqueta}
      ajuda={campo.ajuda}
      erro={erro}
      obrigatorio={campo.obrigatorio}
    >
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
        <p role="alert" className="mt-4 rounded-campo bg-erro-suave px-4 py-3 text-erro">
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

**Antes de começar:** todo campo cujo schema Zod é obrigatório deve carregar `obrigatorio: true` na definição — é o que desenha o asterisco no formulário. Nos dois arquivos abaixo, isso vale exatamente para: `materias.nome`, `anosEscolares.nome`, `anosEscolares.ordem`, `cidades.nome`, `contas.nome`, `contas.tipo`, `feriados.data`, `feriados.nome`, `feriados.abrangencia`, `escolas.nome`, `servicos.nome`, `servicos.valor_padrao`, `professores.nome`, `professores.percentual_repasse`, `responsaveis.nome`, `alunos.nome`, `alunos.responsavel_id`, `alunos.destinatario_notificacao` e `alunos.canal_notificacao`. Os blocos de código abaixo omitem essa linha por brevidade; acrescente-a nesses campos.

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
      ajuda: 'Sigla de duas letras, como SP. Pode ficar em branco.',
      // Campo vazio chega como '' e vira null em `normalizar`. Por isso o
      // comprimento so e cobrado quando algo foi digitado.
      schema: z
        .string()
        .nullable()
        .refine(
          (v) => v === null || v.trim() === '' || v.trim().length === 2,
          'Use a sigla de 2 letras, como SP.',
        ),
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

### Task 24: Formatação de células e tabela genérica

**Files:**
- Create: `src/cadastros/motor/formatar.ts`, `src/cadastros/motor/Tabela.tsx`
- Test: `src/cadastros/motor/formatar.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/cadastros/motor/formatar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatarCelula } from './formatar'
import type { DefinicaoCampo } from '@/cadastros/tipos'

const campo = (tipo: DefinicaoCampo['tipo']): DefinicaoCampo => ({
  nome: 'x',
  etiqueta: 'X',
  tipo,
  schema: z.any(),
})

describe('formatarCelula', () => {
  it('formata dinheiro vindo do numeric do Postgres', () => {
    expect(formatarCelula(campo('dinheiro'), '105.00', {})).toBe('R$ 105,00')
  })

  it('formata percentual', () => {
    expect(formatarCelula(campo('percentual'), '60.00', {})).toBe('60%')
    expect(formatarCelula(campo('percentual'), '62.50', {})).toBe('62,5%')
  })

  it('formata data no padrao brasileiro', () => {
    expect(formatarCelula(campo('data'), '2026-08-13', {})).toBe('13/08/2026')
  })

  it('formata booleano como Sim ou Nao', () => {
    expect(formatarCelula(campo('booleano'), true, {})).toBe('Sim')
    expect(formatarCelula(campo('booleano'), false, {})).toBe('Não')
  })

  it('resolve referencia pelo rotulo carregado no join', () => {
    const c: DefinicaoCampo = {
      ...campo('referencia'),
      nome: 'cidade_id',
      referencia: { tabela: 'cidades', rotulo: 'nome' },
    }
    expect(formatarCelula(c, 7, { cidade_id_ref: { id: 7, nome: 'Campinas' } })).toBe('Campinas')
  })

  it('mostra travessao para valor ausente', () => {
    expect(formatarCelula(campo('texto'), null, {})).toBe('—')
    expect(formatarCelula(campo('texto'), '', {})).toBe('—')
    expect(formatarCelula(campo('dinheiro'), null, {})).toBe('—')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- motor/formatar`
Expected: FAIL — `Failed to resolve import "./formatar"`

- [ ] **Step 3: Implementar**

`src/cadastros/motor/formatar.ts`:
```ts
import { deNumeric, formatarBRL } from '@/dominio/dinheiro'
import type { DefinicaoCampo } from '@/cadastros/tipos'

const VAZIO = '—'

export function formatarCelula(
  campo: DefinicaoCampo,
  valor: unknown,
  registro: Record<string, unknown>,
): string {
  if (campo.tipo === 'booleano') return valor ? 'Sim' : 'Não'

  if (campo.tipo === 'referencia') {
    const juncao = registro[`${campo.nome}_ref`] as Record<string, unknown> | null | undefined
    const rotulo = juncao?.[campo.referencia?.rotulo ?? 'nome']
    return rotulo ? String(rotulo) : VAZIO
  }

  if (valor === null || valor === undefined || valor === '') return VAZIO

  if (campo.tipo === 'dinheiro') return formatarBRL(deNumeric(String(valor)))

  if (campo.tipo === 'percentual') {
    const numero = Number(String(valor))
    return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  }

  if (campo.tipo === 'data') {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return `${dia}/${mes}/${ano}`
  }

  return String(valor)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- motor/formatar`
Expected: PASS, 6 testes.

- [ ] **Step 5: Tabela**

`src/cadastros/motor/Tabela.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { formatarCelula } from './formatar'
import { Selo } from '@/ui/Selo'
import { containerEscalonado, itemEscalonado } from '@/ui/animacoes'
import type { DefinicaoCadastro } from '@/cadastros/tipos'
import type { Registro } from '@/dados/crud'

export function Tabela({
  definicao,
  registros,
}: {
  definicao: DefinicaoCadastro
  registros: Registro[]
}) {
  const temAtivo = definicao.campos.some((c) => c.nome === 'ativo')
  const colunas = definicao.camposDaLista.filter((c) => c.nome !== 'ativo')

  return (
    <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-borda bg-superficie-2/60">
            {colunas.map((campo) => (
              <th key={campo.nome} className="px-5 py-3 text-sm font-semibold text-tinta-suave">
                {campo.etiqueta}
              </th>
            ))}
            {temAtivo && <th className="px-5 py-3 text-sm font-semibold text-tinta-suave">Situação</th>}
            <th className="px-5 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <motion.tbody variants={containerEscalonado} initial="oculto" animate="visivel">
          {registros.map((registro) => (
            <motion.tr
              key={registro.id}
              variants={itemEscalonado}
              className="border-b border-borda/60 transition-colors last:border-0 hover:bg-superficie-2/40"
            >
              {colunas.map((campo) => (
                <td key={campo.nome} className="px-5 py-4">
                  {formatarCelula(campo, registro[campo.nome], registro)}
                </td>
              ))}
              {temAtivo && (
                <td className="px-5 py-4">
                  <Selo tom={registro.ativo ? 'ativo' : 'encerrado'}>
                    {registro.ativo ? 'Ativo' : 'Inativo'}
                  </Selo>
                </td>
              )}
              <td className="px-5 py-4 text-right">
                <Link
                  href={`/cadastros/${definicao.rota}/${registro.id}`}
                  className="font-medium text-destaque hover:text-destaque-forte hover:underline"
                >
                  Editar
                </Link>
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/cadastros/motor/formatar.ts src/cadastros/motor/formatar.test.ts src/cadastros/motor/Tabela.tsx
git commit -m "feat(cadastros): formatacao de celulas e tabela generica"
```

---

### Task 25: Rotas dinâmicas dos cadastros

Uma rota `[cadastro]` atende as dez entidades. `generateStaticParams` valida a rota; qualquer outra dá 404.

**Files:**
- Create: `src/app/(app)/cadastros/[cadastro]/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`, `src/cadastros/motor/referencias.ts`, `src/ui/Busca.tsx`

- [ ] **Step 1: Carregador de opções de referência**

`src/cadastros/motor/referencias.ts`:
```ts
import 'server-only'
import { clienteServidor } from '@/dados/cliente'
import type { DefinicaoCadastro } from '@/cadastros/tipos'
import type { OpcaoReferencia } from './CampoDinamico'

/** Carrega as opcoes de cada campo `referencia`, so com registros ativos. */
export async function carregarReferencias(
  definicao: DefinicaoCadastro,
): Promise<Record<string, OpcaoReferencia[]>> {
  const supabase = await clienteServidor()
  const referencias: Record<string, OpcaoReferencia[]> = {}

  for (const campo of definicao.campos) {
    if (campo.tipo !== 'referencia' || !campo.referencia) continue

    const { data } = await supabase
      .from(campo.referencia.tabela)
      .select(`id, ${campo.referencia.rotulo}, ativo`)
      .order(campo.referencia.rotulo)

    referencias[campo.nome] = (data ?? [])
      .filter((linha) => (linha as { ativo?: boolean }).ativo !== false)
      .map((linha) => ({
        id: (linha as { id: number }).id,
        rotulo: String((linha as Record<string, unknown>)[campo.referencia!.rotulo]),
      }))
  }

  return referencias
}
```

**Nota:** o filtro de `ativo` é feito em memória porque nem toda tabela referenciada tem a coluna (`cidades` não tem). Filtrar no SQL quebraria nessas.

- [ ] **Step 2: Campo de busca**

`src/ui/Busca.tsx`:
```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { entradaClasse } from './Campo'

export function Busca({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const parametros = useSearchParams()
  const [termo, setTermo] = useState(parametros.get('busca') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      const novos = new URLSearchParams(parametros.toString())
      if (termo) novos.set('busca', termo)
      else novos.delete('busca')
      router.replace(`?${novos.toString()}`)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo])

  return (
    <input
      type="search"
      value={termo}
      onChange={(e) => setTermo(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${entradaClasse} max-w-sm`}
    />
  )
}
```

- [ ] **Step 3: Listagem**

`src/app/(app)/cadastros/[cadastro]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CADASTROS, ROTAS_DE_CADASTRO } from '@/cadastros/definicoes'
import { Tabela } from '@/cadastros/motor/Tabela'
import { listar } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'
import { BotaoLink } from '@/ui/Botao'
import { Busca } from '@/ui/Busca'
import { EstadoVazio } from '@/ui/EstadoVazio'

export function generateStaticParams() {
  return ROTAS_DE_CADASTRO.map((cadastro) => ({ cadastro }))
}

export default async function PaginaListagem({
  params,
  searchParams,
}: {
  params: Promise<{ cadastro: string }>
  searchParams: Promise<{ busca?: string }>
}) {
  await exigirGestora()

  const { cadastro } = await params
  const { busca } = await searchParams
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const registros = await listar(definicao, { busca })
  const artigo = definicao.rotulo.genero === 'f' ? 'Nova' : 'Novo'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">{definicao.rotulo.plural}</h1>
          <p className="mt-1 text-tinta-suave">
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>
        <BotaoLink href={`/cadastros/${cadastro}/novo`}>
          + {artigo} {definicao.rotulo.singular.toLowerCase()}
        </BotaoLink>
      </header>

      {definicao.camposBuscaveis.length > 0 && (
        <Suspense>
          <Busca placeholder={`Buscar ${definicao.rotulo.plural.toLowerCase()}…`} />
        </Suspense>
      )}

      {registros.length === 0 ? (
        <EstadoVazio
          titulo={busca ? 'Nada encontrado' : `Nenhum registro ainda`}
          descricao={
            busca
              ? 'Tente outro termo de busca.'
              : (definicao.dicaVazio ?? `Comece cadastrando ${definicao.rotulo.singular.toLowerCase()}.`)
          }
          acao={
            !busca && (
              <BotaoLink href={`/cadastros/${cadastro}/novo`}>
                + {artigo} {definicao.rotulo.singular.toLowerCase()}
              </BotaoLink>
            )
          }
        />
      ) : (
        <Tabela definicao={definicao} registros={registros} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Criação**

`src/app/(app)/cadastros/[cadastro]/novo/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { CADASTROS } from '@/cadastros/definicoes'
import { Formulario } from '@/cadastros/motor/Formulario'
import { carregarReferencias } from '@/cadastros/motor/referencias'
import { exigirGestora } from '@/dados/sessao'

export default async function PaginaNovo({
  params,
}: {
  params: Promise<{ cadastro: string }>
}) {
  await exigirGestora()

  const { cadastro } = await params
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const referencias = await carregarReferencias(definicao)
  const artigo = definicao.rotulo.genero === 'f' ? 'Nova' : 'Novo'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">
        {artigo} {definicao.rotulo.singular.toLowerCase()}
      </h1>
      <Formulario definicao={definicao} referencias={referencias} />
    </div>
  )
}
```

- [ ] **Step 5: Edição**

`src/app/(app)/cadastros/[cadastro]/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { CADASTROS } from '@/cadastros/definicoes'
import { Formulario } from '@/cadastros/motor/Formulario'
import { carregarReferencias } from '@/cadastros/motor/referencias'
import { obter } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'

export default async function PaginaEdicao({
  params,
}: {
  params: Promise<{ cadastro: string; id: string }>
}) {
  await exigirGestora()

  const { cadastro, id } = await params
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const registro = await obter(definicao, Number(id))
  if (!registro) notFound()

  const referencias = await carregarReferencias(definicao)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{String(registro.nome ?? definicao.rotulo.singular)}</h1>
      <Formulario
        definicao={definicao}
        registro={registro as Record<string, unknown> & { id: number }}
        referencias={referencias}
      />
    </div>
  )
}
```

- [ ] **Step 6: Testar no navegador**

Run: `npm run build && npm run dev`

Percorrer, logado como gestora:
1. `/cadastros/cidades` → estado vazio com a dica → criar "Campinas / SP".
2. `/cadastros/escolas` → criar uma escola apontando para Campinas → a listagem mostra "Campinas" na coluna Cidade.
3. `/cadastros/servicos` → criar "Aula regular" com valor `100,00`, ambos os "permite" marcados.
4. `/cadastros/professores` → criar com repasse `60`.
5. `/cadastros/responsaveis` e `/cadastros/alunos` → criar um responsável e um aluno vinculado.
6. Editar qualquer registro e salvar.
7. `/cadastros/inexistente` → 404.

Expected: todos os passos funcionam; valores monetários aparecem como `R$ 100,00`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cadastros): rotas dinamicas de listagem, criacao e edicao"
```

---

### Task 26: Turmas — listagem e formulário

Turma não usa o motor genérico: o nome é gerado ao vivo e os campos matéria/escola aparecem ou somem conforme o serviço escolhido.

**Files:**
- Create: `src/dados/turmas.ts`, `src/app/(app)/turmas/page.tsx`, `src/app/(app)/turmas/FormularioTurma.tsx`, `src/app/(app)/turmas/acoes.ts`, `src/app/(app)/turmas/nova/page.tsx`

- [ ] **Step 1: Repositório**

`src/dados/turmas.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'

const SELECT_TURMA = `
  id, nome, modalidade, dias_semana, horario_inicio, horario_fim, status,
  google_calendar_event_id,
  servico_id, materia_id, escola_id, ano_escolar_id, professor_id,
  servico:servicos!servico_id (id, nome, permite_materia, permite_escola, valor_padrao),
  materia:materias!materia_id (id, nome),
  escola:escolas!escola_id (id, nome),
  ano_escolar:anos_escolares!ano_escolar_id (id, nome),
  professor:professores!professor_id (id, nome)
`

export interface TurmaComRelacoes {
  id: number
  nome: string
  modalidade: 'Presencial' | 'Online'
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: 'Ativa' | 'Encerrada'
  google_calendar_event_id: string | null
  servico_id: number
  materia_id: number | null
  escola_id: number | null
  ano_escolar_id: number
  professor_id: number
  servico: { id: number; nome: string; permite_materia: boolean; permite_escola: boolean } | null
  materia: { id: number; nome: string } | null
  escola: { id: number; nome: string } | null
  ano_escolar: { id: number; nome: string } | null
  professor: { id: number; nome: string } | null
  alunos_matriculados?: number
}

export async function listarTurmas(filtros: {
  professorId?: number
  status?: string
} = {}): Promise<TurmaComRelacoes[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from('turmas').select(SELECT_TURMA)

  if (filtros.professorId) consulta = consulta.eq('professor_id', filtros.professorId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data, error } = await consulta.order('nome')
  if (error) throw new Error(`Falha ao listar turmas: ${error.message}`)

  const turmas = (data ?? []) as unknown as TurmaComRelacoes[]

  // Contagem de matriculas ativas e nao-reposicao, exibida na listagem.
  const { data: contagens } = await supabase
    .from('matriculas')
    .select('turma_id')
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  const porTurma = new Map<number, number>()
  for (const linha of contagens ?? []) {
    const id = (linha as { turma_id: number }).turma_id
    porTurma.set(id, (porTurma.get(id) ?? 0) + 1)
  }

  return turmas.map((t) => ({ ...t, alunos_matriculados: porTurma.get(t.id) ?? 0 }))
}

export async function obterTurma(id: number): Promise<TurmaComRelacoes | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from('turmas')
    .select(SELECT_TURMA)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar turma: ${error.message}`)
  return (data ?? null) as unknown as TurmaComRelacoes | null
}

export interface OpcoesDeTurma {
  servicos: { id: number; nome: string; permite_materia: boolean; permite_escola: boolean }[]
  materias: { id: number; nome: string }[]
  escolas: { id: number; nome: string }[]
  anosEscolares: { id: number; nome: string }[]
  professores: { id: number; nome: string }[]
}

export async function opcoesDeTurma(): Promise<OpcoesDeTurma> {
  const supabase = await clienteServidor()
  const [servicos, materias, escolas, anos, professores] = await Promise.all([
    supabase.from('servicos').select('id, nome, permite_materia, permite_escola').eq('ativo', true).order('nome'),
    supabase.from('materias').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('escolas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('anos_escolares').select('id, nome').eq('ativo', true).order('ordem'),
    supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
  ])

  return {
    servicos: servicos.data ?? [],
    materias: materias.data ?? [],
    escolas: escolas.data ?? [],
    anosEscolares: anos.data ?? [],
    professores: professores.data ?? [],
  }
}
```

- [ ] **Step 2: Ação de salvar**

`src/app/(app)/turmas/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { validarTurma, type EntradaTurma } from '@/dominio/turmas/regras'
import { gerarNomeTurma } from '@/dominio/turmas/nome'

export interface ResultadoTurma {
  ok: boolean
  erros?: string[]
  id?: number
}

export async function salvarTurma(
  id: number | null,
  entrada: EntradaTurma,
  nomesParaTitulo: {
    materia: string | null
    anoEscolar: string | null
    escola: string | null
    servico: string | null
  },
): Promise<ResultadoTurma> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const { data: servico } = await supabase
    .from('servicos')
    .select('permite_materia, permite_escola')
    .eq('id', entrada.servico_id ?? -1)
    .maybeSingle()

  if (!servico) return { ok: false, erros: ['Selecione um serviço válido.'] }

  const erros = validarTurma(entrada, servico)
  if (erros.length > 0) return { ok: false, erros }

  const registro = {
    nome: gerarNomeTurma({ ...nomesParaTitulo, modalidade: entrada.modalidade }),
    servico_id: entrada.servico_id,
    materia_id: entrada.materia_id,
    escola_id: entrada.escola_id,
    ano_escolar_id: entrada.ano_escolar_id,
    professor_id: entrada.professor_id,
    modalidade: entrada.modalidade,
    dias_semana: entrada.dias_semana,
    horario_inicio: entrada.horario_inicio,
    horario_fim: entrada.horario_fim,
    status: entrada.status,
  }

  const resposta =
    id === null
      ? await supabase.from('turmas').insert(registro).select('id').single()
      : await supabase.from('turmas').update(registro).eq('id', id).select('id').single()

  if (resposta.error) return { ok: false, erros: [resposta.error.message] }

  revalidatePath('/turmas')
  return { ok: true, id: resposta.data.id }
}

export async function alternarStatusTurma(id: number, status: 'Ativa' | 'Encerrada') {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { error } = await supabase.from('turmas').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/turmas')
  revalidatePath(`/turmas/${id}`)
}
```

- [ ] **Step 3: Formulário de turma**

`src/app/(app)/turmas/FormularioTurma.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { salvarTurma } from './acoes'
import { gerarNomeTurma } from '@/dominio/turmas/nome'
import { DIAS_SEMANA, MODALIDADES, type Modalidade } from '@/dominio/tipos'
import type { EntradaTurma } from '@/dominio/turmas/regras'
import type { OpcoesDeTurma, TurmaComRelacoes } from '@/dados/turmas'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

export function FormularioTurma({
  opcoes,
  turma,
}: {
  opcoes: OpcoesDeTurma
  turma?: TurmaComRelacoes
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])

  const [estado, setEstado] = useState<EntradaTurma>(() => ({
    servico_id: turma?.servico_id ?? null,
    materia_id: turma?.materia_id ?? null,
    escola_id: turma?.escola_id ?? null,
    ano_escolar_id: turma?.ano_escolar_id ?? null,
    professor_id: turma?.professor_id ?? null,
    modalidade: turma?.modalidade ?? null,
    dias_semana: turma?.dias_semana ?? [],
    horario_inicio: turma?.horario_inicio?.slice(0, 5) ?? '',
    horario_fim: turma?.horario_fim?.slice(0, 5) ?? '',
    status: turma?.status ?? 'Ativa',
  }))

  const servico = opcoes.servicos.find((s) => s.id === estado.servico_id) ?? null

  const nomes = useMemo(
    () => ({
      materia: opcoes.materias.find((m) => m.id === estado.materia_id)?.nome ?? null,
      anoEscolar: opcoes.anosEscolares.find((a) => a.id === estado.ano_escolar_id)?.nome ?? null,
      escola: opcoes.escolas.find((e) => e.id === estado.escola_id)?.nome ?? null,
      servico: servico?.nome ?? null,
    }),
    [estado, opcoes, servico],
  )

  const nomeGerado = gerarNomeTurma({ ...nomes, modalidade: estado.modalidade })

  /** Trocar de servico limpa os campos que o novo servico nao usa. */
  function escolherServico(id: number | null) {
    const novo = opcoes.servicos.find((s) => s.id === id) ?? null
    setEstado((atual) => ({
      ...atual,
      servico_id: id,
      materia_id: novo?.permite_materia ? atual.materia_id : null,
      escola_id: novo?.permite_escola ? atual.escola_id : null,
    }))
  }

  function alternarDia(dia: number) {
    setEstado((atual) => ({
      ...atual,
      dias_semana: atual.dias_semana.includes(dia)
        ? atual.dias_semana.filter((d) => d !== dia)
        : [...atual.dias_semana, dia].sort((a, b) => a - b),
    }))
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErros([])
    iniciar(async () => {
      const resultado = await salvarTurma(turma?.id ?? null, estado, nomes)
      if (resultado.ok) {
        router.push(`/turmas/${resultado.id}`)
        router.refresh()
      } else {
        setErros(resultado.erros ?? ['Não foi possível salvar a turma.'])
      }
    })
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl">
      <Cartao className="flex flex-col gap-5">
        <div className="rounded-campo bg-superficie-2 px-4 py-3">
          <span className="text-sm text-tinta-suave">Nome da turma (gerado automaticamente)</span>
          <motion.p
            key={nomeGerado}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="mt-1 font-titulo text-lg"
          >
            {nomeGerado || 'Preencha os campos abaixo…'}
          </motion.p>
        </div>

        <Campo etiqueta="Serviço" obrigatorio>
          <select
            value={estado.servico_id ?? ''}
            onChange={(e) => escolherServico(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </Campo>

        <AnimatePresence initial={false}>
          {servico?.permite_materia && (
            <motion.div
              key="materia"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Campo etiqueta="Matéria" obrigatorio>
                <select
                  value={estado.materia_id ?? ''}
                  onChange={(e) =>
                    setEstado((a) => ({
                      ...a,
                      materia_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={entradaClasse}
                >
                  <option value="">Selecione…</option>
                  {opcoes.materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </motion.div>
          )}

          {servico?.permite_escola && (
            <motion.div
              key="escola"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Campo etiqueta="Escola" obrigatorio>
                <select
                  value={estado.escola_id ?? ''}
                  onChange={(e) =>
                    setEstado((a) => ({
                      ...a,
                      escola_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={entradaClasse}
                >
                  <option value="">Selecione…</option>
                  {opcoes.escolas.map((e2) => (
                    <option key={e2.id} value={e2.id}>
                      {e2.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </motion.div>
          )}
        </AnimatePresence>

        <Campo etiqueta="Ano escolar" obrigatorio>
          <select
            value={estado.ano_escolar_id ?? ''}
            onChange={(e) =>
              setEstado((a) => ({
                ...a,
                ano_escolar_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.anosEscolares.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Professor responsável" obrigatorio>
          <select
            value={estado.professor_id ?? ''}
            onChange={(e) =>
              setEstado((a) => ({
                ...a,
                professor_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.professores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Modalidade" obrigatorio>
          <select
            value={estado.modalidade ?? ''}
            onChange={(e) =>
              setEstado((a) => ({ ...a, modalidade: (e.target.value || null) as Modalidade }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          etiqueta="Dias da semana"
          ajuda="Em quais dias esta turma tem aula."
          obrigatorio
        >
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map((dia) => {
              const marcado = estado.dias_semana.includes(dia.valor)
              return (
                <button
                  key={dia.valor}
                  type="button"
                  onClick={() => alternarDia(dia.valor)}
                  aria-pressed={marcado}
                  className={`min-h-[44px] min-w-[56px] rounded-campo border px-3 font-medium transition-all active:scale-95 ${
                    marcado
                      ? 'border-destaque bg-destaque text-white'
                      : 'border-borda bg-superficie text-tinta-suave hover:border-destaque/40'
                  }`}
                >
                  {dia.curto}
                </button>
              )
            })}
          </div>
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Início" obrigatorio>
            <input
              type="time"
              value={estado.horario_inicio}
              onChange={(e) => setEstado((a) => ({ ...a, horario_inicio: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
          <Campo etiqueta="Término" obrigatorio>
            <input
              type="time"
              value={estado.horario_fim}
              onChange={(e) => setEstado((a) => ({ ...a, horario_fim: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
        </div>
      </Cartao>

      {erros.length > 0 && (
        <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar turma'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Páginas de listagem e criação**

`src/app/(app)/turmas/nova/page.tsx`:
```tsx
import { opcoesDeTurma } from '@/dados/turmas'
import { exigirGestora } from '@/dados/sessao'
import { FormularioTurma } from '../FormularioTurma'

export default async function PaginaNovaTurma() {
  await exigirGestora()
  const opcoes = await opcoesDeTurma()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Nova turma</h1>
      <FormularioTurma opcoes={opcoes} />
    </div>
  )
}
```

`src/app/(app)/turmas/page.tsx`:
```tsx
import Link from 'next/link'
import { listarTurmas } from '@/dados/turmas'
import { exigirSessao } from '@/dados/sessao'
import { nomesDosDias } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

export default async function PaginaTurmas() {
  const sessao = await exigirSessao()
  const turmas = await listarTurmas(
    sessao.papel === 'professor' && sessao.professorId
      ? { professorId: sessao.professorId }
      : {},
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Turmas</h1>
          <p className="mt-1 text-tinta-suave">
            {turmas.length} {turmas.length === 1 ? 'turma' : 'turmas'}
          </p>
        </div>
        {sessao.papel === 'gestora' && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
      </header>

      {turmas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma turma ainda"
          descricao="Uma turma junta serviço, matéria, ano escolar e professor com dias e horários fixos. É nela que os alunos são matriculados."
          acao={sessao.papel === 'gestora' && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {turmas.map((turma) => (
            <li key={turma.id}>
              <Link
                href={`/turmas/${turma.id}`}
                className="block rounded-cartao border border-borda bg-superficie p-5 shadow-cartao transition-all hover:-translate-y-0.5 hover:border-destaque/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-titulo text-lg leading-snug">
                    {turma.nome}
                  </h2>
                  <Selo tom={turma.status === 'Ativa' ? 'ativo' : 'encerrado'}>{turma.status}</Selo>
                </div>
                <dl className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                  <div>{turma.professor?.nome}</div>
                  <div>
                    {nomesDosDias(turma.dias_semana)} · {turma.horario_inicio.slice(0, 5)} às{' '}
                    {turma.horario_fim.slice(0, 5)}
                  </div>
                  <div>
                    {turma.alunos_matriculados}{' '}
                    {turma.alunos_matriculados === 1 ? 'aluno matriculado' : 'alunos matriculados'}
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Testar**

Run: `npm run dev`, abrir `/turmas/nova`.
Expected: escolher um serviço com "tem matéria" desmarcado faz o campo Matéria desaparecer com animação; o nome no topo se atualiza a cada campo preenchido; salvar leva ao detalhe.

- [ ] **Step 6: Commit**

```bash
git add src/dados/turmas.ts "src/app/(app)/turmas/"
git commit -m "feat(turmas): listagem e formulario com nome gerado e campos condicionais"
```

---

### Task 27: Detalhe da turma e matrículas

**Files:**
- Create: `src/dados/matriculas.ts`, `src/app/(app)/turmas/[id]/page.tsx`, `src/app/(app)/turmas/[id]/editar/page.tsx`, `src/app/(app)/matriculas/acoes.ts`, `src/app/(app)/matriculas/FormularioMatricula.tsx`, `src/app/(app)/matriculas/page.tsx`, `src/app/(app)/matriculas/nova/page.tsx`

- [ ] **Step 1: Repositório de matrículas**

`src/dados/matriculas.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'

const SELECT_MATRICULA = `
  id, data_inicio, data_fim, flag_reposicao, status, aluno_id, turma_id,
  aluno:alunos!aluno_id (id, nome, ativo),
  turma:turmas!turma_id (id, nome, status)
`

export interface MatriculaComRelacoes {
  id: number
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  status: 'Ativa' | 'Encerrada'
  aluno_id: number
  turma_id: number
  aluno: { id: number; nome: string; ativo: boolean } | null
  turma: { id: number; nome: string; status: string } | null
}

export async function listarMatriculas(filtros: {
  alunoId?: number
  turmaId?: number
  status?: string
} = {}): Promise<MatriculaComRelacoes[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from('matriculas').select(SELECT_MATRICULA)

  if (filtros.alunoId) consulta = consulta.eq('aluno_id', filtros.alunoId)
  if (filtros.turmaId) consulta = consulta.eq('turma_id', filtros.turmaId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data, error } = await consulta.order('data_inicio', { ascending: false })
  if (error) throw new Error(`Falha ao listar matrículas: ${error.message}`)
  return (data ?? []) as unknown as MatriculaComRelacoes[]
}
```

- [ ] **Step 2: Ação de matrícula**

`src/app/(app)/matriculas/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { validarMatricula } from '@/dominio/matriculas/regras'

export async function salvarMatricula(entrada: {
  aluno_id: number | null
  turma_id: number | null
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
}): Promise<{ ok: boolean; erros?: string[] }> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: aluno }, { data: turma }] = await Promise.all([
    supabase.from('alunos').select('ativo').eq('id', entrada.aluno_id ?? -1).maybeSingle(),
    supabase.from('turmas').select('status').eq('id', entrada.turma_id ?? -1).maybeSingle(),
  ])

  if (!aluno) return { ok: false, erros: ['Selecione um aluno válido.'] }
  if (!turma) return { ok: false, erros: ['Selecione uma turma válida.'] }

  const erros = validarMatricula({ ...entrada, alunoAtivo: aluno.ativo }, turma)
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase.from('matriculas').insert({
    aluno_id: entrada.aluno_id,
    turma_id: entrada.turma_id,
    data_inicio: entrada.data_inicio,
    data_fim: entrada.data_fim,
    flag_reposicao: entrada.flag_reposicao,
  })

  if (error) return { ok: false, erros: [error.message] }

  revalidatePath('/matriculas')
  revalidatePath(`/turmas/${entrada.turma_id}`)
  return { ok: true }
}

export async function encerrarMatricula(id: number) {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('matriculas')
    .update({ status: 'Encerrada', data_fim: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/matriculas')
}
```

- [ ] **Step 3: Formulário de matrícula**

`src/app/(app)/matriculas/FormularioMatricula.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { salvarMatricula } from './acoes'
import { avisoDeReposicao } from '@/dominio/matriculas/regras'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

interface Opcao {
  id: number
  nome: string
}

export function FormularioMatricula({
  alunos,
  turmas,
  alunoFixo,
  turmaFixa,
}: {
  alunos: Opcao[]
  turmas: Opcao[]
  alunoFixo?: number
  turmaFixa?: number
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  const hoje = new Date().toISOString().slice(0, 10)

  const [estado, setEstado] = useState({
    aluno_id: alunoFixo ?? null,
    turma_id: turmaFixa ?? null,
    data_inicio: hoje,
    data_fim: null as string | null,
    flag_reposicao: false,
  })

  const aviso = avisoDeReposicao(estado.flag_reposicao)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErros([])
    iniciar(async () => {
      const resultado = await salvarMatricula(estado)
      if (resultado.ok) {
        router.push(turmaFixa ? `/turmas/${turmaFixa}` : '/matriculas')
        router.refresh()
      } else {
        setErros(resultado.erros ?? ['Não foi possível matricular.'])
      }
    })
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl">
      <Cartao className="flex flex-col gap-5">
        {!alunoFixo && (
          <Campo etiqueta="Aluno" obrigatorio>
            <select
              value={estado.aluno_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({ ...a, aluno_id: e.target.value ? Number(e.target.value) : null }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {!turmaFixa && (
          <Campo etiqueta="Turma" ajuda="Somente turmas ativas aceitam matrícula." obrigatorio>
            <select
              value={estado.turma_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({ ...a, turma_id: e.target.value ? Number(e.target.value) : null }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Data de início" obrigatorio>
            <input
              type="date"
              value={estado.data_inicio}
              onChange={(e) => setEstado((a) => ({ ...a, data_inicio: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
          <Campo etiqueta="Data de fim" ajuda="Deixe em branco para matrícula em aberto.">
            <input
              type="date"
              value={estado.data_fim ?? ''}
              onChange={(e) => setEstado((a) => ({ ...a, data_fim: e.target.value || null }))}
              className={entradaClasse}
            />
          </Campo>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={estado.flag_reposicao}
            onChange={(e) => setEstado((a) => ({ ...a, flag_reposicao: e.target.checked }))}
            className="size-5 accent-destaque"
          />
          <span className="font-medium">Matrícula de reposição</span>
        </label>

        <AnimatePresence>
          {aviso && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-campo bg-alerta-suave px-4 py-3 text-alerta"
            >
              {aviso}
            </motion.p>
          )}
        </AnimatePresence>
      </Cartao>

      {erros.length > 0 && (
        <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Matricular'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Detalhe da turma com navegação cruzada**

`src/app/(app)/turmas/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterTurma } from '@/dados/turmas'
import { listarMatriculas } from '@/dados/matriculas'
import { exigirSessao } from '@/dados/sessao'
import { nomesDosDias } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

export default async function PaginaTurma({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao()
  const { id } = await params
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const matriculas = await listarMatriculas({ turmaId: turma.id, status: 'Ativa' })
  const ehGestora = sessao.papel === 'gestora'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{turma.nome}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Selo tom={turma.status === 'Ativa' ? 'ativo' : 'encerrado'}>{turma.status}</Selo>
            <span className="text-tinta-suave">
              {nomesDosDias(turma.dias_semana)} · {turma.horario_inicio.slice(0, 5)} às{' '}
              {turma.horario_fim.slice(0, 5)}
            </span>
          </div>
        </div>
        {ehGestora && (
          <BotaoLink href={`/turmas/${turma.id}/editar`} aparencia="secundario">
            Editar turma
          </BotaoLink>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 text-lg">Composição</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Professor</dt>
              <dd>
                <Link
                  href={`/cadastros/professores/${turma.professor_id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {turma.professor?.nome}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Serviço</dt>
              <dd>{turma.servico?.nome}</dd>
            </div>
            {turma.materia && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Matéria</dt>
                <dd>{turma.materia.nome}</dd>
              </div>
            )}
            {turma.escola && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Escola</dt>
                <dd>{turma.escola.nome}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Ano escolar</dt>
              <dd>{turma.ano_escolar?.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Modalidade</dt>
              <dd>{turma.modalidade}</dd>
            </div>
          </dl>
        </Cartao>

        <Cartao>
          <h2 className="mb-3 text-lg">Agenda</h2>
          <p className="text-sm text-tinta-suave">
            As aulas desta turma aparecem aqui a partir do Plano 2, quando a sincronização com a
            agenda entra no ar.
          </p>
        </Cartao>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Alunos matriculados</h2>
          {ehGestora && turma.status === 'Ativa' && (
            <BotaoLink href={`/matriculas/nova?turma=${turma.id}`} aparencia="secundario">
              + Adicionar aluno
            </BotaoLink>
          )}
        </div>

        {matriculas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum aluno matriculado"
            descricao="Matricule alunos para que eles passem a contar nas aulas e nas cobranças desta turma."
            acao={
              ehGestora &&
              turma.status === 'Ativa' && (
                <BotaoLink href={`/matriculas/nova?turma=${turma.id}`}>+ Adicionar aluno</BotaoLink>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-borda rounded-cartao border border-borda bg-superficie">
            {matriculas.map((matricula) => (
              <li key={matricula.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <Link
                  href={`/cadastros/alunos/${matricula.aluno_id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {matricula.aluno?.nome}
                </Link>
                {matricula.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Páginas restantes**

`src/app/(app)/turmas/[id]/editar/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { obterTurma, opcoesDeTurma } from '@/dados/turmas'
import { exigirGestora } from '@/dados/sessao'
import { FormularioTurma } from '../../FormularioTurma'

export default async function PaginaEditarTurma({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const [turma, opcoes] = await Promise.all([obterTurma(Number(id)), opcoesDeTurma()])
  if (!turma) notFound()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Editar turma</h1>
      <FormularioTurma opcoes={opcoes} turma={turma} />
    </div>
  )
}
```

`src/app/(app)/matriculas/nova/page.tsx`:
```tsx
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { FormularioMatricula } from '../FormularioMatricula'

export default async function PaginaNovaMatricula({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; aluno?: string }>
}) {
  await exigirGestora()
  const { turma, aluno } = await searchParams
  const supabase = await clienteServidor()

  const [alunos, turmas] = await Promise.all([
    supabase.from('alunos').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('turmas').select('id, nome').eq('status', 'Ativa').order('nome'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Nova matrícula</h1>
      <FormularioMatricula
        alunos={alunos.data ?? []}
        turmas={turmas.data ?? []}
        turmaFixa={turma ? Number(turma) : undefined}
        alunoFixo={aluno ? Number(aluno) : undefined}
      />
    </div>
  )
}
```

`src/app/(app)/matriculas/page.tsx`:
```tsx
import Link from 'next/link'
import { listarMatriculas } from '@/dados/matriculas'
import { exigirGestora } from '@/dados/sessao'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function PaginaMatriculas() {
  await exigirGestora()
  const matriculas = await listarMatriculas()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Matrículas</h1>
          <p className="mt-1 text-tinta-suave">
            {matriculas.length} {matriculas.length === 1 ? 'matrícula' : 'matrículas'}
          </p>
        </div>
        <BotaoLink href="/matriculas/nova">+ Nova matrícula</BotaoLink>
      </header>

      {matriculas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma matrícula ainda"
          descricao="A matrícula liga um aluno a uma turma. É o que faz o aluno entrar nas aulas e nas cobranças."
          acao={<BotaoLink href="/matriculas/nova">+ Nova matrícula</BotaoLink>}
        />
      ) : (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-borda bg-superficie-2/60 text-sm text-tinta-suave">
                <th className="px-5 py-3 font-semibold">Aluno</th>
                <th className="px-5 py-3 font-semibold">Turma</th>
                <th className="px-5 py-3 font-semibold">Início</th>
                <th className="px-5 py-3 font-semibold">Fim</th>
                <th className="px-5 py-3 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {matriculas.map((m) => (
                <tr key={m.id} className="border-b border-borda/60 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/cadastros/alunos/${m.aluno_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {m.aluno?.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/turmas/${m.turma_id}`} className="hover:underline">
                      {m.turma?.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{dataBR(m.data_inicio)}</td>
                  <td className="px-5 py-4">{dataBR(m.data_fim)}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Selo tom={m.status === 'Ativa' ? 'ativo' : 'encerrado'}>{m.status}</Selo>
                      {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verificar**

Run: `npm run build && npm test`
Expected: build limpo; todos os testes passando.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(matriculas): detalhe da turma, matricula e navegacao cruzada"
```

---

### Task 28: Seed de demonstração

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Escrever o seed**

`supabase/seed.sql`:
```sql
-- Dados ficticios para a gestora explorar o sistema.
-- Aplicar com `npx supabase db push --include-seed`.
-- Para comecar do zero em producao, basta nao passar --include-seed.

-- O usuario de login NAO e criado aqui: o schema `auth` e gerenciado pelo
-- GoTrue. Rode `node scripts/criar-usuario.mjs` depois do push (ver Task 18).

insert into public.cidades (nome, uf) values ('Campinas', 'SP'), ('Valinhos', 'SP');

insert into public.escolas (nome, cidade_id, telefone) values
  ('Colégio São José', 1, '(19) 3232-1010'),
  ('Escola Nova Era', 1, '(19) 3232-2020');

insert into public.anos_escolares (nome, ordem) values
  ('6º ano — Fundamental', 6),
  ('7º ano — Fundamental', 7),
  ('8º ano — Fundamental', 8),
  ('9º ano — Fundamental', 9),
  ('1ª série — Médio', 10);

insert into public.materias (nome) values
  ('Matemática'), ('Português'), ('Física'), ('Química'), ('Inglês');

insert into public.servicos (nome, valor_padrao, permite_materia, permite_escola) values
  ('Aula regular', 100.00, true, true),
  ('Aulão de revisão', 105.00, true, false),
  ('Aula particular', 130.00, true, false);

insert into public.contas (nome, tipo, banco, chave_pix) values
  ('Conta principal', 'Banco', 'Nubank', 'mesinharedonda@email.com'),
  ('Dinheiro em espécie', 'Dinheiro', null, null);

insert into public.feriados (data, nome, abrangencia) values
  ('2026-09-07', 'Independência do Brasil', 'Nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'Nacional'),
  ('2026-11-02', 'Finados', 'Nacional'),
  ('2026-11-15', 'Proclamação da República', 'Nacional');

insert into public.professores (nome, percentual_repasse, telefone, email, chave_pix) values
  ('Beatriz Lima', 60.00, '(19) 99811-1122', 'beatriz@exemplo.com', 'beatriz@exemplo.com'),
  ('Carlos Menezes', 55.00, '(19) 99822-3344', 'carlos@exemplo.com', '(19) 99822-3344');

insert into public.responsaveis (nome, telefone, email, cidade_id) values
  ('Ana Ribeiro', '(19) 99700-1111', 'ana@exemplo.com', 1),
  ('Marcos Tavares', '(19) 99700-2222', 'marcos@exemplo.com', 1),
  ('Juliana Prado', '(19) 99700-3333', 'juliana@exemplo.com', 2);

insert into public.alunos (nome, responsavel_id, escola_id, destinatario_notificacao, canal_notificacao) values
  ('João Ribeiro', 1, 1, 'Responsável', 'WhatsApp'),
  ('Maria Ribeiro', 1, 1, 'Ambos', 'WhatsApp'),
  ('Pedro Tavares', 2, 2, 'Responsável', 'E-mail'),
  ('Laura Prado', 3, 1, 'Aluno', 'WhatsApp');

-- Turmas. O nome segue a regra de concatenacao do Adendo 5.2.
insert into public.turmas
  (nome, servico_id, materia_id, escola_id, ano_escolar_id, professor_id, modalidade, dias_semana, horario_inicio, horario_fim)
values
  ('Matemática · 9º ano — Fundamental · Colégio São José · Aula regular · Presencial',
   1, 1, 1, 4, 1, 'Presencial', '{2,4}', '15:00', '16:00'),
  ('Português · 7º ano — Fundamental · Colégio São José · Aula regular · Presencial',
   1, 2, 1, 2, 2, 'Presencial', '{3,5}', '14:00', '15:00'),
  ('Física · 1ª série — Médio · Aula particular · Online',
   3, 3, null, 5, 1, 'Online', '{1}', '18:00', '19:00');

insert into public.matriculas (aluno_id, turma_id, data_inicio) values
  (1, 1, '2026-08-01'),
  (2, 2, '2026-08-01'),
  (3, 1, '2026-08-03'),
  (4, 3, '2026-08-05');
```

- [ ] **Step 2: Aplicar e conferir**

Run:
```bash
npx supabase db push --include-seed
node scripts/consultar.mjs turmas --count
node scripts/consultar.mjs matriculas --count
node scripts/consultar.mjs servico_valor_historico --count
node scripts/consultar.mjs professor_percentual_historico --count
```
Expected: `turmas = 3`, `matriculas = 4`, `historico_valor = 3`, `historico_repasse = 2` — os históricos são preenchidos pelos triggers da Task 11, sem nenhum insert explícito.

- [ ] **Step 3: Conferir no navegador**

Run: `npm run dev`, entrar com `gestora@mesinharedonda.local` / `mesinha123`.
Expected: `/turmas` mostra três turmas com contagem de alunos; `/cadastros/alunos` mostra quatro alunos com responsável e escola resolvidos.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(banco): seed de demonstracao"
```

---

### Task 29: Navegação cruzada nos cadastros

Adendo §7 e Operacionais §9 exigem que cada tela liste as entidades relacionadas. O motor genérico não sabe disso, então cada relação vira um painel declarado por rota.

**Files:**
- Create: `src/cadastros/motor/Relacionados.tsx`
- Modify: `src/app/(app)/cadastros/[cadastro]/[id]/page.tsx`

- [ ] **Step 1: Painel de relacionados**

`src/cadastros/motor/Relacionados.tsx`:
```tsx
import Link from 'next/link'
import { clienteServidor } from '@/dados/cliente'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

interface Painel {
  titulo: string
  vazio: string
  itens: { id: number; rotulo: string; href: string; selo?: string }[]
  acao?: { rotulo: string; href: string }
}

/** Relacoes exigidas pelo Adendo secao 7 e pelos Operacionais secao 9. */
export async function paineisDe(rota: string, id: number): Promise<Painel[]> {
  const supabase = await clienteServidor()

  if (rota === 'professores') {
    const { data } = await supabase
      .from('turmas')
      .select('id, nome, status')
      .eq('professor_id', id)
      .order('nome')

    return [
      {
        titulo: 'Turmas deste professor',
        vazio: 'Este professor ainda não é responsável por nenhuma turma.',
        acao: { rotulo: '+ Adicionar turma', href: '/turmas/nova' },
        itens: (data ?? []).map((t) => ({
          id: t.id,
          rotulo: t.nome,
          href: `/turmas/${t.id}`,
          selo: t.status,
        })),
      },
    ]
  }

  if (rota === 'alunos') {
    const { data } = await supabase
      .from('matriculas')
      .select('id, status, flag_reposicao, turma:turmas!turma_id (id, nome)')
      .eq('aluno_id', id)
      .order('data_inicio', { ascending: false })

    return [
      {
        titulo: 'Turmas e matrículas',
        vazio: 'Este aluno ainda não está matriculado em nenhuma turma.',
        acao: { rotulo: '+ Matricular em turma', href: `/matriculas/nova?aluno=${id}` },
        itens: (data ?? []).map((m) => {
          const turma = m.turma as unknown as { id: number; nome: string } | null
          return {
            id: m.id,
            rotulo: turma?.nome ?? 'Turma removida',
            href: `/turmas/${turma?.id}`,
            selo: m.flag_reposicao ? 'Reposição' : m.status,
          }
        }),
      },
    ]
  }

  if (rota === 'responsaveis') {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, ativo')
      .eq('responsavel_id', id)
      .order('nome')

    return [
      {
        titulo: 'Alunos sob responsabilidade',
        vazio: 'Nenhum aluno vinculado a este responsável ainda.',
        itens: (data ?? []).map((a) => ({
          id: a.id,
          rotulo: a.nome,
          href: `/cadastros/alunos/${a.id}`,
          selo: a.ativo ? undefined : 'Inativo',
        })),
      },
    ]
  }

  return []
}

export function PainelRelacionados({ painel }: { painel: Painel }) {
  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{painel.titulo}</h2>
        {painel.acao && (
          <BotaoLink href={painel.acao.href} aparencia="secundario" className="text-sm">
            {painel.acao.rotulo}
          </BotaoLink>
        )}
      </div>

      {painel.itens.length === 0 ? (
        <p className="text-tinta-suave">{painel.vazio}</p>
      ) : (
        <ul className="divide-y divide-borda/60">
          {painel.itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <Link href={item.href} className="font-medium text-destaque hover:underline">
                {item.rotulo}
              </Link>
              {item.selo && (
                <Selo tom={item.selo === 'Ativa' || item.selo === 'Ativo' ? 'ativo' : 'encerrado'}>
                  {item.selo}
                </Selo>
              )}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}
```

- [ ] **Step 2: Ligar na página de edição**

Em `src/app/(app)/cadastros/[cadastro]/[id]/page.tsx`, adicionar os imports:
```tsx
import { PainelRelacionados, paineisDe } from '@/cadastros/motor/Relacionados'
```

E, logo após a linha `const referencias = await carregarReferencias(definicao)`, acrescentar:
```tsx
  const paineis = await paineisDe(cadastro, Number(id))
```

Depois, substituir o `<Formulario … />` e o que vem depois por:
```tsx
      <Formulario
        definicao={definicao}
        registro={registro as Record<string, unknown> & { id: number }}
        referencias={referencias}
      />

      {paineis.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-4">
          {paineis.map((painel) => (
            <PainelRelacionados key={painel.titulo} painel={painel} />
          ))}
        </div>
      )}
```

- [ ] **Step 3: Testar**

Run: `npm run dev`
Expected: abrir um professor do seed mostra suas turmas; abrir "João Ribeiro" mostra a matrícula com link para a turma; abrir "Ana Ribeiro" lista João e Maria.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(cadastros): paineis de navegacao cruzada entre entidades"
```

---

### Task 30: Verificação final do Plano 1

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS em todos os arquivos, 45 testes.

- [ ] **Step 2: Tipos e build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sem erros em nenhum dos três.

- [ ] **Step 3: Banco do zero**

Run: `npx supabase db push --include-seed`
Expected: todas as migrations aplicam sem erro (as ja aplicadas sao puladas).

- [ ] **Step 4: Roteiro manual**

Com `npm run dev`, logado como gestora:

1. `/` mostra a saudação com o nome.
2. `/cadastros/servicos` → editar "Aula regular" mudando o valor para `110,00` → salvar. Conferir com `node scripts/consultar.mjs servico_valor_historico "servico_id,valor,vigencia_inicio,vigencia_fim"`: o histórico registra a troca.
3. `/turmas/nova` → escolher "Aula particular" (permite escola = false) → o campo Escola não aparece; o nome no topo se monta ao vivo.
4. Tentar salvar uma turma sem dia da semana → erro em português: "Escolha ao menos um dia da semana para ativar a turma."
5. `/turmas/3` → "+ Adicionar aluno" → marcar "Matrícula de reposição" → o aviso amarelo aparece animado.
6. Sair e tentar `/cadastros/alunos` sem sessão → redireciona para `/login`.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: verificacao final do Plano 1 (fundacao e cadastros)"
```

---

## Cobertura do spec neste plano

| Requisito do spec | Tarefas |
|---|---|
| §3.1 Stack | 1, 2 |
| §3.2 Camadas | 3–7 (domínio), 14, 21 (dados) |
| §3.3 Precisão monetária | 3, 24 |
| §4.1 Cadastros | 9, 10, 11, 23, 25 |
| §4.1 Turmas | 12, 26 |
| §4.2 Matrículas | 12, 27 |
| §4.3 Apoio (perfis) | 13 |
| §4.4 Segurança e RLS | 13, 14, 18 |
| §5 Regras (turma, matrícula) | 5, 6, 7, 26, 27 |
| §7.1 Princípios de interface | 16 (estado vazio, alvos), 26–27 (avisos) |
| §7.2 Linguagem visual | 15, 16, 17 |
| §7.3 Rotas de cadastro e turmas | 19, 25, 26, 27 |
| §8 Testes de domínio | 3, 5, 6, 7, 20, 24 |
| §9 Fases 1–3 | plano inteiro |
| Adendo §7 / Operacionais §9 (navegação cruzada) | 27, 29 |

**Não coberto neste plano, por desenho:** Aulas, agenda, presenças, reposições, cobranças, recebimentos, pagamentos e o painel inicial. Vão para os Planos 2 e 3.
