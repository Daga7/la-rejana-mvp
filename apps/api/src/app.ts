import type { FastifyInstance } from 'fastify'
import type { Env } from './config/env'
import type { Contenedor, Sobrescrituras } from './contenedor'
import type { Logger } from './ports/servicios'
import { crearLogger } from './adapters/http/logger'
import { crearServidor } from './adapters/http/servidor'
import { rutasAdmin } from './adapters/http/rutas/admin'
import { rutasAsistente } from './adapters/http/rutas/asistente'
import { rutasAuth } from './adapters/http/rutas/auth'
import { rutasBuzon } from './adapters/http/rutas/buzon'
import { rutasMenu } from './adapters/http/rutas/menu'
import { manejadorUbicacion, rutasDomicilios } from './adapters/http/rutas/domicilios'
import { rutasPedidos } from './adapters/http/rutas/pedidos'
import { rutasSalud } from './adapters/http/rutas/salud'
import { crearServidorTiempoReal } from './adapters/realtime/servidor'
import { origenesPermitidos } from './config/env'

export interface AppLista {
  app: FastifyInstance
  c: Contenedor
  cerrar: () => Promise<void>
}

/** Arma la aplicación completa (HTTP + rutas + tiempo real). La usan main.ts y las pruebas de integración. */
export async function crearApp(
  env: Env,
  fabrica: (env: Env, log: Logger, s?: Sobrescrituras) => Contenedor,
  opciones: { silencioso?: boolean; sobrescrituras?: Sobrescrituras } = {},
): Promise<AppLista> {
  const log = crearLogger(env, opciones.silencioso)
  const c = fabrica(env, log, opciones.sobrescrituras)
  const app = await crearServidor({ env, c, log })

  rutasSalud(app, c)
  rutasAuth(app, c)
  rutasMenu(app, c)
  rutasPedidos(app, c)
  rutasDomicilios(app, c)
  rutasAdmin(app, c)
  rutasBuzon(app, c)
  rutasAsistente(app, c)

  const io = crearServidorTiempoReal(app, { origenes: origenesPermitidos(env), tokens: c.tokens, log, manejadores: [manejadorUbicacion(c)] })
  c.eventos.conectar(io)

  await app.ready()
  return {
    app,
    c,
    cerrar: async () => {
      await app.close()
      await c.conexion.cerrar()
    },
  }
}
