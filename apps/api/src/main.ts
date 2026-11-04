import { cargarEnv } from './config/env'
import { crearContenedor } from './contenedor'
import { crearApp } from './app'

async function iniciar() {
  const env = cargarEnv()
  const { app, cerrar } = await crearApp(env, crearContenedor)
  const apagar = async (senal: string) => {
    app.log.info(`Recibido ${senal}, cerrando…`)
    await cerrar()
    process.exit(0)
  }
  process.on('SIGTERM', () => void apagar('SIGTERM'))
  process.on('SIGINT', () => void apagar('SIGINT'))
  await app.listen({ port: env.PORT, host: env.HOST })
}

iniciar().catch((e) => {
  console.error(e)
  process.exit(1)
})
