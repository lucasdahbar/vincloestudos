import type { Metadata } from 'next'
import { escolasDoCadastro, situacaoDoLink } from '@/dados/cadastro-publico'
import { MOTIVO_INDISPONIVEL } from '@/dominio/cadastro-publico/convite'
import { MARCA, WHATSAPP_DE_CONTATO, WHATSAPP_LINK, titulo } from '@/marca'
import { FormularioCadastro } from './FormularioCadastro'

// O link carrega um segredo: nao vai para buscador nem para o cabecalho
// Referer das chamadas que a pagina faz (a busca de CEP).
export const metadata: Metadata = {
  title: titulo('Cadastro'),
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PaginaCadastro({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const situacao = await situacaoDoLink(token)
  const escolas = situacao === 'valido' ? await escolasDoCadastro() : []

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-10">
      {situacao === 'valido' ? (
        <>
          <header className="mb-8">
            <p className="text-sm font-medium text-destaque">{MARCA}</p>
            <h1 className="mt-1 font-titulo text-3xl">Cadastro</h1>
            <p className="mt-3 text-tinta-suave">
              Seja muito bem-vindo(a)! Para começarmos, preencha os campos abaixo com as
              suas informações e as do(a) aluno(a). Se precisar de ajuda, entre em
              contato pelo WhatsApp{' '}
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-destaque underline"
              >
                {WHATSAPP_DE_CONTATO}
              </a>
              .
            </p>
          </header>
          <FormularioCadastro token={token} escolas={escolas} />
        </>
      ) : (
        <div className="rounded-cartao border border-borda bg-superficie p-8 text-center">
          <h1 className="font-titulo text-2xl">
            {situacao === 'usado' ? 'Dados recebidos' : 'Link indisponível'}
          </h1>
          <p className="mt-3 text-tinta-suave">
            {situacao === 'inexistente'
              ? 'Este link não existe. Confira se ele foi copiado inteiro ou peça um novo à escola.'
              : MOTIVO_INDISPONIVEL[situacao]}
          </p>
        </div>
      )}
    </main>
  )
}
