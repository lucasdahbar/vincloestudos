import Link from 'next/link'
import { alunosSemContato, listarPendentes } from '@/dados/notificacoes'
import { Cartao } from '@/ui/Cartao'
import { exigirGestora } from '@/dados/sessao'
import { ListaMensagens, type MensagemNaTela } from './ListaMensagens'

export default async function PaginaMensagens() {
  await exigirGestora()
  const [pendentes, semContato] = await Promise.all([listarPendentes(), alunosSemContato()])

  // Só dados simples atravessam para o componente cliente.
  const mensagens: MensagemNaTela[] = pendentes.map((m) => ({
    id: m.id,
    tipo: m.tipo,
    canal: m.canal,
    destinatario_nome: m.destinatario_nome,
    contato: m.contato,
    agendado_para: m.agendado_para,
    texto_gerado: m.texto_gerado,
  }))

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Mensagens a enviar</h1>
        <p className="mt-1 text-tinta-suave">
          {mensagens.length === 0
            ? 'Nada pendente'
            : `${mensagens.length} ${mensagens.length === 1 ? 'mensagem' : 'mensagens'} na fila`}
        </p>
      </header>

      {semContato.length > 0 && (
        <Cartao className="border-alerta-borda bg-alerta-suave">
          <h2 className="text-lg text-alerta">Avisos que não têm como sair</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Estes alunos estão marcados para receber avisos, mas falta o contato. Nenhuma
            mensagem será gerada para eles até isso ser preenchido.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {semContato.map((a) => (
              <li key={a.aluno_id}>
                <Link href={`/cadastros/alunos/${a.aluno_id}`} className="font-medium text-destaque hover:underline">
                  {a.aluno_nome}
                </Link>
                <span className="text-tinta-suave"> — {a.motivo}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <ListaMensagens mensagens={mensagens} />
    </div>
  )
}
