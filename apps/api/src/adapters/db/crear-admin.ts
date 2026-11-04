import { correo as esquemaCorreo } from '@rejana/shared'
import { conectarBD, opcionesBDDelEntorno } from './cliente'
import { crearRepositorios } from './repos'
import { criptografiaNode } from '../seguridad/criptografia'

// Crea una invitación de un solo uso para el PRIMER administrador (o uno adicional de emergencia).
// No existen contraseñas por defecto: la persona define la suya al aceptar la invitación.
// Uso:  pnpm --filter @rejana/api admin:crear correo@dominio.com      (con la imagen: node dist/crear-admin.js correo@…)
// Sin consola (Railway desde la tableta), usa ADMIN_INICIAL_CORREO: la API envía la invitación al arrancar.

const entrada = esquemaCorreo.safeParse(process.argv[2])
if (!entrada.success) {
  console.error('Uso: crear-admin <correo>')
  process.exit(1)
}
const { DATABASE_URL, TOKENS_PEPPER, WEB_ORIGIN } = process.env
if (!DATABASE_URL || !TOKENS_PEPPER || !WEB_ORIGIN) {
  console.error('Faltan DATABASE_URL, TOKENS_PEPPER o WEB_ORIGIN')
  process.exit(1)
}
const conexion = conectarBD(DATABASE_URL, { ...opcionesBDDelEntorno(), max: 1 })
const repos = crearRepositorios(conexion.db)
const email = entrada.data
if (await repos.usuarios.porEmail(email)) {
  console.error('Ya existe un usuario con ese correo.')
  await conexion.cerrar()
  process.exit(1)
}
const cripto = criptografiaNode(TOKENS_PEPPER)
const token = cripto.tokenAleatorio(32)
const ahora = new Date()
await repos.invitaciones.revocarPendientesDe(email, ahora)
await repos.invitaciones.crear({ email, rol: 'admin', sedeId: null, tokenHash: cripto.huella(token), invitadoPor: null, expiraEn: new Date(ahora.getTime() + 72 * 3_600_000) })
await repos.auditoria.registrar({ actorId: null, actorRol: 'sistema', accion: 'invitacion.admin_inicial', entidad: 'invitacion', entidadId: null, datos: { email } })
await conexion.cerrar()
console.log(`\n✔ Invitación de administrador creada para ${email} (vence en 72 horas).`)
console.log(`  Ábrela en el navegador y define la contraseña:\n\n  ${new URL('/invitacion', WEB_ORIGIN).href}#t=${token}\n`)
