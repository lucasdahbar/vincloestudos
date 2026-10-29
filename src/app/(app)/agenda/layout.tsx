/**
 * Etapa 5 (28/10/2026): a agenda e a porta de entrada. Clicar numa aula abre
 * `@painel` por cima dela (rota interceptada), sem sair da semana ou do mes
 * que a gestora estava vendo.
 */
export default function LayoutDaAgenda({
  children,
  painel,
}: {
  children: React.ReactNode
  painel: React.ReactNode
}) {
  return (
    <>
      {children}
      {painel}
    </>
  )
}
