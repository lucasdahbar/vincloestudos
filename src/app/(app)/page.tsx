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
