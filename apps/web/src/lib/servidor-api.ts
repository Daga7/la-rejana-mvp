import 'server-only'
import { cargarEnv, crearApp, crearContenedor, tareasDeArranque, type AppLista } from '@rejana/server'

// Una sola instancia por proceso (igual que el pool de PostgreSQL): Next.js reutiliza el módulo entre
// solicitudes dentro de la misma función/lambda. Las tareas de arranque (seed, primer admin) corren
// una vez, en segundo plano, sin bloquear la primera solicitud.
let promesa: Promise<AppLista> | null = null

async function construir(): Promise<AppLista> {
  const env = cargarEnv(process.env)
  const lista = await crearApp(env, crearContenedor)
  void tareasDeArranque(lista.c, env)
  return lista
}

export function obtenerApp(): Promise<AppLista> {
  promesa ??= construir()
  return promesa
}
