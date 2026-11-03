import { exigirGestora } from '@/dados/sessao'
import { autoriaDosModelos, carregarModelosDaSessao } from '@/dados/mensagens-modelo'
import {
  CHAVES,
  MODELOS,
  textoDoModelo,
  type GrupoModelo,
} from '@/dominio/mensagens-modelo/catalogo'
import { titulo } from '@/marca'
import { EditorDeMensagem } from './EditorDeMensagem'

export const metadata = { title: titulo('Textos das mensagens') }
export const dynamic = 'force-dynamic'

const GRUPOS: GrupoModelo[] = ['Famílias e alunos', 'Professores', 'Cadastro', 'Cobrança e pagamento']

function dataCurta(iso: string): string {
  // Dia e mes no fuso da escola, nao no do servidor.
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default async function PaginaTextosDasMensagens() {
  await exigirGestora()
  const [editados, autoria] = await Promise.all([carregarModelosDaSessao(), autoriaDosModelos()])

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-3xl">Textos das mensagens</h1>
        <p className="mt-1 text-tinta-suave">
          Aqui você muda o que cada mensagem diz. Os dados de cada pessoa entram sozinhos nos
          campos entre chaves, como <span className="font-mono text-tinta">{'{nome}'}</span>. A
          mudança vale para as próximas mensagens; as que já foram enviadas ou estão na fila de
          Mensagens continuam como estavam.
        </p>
      </header>

      {GRUPOS.map((grupo) => (
        <section key={grupo} className="flex flex-col gap-4">
          <h2 className="text-xl">{grupo}</h2>
          {CHAVES.filter((c) => MODELOS[c].grupo === grupo).map((chave) => {
            const m = MODELOS[chave]
            const a = autoria[chave]
            return (
              <EditorDeMensagem
                key={chave}
                chave={chave}
                titulo={m.titulo}
                quando={m.quando}
                campos={m.campos}
                obrigatorios={m.obrigatorios}
                exemplo={m.exemplo}
                padrao={m.padrao}
                textoAtual={textoDoModelo(chave, editados)}
                editado={chave in editados}
                autoria={a ? `${a.por ?? 'alguém'}, ${dataCurta(a.em)}` : null}
              />
            )
          })}
          {grupo === 'Cobrança e pagamento' && (
            <p className="text-sm text-tinta-suave">
              Na cobrança e no relatório, só o começo e o fim são editáveis. A lista de alunos,
              aulas e valores é montada pelo sistema, para os valores ficarem alinhados no
              WhatsApp. O texto de uma cobrança é gravado quando ela é confirmada; as já
              confirmadas não mudam.
            </p>
          )}
        </section>
      ))}

    </div>
  )
}
