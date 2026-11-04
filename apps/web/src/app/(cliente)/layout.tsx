import { MarcoCliente } from '@/componentes/cliente/MarcoCliente'

export default function LayoutCliente({ children }: { children: React.ReactNode }) {
  return <MarcoCliente>{children}</MarcoCliente>
}
