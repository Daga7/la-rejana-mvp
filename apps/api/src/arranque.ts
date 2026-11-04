import type { Env } from './config/env'
import type { Contenedor } from './contenedor'
import { sembrar } from './adapters/db/seed'

/**
 * Tareas opcionales al arrancar, pensadas para configurar todo desde el panel de Railway sin consola.
 * Corren después de que la API ya escucha (el health check no las espera) y nunca la tumban: si fallan,
 * queda el error en el log y se reintentan en el siguiente arranque.
 *
 * - SEED_AL_INICIAR: datos de prueba, solo si la base está vacía (sin sedes ni usuarios). Usa la misma
 *   TOKENS_PEPPER de la API, así que las contraseñas de prueba funcionan.
 * - ADMIN_INICIAL_CORREO: si no hay administrador activo, le envía una invitación de un solo uso.
 *
 * Las migraciones no van aquí: corren antes, en el preDeployCommand de railway.json.
 */
/** Drizzle envuelve el error de PostgreSQL: en el log va también la causa (p. ej. «relation … does not exist»). */
const detalle = (e: unknown) => {
  const error = e as Error & { cause?: { message?: string } }
  return [error.message, error.cause?.message].filter(Boolean).join(' · ')
}

export async function tareasDeArranque(c: Contenedor, env: Env): Promise<void> {
  if (env.SEED_AL_INICIAR) {
    try {
      const inicio = Date.now()
      c.log.info('SEED_AL_INICIAR: revisando si la base está vacía…')
      const sembrado = await sembrar(c.conexion.db, { pimienta: env.TOKENS_PEPPER, soloSiVacia: true, silencioso: true })
      c.log.info(
        sembrado
          ? `✔ Datos de prueba cargados en ${Math.round((Date.now() - inicio) / 1000)} s (usuarios *@larejana.test). Apaga SEED_AL_INICIAR cuando quieras.`
          : 'SEED_AL_INICIAR: la base ya tiene datos, no se cargó nada.',
      )
    } catch (e) {
      c.log.error({ err: detalle(e) }, '✖ No se pudieron cargar los datos de prueba (se reintenta en el próximo arranque)')
    }
  }
  if (env.ADMIN_INICIAL_CORREO) {
    try {
      const r = await c.casos.auth.invitarAdminInicial(env.ADMIN_INICIAL_CORREO)
      const mensajes = {
        enviada: '✔ ADMIN_INICIAL_CORREO: enviamos la invitación del primer administrador (vence en 2 horas).',
        vigente: 'ADMIN_INICIAL_CORREO: ya hay una invitación vigente para ese correo; no se envió otra.',
        hay_admin: 'ADMIN_INICIAL_CORREO: ya existe un administrador activo; no hace falta invitación (puedes borrar la variable).',
        correo_en_uso: 'ADMIN_INICIAL_CORREO: ese correo ya tiene una cuenta que no es de administrador; usa otro correo.',
      } as const
      if (r === 'correo_en_uso') c.log.warn(mensajes[r])
      else c.log.info(mensajes[r])
    } catch (e) {
      c.log.error({ err: detalle(e) }, '✖ No se pudo enviar la invitación del primer administrador (se reintenta en el próximo arranque)')
    }
  }
}
