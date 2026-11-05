import { canjearPremioSchema, codigoPasaporte, configPasaporteSchema, inscribirPasaporteSchema, sellarCuentaSchema } from '@rejana/shared'
import type { Peticion, Router } from '../router'
import { z } from 'zod'
import type { Contenedor } from '../../../contenedor'
import { actorDe } from '../servidor'

/** Pasaporte de sellos: el cliente lo activa y lo ve; la caja sella y canjea; el admin lo configura. */
export function rutasPasaporte(app: Router, c: Contenedor) {
  const { pasaporte } = c.casos
  const actor = (req: Peticion) => actorDe(req, c, c.env)
  const ctx = (req: Peticion) => ({ ip: req.ipCliente, userAgent: (req.headers['user-agent'] as string | undefined) ?? null })
  const limite = (max: number, ventana: string) => ({ rateLimit: { max, timeWindow: ventana } })

  app.get('/api/pasaporte/programa', { config: limite(60, '1 minute') }, async () => ({ programa: await pasaporte.programa() }))

  // --- Cliente --------------------------------------------------------------------------------------
  app.get('/api/pasaporte', async (req) => ({ pasaporte: await pasaporte.miPasaporte(await actor(req)) }))
  app.post('/api/pasaporte/inscripcion', { config: limite(10, '1 minute') }, async (req, reply) => {
    inscribirPasaporteSchema.parse(req.body)
    return reply.status(201).send({ pasaporte: await pasaporte.inscribir(await actor(req), ctx(req)) })
  })
  app.post('/api/pasaporte/codigo', { config: limite(5, '1 minute') }, async (req) => ({ pasaporte: await pasaporte.cambiarCodigo(await actor(req)) }))
  app.delete('/api/pasaporte', { config: limite(5, '1 minute') }, async (req, reply) => {
    await pasaporte.salir(await actor(req), ctx(req))
    return reply.status(204).send()
  })

  // --- Caja (límite estricto en la consulta: el código no se puede adivinar probando) ----------------
  app.get('/api/pasaporte/codigos/:codigo', { config: limite(30, '1 minute') }, async (req) => {
    const { codigo } = z.object({ codigo: codigoPasaporte }).parse(req.params)
    return { cliente: await pasaporte.consultar(await actor(req), codigo) }
  })
  app.post('/api/pasaporte/sellos', { config: limite(30, '1 minute') }, async (req) => ({ cliente: await pasaporte.sellarCuenta(await actor(req), sellarCuentaSchema.parse(req.body), ctx(req)) }))
  app.post('/api/pasaporte/canjes', { config: limite(20, '1 minute') }, async (req) => ({ cliente: await pasaporte.canjear(await actor(req), canjearPremioSchema.parse(req.body), ctx(req)) }))

  // --- Administración -------------------------------------------------------------------------------
  app.get('/api/admin/pasaporte', async (req) => ({ config: await pasaporte.configuracion(await actor(req)) }))
  app.put('/api/admin/pasaporte', { config: limite(20, '1 minute') }, async (req) => ({ config: await pasaporte.guardarConfiguracion(await actor(req), configPasaporteSchema.parse(req.body), ctx(req)) }))
}
