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
