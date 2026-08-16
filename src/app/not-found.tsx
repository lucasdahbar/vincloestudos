import Link from 'next/link'

/**
 * Pagina de endereco inexistente, em portugues.
 *
 * A padrao do Next diz "This page could not be found" — em ingles, num sistema
 * que a gestora usa inteiramente em portugues.
 */
export default function NaoEncontrada() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="max-w-md text-center">
        <p className="rotulo-seco">Endereço não encontrado</p>
        <h1 className="mt-2 text-3xl">Esta página não existe</h1>
        <p className="mt-3 text-tinta-suave">
          O endereço pode ter sido digitado errado, ou o registro que você procura foi removido.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-[44px] items-center rounded-campo bg-destaque px-5 font-medium text-white shadow-destaque transition-colors hover:bg-destaque-forte"
        >
          Voltar para o início
        </Link>
      </div>
    </main>
  )
}
