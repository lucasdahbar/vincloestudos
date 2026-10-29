import { ConteudoDaAula } from './ConteudoDaAula'

export default async function PaginaAula({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ConteudoDaAula id={Number(id)} />
}
