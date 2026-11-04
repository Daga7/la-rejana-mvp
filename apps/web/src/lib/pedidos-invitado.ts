'use client'

// Credenciales de los pedidos hechos como invitado en este dispositivo (id + token de seguimiento).
// El token es la única forma de consultar el pedido sin cuenta: se guarda solo aquí.

const CLAVE = 'rejana-pedidos-invitado'

export interface CredencialPedido {
  id: string
  token: string
  creadoEn: string
}

export function credencialesInvitado(): CredencialPedido[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as CredencialPedido[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function guardarCredencial(id: string, token: string) {
  const lista = credencialesInvitado().filter((c) => c.id !== id)
  lista.unshift({ id, token, creadoEn: new Date().toISOString() })
  localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, 20)))
}

export function tokenDe(id: string): string | null {
  return credencialesInvitado().find((c) => c.id === id)?.token ?? null
}
