import { ConteudoDaAula } from '../../../aulas/[id]/ConteudoDaAula'
import { Painel } from '@/ui/Painel'

/** O clique numa aula da agenda: a mesma tela da aula, num painel lateral. */
export default async function PainelDaAula({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Painel titulo="Aula" href={`/agenda/aulas/${id}`}>
      <ConteudoDaAula id={Number(id)} noPainel />
    </Painel>
  )
}
