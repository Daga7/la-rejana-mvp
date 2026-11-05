import { conectarBD, opcionesBDDelEntorno } from './cliente'
import { sembrar } from './seed'

// Carga los datos de prueba en una base vacía. Uso: pnpm db:seed (con la imagen: node dist/seed.js).
// Sin consola (Vercel desde la tableta) se usa SEED_AL_INICIAR=true: la API siembra al arrancar.

if (process.env.NODE_ENV === 'production' && process.env.SEED_PERMITIR_PRODUCCION !== 'true') {
  console.error('✖ El seed crea usuarios con contraseña conocida: en producción exige SEED_PERMITIR_PRODUCCION=true.')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}
const conexion = conectarBD(process.env.DATABASE_URL, { ...opcionesBDDelEntorno(), max: 2 })
try {
  // La pimienta debe ser la misma TOKENS_PEPPER de la API (sembrar falla si falta).
  const sembrado = await sembrar(conexion.db, { pimienta: process.env.TOKENS_PEPPER ?? '', soloSiVacia: true })
  console.log(sembrado ? '✔ Seed completo' : 'La base ya tiene datos; usa `pnpm db:reset` para empezar de cero.')
} finally {
  await conexion.cerrar()
}
