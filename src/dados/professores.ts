import 'server-only'
import { randomBytes } from 'node:crypto'
import { clienteServidor } from './cliente'
import { clienteAdmin } from './admin'

/**
 * R1 (Rodada 2): o link pessoal e permanente de presenca do professor.
 *
 * O token e o unico segredo que protege esse link — nao ha senha na frente
 * dele, porque o ponto do item e o professor abrir e marcar presenca sem
 * login. Por isso ele vem de `randomBytes`, e nao de `Math.random()`, e e longo
 * o suficiente para nao ser adivinhado.
 *
 * O que ele da acesso e limitado no dominio (`link-professor.ts`): so as aulas
 * daquele professor, e so as que estao perto do horario atual.
 */
export function gerarToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Devolve o token do professor, criando um na primeira vez.
 *
 * Idempotente de proposito: chamada no aviso de turma nova, no cadastro e na
 * tela do link, ela nunca pode trocar um token que ja foi enviado — trocar
 * invalidaria o link que o professor guardou no celular.
 */
export async function garantirTokenDoProfessor(professorId: number): Promise<string | null> {
  // Chamada tambem de dentro de `after()`, depois da resposta ter ido: usa o
  // cliente de servico, que nao depende da sessao pela cookie.
  const supabase = clienteAdmin()

  const { data: atual } = await supabase
    .from('professores')
    .select('token_presenca')
    .eq('id', professorId)
    .maybeSingle()

  if (atual?.token_presenca) return atual.token_presenca

  const token = gerarToken()
  const { error } = await supabase
    .from('professores')
    .update({ token_presenca: token })
    .eq('id', professorId)

  if (error) return null
  return token
}

/**
 * Gera um token NOVO, invalidando o anterior.
 *
 * E o caso do professor que perdeu o celular ou trocou de aparelho: o link
 * antigo circulando por ai deixa de abrir qualquer coisa na hora.
 */
export async function regerarTokenDoProfessor(professorId: number): Promise<string> {
  const supabase = await clienteServidor()
  const token = gerarToken()

  const { error } = await supabase
    .from('professores')
    .update({ token_presenca: token })
    .eq('id', professorId)

  if (error) throw new Error(`Falha ao gerar o link: ${error.message}`)
  return token
}

export interface ProfessorDoLink {
  id: number
  nome: string
}

/** Quem e o dono deste link. `null` quando o token nao existe mais. */
export async function professorPorToken(token: string): Promise<ProfessorDoLink | null> {
  // Rota publica, sem sessao: a leitura por token precisa do cliente de servico,
  // como no link de presenca por aula.
  const admin = clienteAdmin()

  const { data } = await admin
    .from('professores')
    .select('id, nome, ativo')
    .eq('token_presenca', token)
    .maybeSingle()

  // Professor inativo perde o acesso junto com o cadastro: sem isso, o link de
  // quem saiu continuaria abrindo as aulas do dia.
  if (!data || !data.ativo) return null
  return { id: data.id, nome: data.nome }
}

/** O token atual, sem criar um novo. `null` quando ainda nao existe. */
export async function tokenDoProfessor(professorId: number): Promise<string | null> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('professores')
    .select('token_presenca')
    .eq('id', professorId)
    .maybeSingle()

  return data?.token_presenca ?? null
}
