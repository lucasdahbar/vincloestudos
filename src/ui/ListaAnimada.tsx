'use client'

import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { containerEscalonado, itemEscalonado } from './animacoes'

export function ListaAnimada({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={containerEscalonado} initial="oculto" animate="visivel">
      {children}
    </motion.div>
  )
}

export function ItemAnimado({ children }: { children: ReactNode }) {
  return <motion.div variants={itemEscalonado}>{children}</motion.div>
}
