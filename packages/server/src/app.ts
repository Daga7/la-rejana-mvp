import type { Env } from './config/env'
import type { Contenedor, Sobrescrituras } from './contenedor'
import type { Logger } from './ports/servicios'
import { crearLogger } from './adapters/http/logger'
import { crearServidor } from './adapters/http/servidor'
import type { Router } from './adapters/http/router'
import { rutasAdmin } from './adapters/http/rutas/admin'
import { rutasAsistente } from './adapters/http/rutas/asistente'
import { rutasAuth } from './adapters/http/rutas/auth'
import { rutasBuzon } from './adapters/http/rutas/buzon'
import { rutasMenu } from './adapters/http/rutas/menu'
import { rutasDomicilios } from './adapters/http/rutas/domicilios'
import { rutasMesas } from './adapters/http/rutas/mesas'
import { rutasPasaporte } from './adapters/http/rutas/pasaporte'
import { rutasPedidos } from './adapters/http/rutas/pedidos'
import { rutasTurnos } from './adapters/http/rutas/turnos'
import { rutasSalud } from './adapters/http/rutas/salud'
import { rutasTiempoReal } from './adapters/http/rutas/tiempo-real'

export interface AppLista {
  app: Router
  c: Contenedor
  cerrar: () => Promise<void>
}

/** Arma la aplicación completa (rutas HTTP). La usan los route handlers de Next.js y las pruebas. */
export async function crearApp(
  env: Env,
  fabrica: (env: Env, log: Logger, s?: Sobrescrituras) => Contenedor,
  opciones: { silencioso?: boolean; sobrescrituras?: Sobrescrituras } = {},
): Promise<AppLista> {
  const log = crearLogger(env, opciones.silencioso)
  const c = fabrica(env, log, opciones.sobrescrituras)
  const app = crearServidor({ env, c, log })

  rutasSalud(app, c)
  rutasAuth(app, c)
  rutasMenu(app, c)
  rutasPedidos(app, c)
  rutasMesas(app, c)
  rutasTurnos(app, c)
  rutasPasaporte(app, c)
  rutasDomicilios(app, c)
  rutasAdmin(app, c)
  rutasBuzon(app, c)
  rutasAsistente(app, c)
  rutasTiempoReal(app, c)

  return {
    app,
    c,
    cerrar: async () => {
      await c.conexion.cerrar()
    },
  }
}
