import { and, desc, eq, gt, gte, isNull, ne, sql } from 'drizzle-orm'
import type {
  CodigoVerificacion,
  DireccionCliente,
  IdentidadOAuth,
  Invitacion,
  RepoCodigos,
  RepoDirecciones,
  RepoIdentidades,
  RepoInvitaciones,
  RepoSesiones,
  RepoUsuarios,
  Usuario,
} from '../../../ports/repositorios'
import type { Ejecutor } from '../cliente'
import {
  codigosVerificacion,
  direccionesCliente,
  identidadesOAuth,
  invitaciones,
  sesiones,
  tokensRefresco,
  usuarios,
} from '../schema'

const aUsuario = (r: typeof usuarios.$inferSelect): Usuario => ({
  id: r.id,
  email: r.email,
  nombre: r.nombre,
  telefono: r.telefono,
  passwordHash: r.passwordHash,
  emailVerificadoEn: r.emailVerificadoEn,
  rol: r.rol,
  sedeId: r.sedeId,
  activo: r.activo,
  intentosFallidos: r.intentosFallidos,
  bloqueadoHasta: r.bloqueadoHasta,
  aceptoPrivacidadEn: r.aceptoPrivacidadEn,
  versionPrivacidad: r.versionPrivacidad,
  whatsappHabilitado: r.whatsappHabilitado,
  ultimoIngresoEn: r.ultimoIngresoEn,
  credencialesCambiadasEn: r.credencialesCambiadasEn,
  creadoEn: r.creadoEn,
})

export function repoUsuarios(db: Ejecutor): RepoUsuarios {
  return {
    async porId(id) {
      const [r] = await db.select().from(usuarios).where(eq(usuarios.id, id)).limit(1)
      return r ? aUsuario(r) : null
    },
    async porEmail(email) {
      const [r] = await db.select().from(usuarios).where(eq(usuarios.email, email.toLowerCase())).limit(1)
      return r ? aUsuario(r) : null
    },
    async adminWhatsapp(telefono) {
      const [r] = await db
        .select()
        .from(usuarios)
        .where(and(eq(usuarios.telefono, telefono), eq(usuarios.rol, 'admin'), eq(usuarios.activo, true), eq(usuarios.whatsappHabilitado, true)))
        .limit(1)
      return r ? aUsuario(r) : null
    },
    async crear(datos) {
      const [r] = await db
        .insert(usuarios)
        .values({ ...datos, email: datos.email.toLowerCase() })
        .returning()
      return aUsuario(r!)
    },
    async actualizar(id, cambios) {
      const [r] = await db
        .update(usuarios)
        .set({ ...cambios, actualizadoEn: new Date() })
        .where(eq(usuarios.id, id))
        .returning()
      return aUsuario(r!)
    },
    async sumarIntentoFallido(id) {
      const [r] = await db
        .update(usuarios)
        .set({ intentosFallidos: sql`${usuarios.intentosFallidos} + 1` })
        .where(eq(usuarios.id, id))
        .returning({ intentos: usuarios.intentosFallidos })
      return r?.intentos ?? 0
    },
    async empleados({ sedeId }) {
      const filas = await db
        .select()
        .from(usuarios)
        .where(and(ne(usuarios.rol, 'cliente'), sedeId ? eq(usuarios.sedeId, sedeId) : undefined))
        .orderBy(usuarios.nombre)
      return filas.map(aUsuario)
    },
    async domiciliarios(sedeId) {
      const filas = await db
        .select()
        .from(usuarios)
        .where(and(eq(usuarios.rol, 'domiciliario'), eq(usuarios.sedeId, sedeId), eq(usuarios.activo, true)))
        .orderBy(usuarios.nombre)
      return filas.map(aUsuario)
    },
    async contarAdminsActivos() {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(usuarios)
        .where(and(eq(usuarios.rol, 'admin'), eq(usuarios.activo, true)))
      return r?.n ?? 0
    },
  }
}

export function repoIdentidades(db: Ejecutor): RepoIdentidades {
  const a = (r: typeof identidadesOAuth.$inferSelect): IdentidadOAuth => ({
    id: r.id,
    usuarioId: r.usuarioId,
    proveedor: r.proveedor,
    sujeto: r.sujeto,
    email: r.email,
  })
  return {
    async buscar(proveedor, sujeto) {
      const [r] = await db
        .select()
        .from(identidadesOAuth)
        .where(and(eq(identidadesOAuth.proveedor, proveedor), eq(identidadesOAuth.sujeto, sujeto)))
        .limit(1)
      return r ? a(r) : null
    },
    async crear(datos) {
      const [r] = await db.insert(identidadesOAuth).values(datos).returning()
      return a(r!)
    },
    async deUsuario(usuarioId) {
      const filas = await db.select().from(identidadesOAuth).where(eq(identidadesOAuth.usuarioId, usuarioId))
      return filas.map(a)
    },
  }
}

export function repoSesiones(db: Ejecutor): RepoSesiones {
  return {
    async crear(datos) {
      const [r] = await db.insert(sesiones).values(datos).returning()
      return r!
    },
    async porId(id) {
      const [r] = await db.select().from(sesiones).where(eq(sesiones.id, id)).limit(1)
      return r ?? null
    },
    async tocar(id, ahora) {
      await db.update(sesiones).set({ ultimoUsoEn: ahora }).where(eq(sesiones.id, id))
    },
    async revocar(id, motivo, ahora) {
      await db
        .update(sesiones)
        .set({ revocadaEn: ahora, motivoRevocacion: motivo })
        .where(and(eq(sesiones.id, id), isNull(sesiones.revocadaEn)))
    },
    async revocarTodas(usuarioId, motivo, ahora, excepto) {
      const filas = await db
        .update(sesiones)
        .set({ revocadaEn: ahora, motivoRevocacion: motivo })
        .where(and(eq(sesiones.usuarioId, usuarioId), isNull(sesiones.revocadaEn), excepto ? ne(sesiones.id, excepto) : undefined))
        .returning({ id: sesiones.id })
      return filas.length
    },
    async guardarRefresco(datos) {
      await db.insert(tokensRefresco).values(datos)
    },
    async refrescoPorHash(tokenHash) {
      const [r] = await db
        .select({ id: tokensRefresco.id, sesionId: tokensRefresco.sesionId, expiraEn: tokensRefresco.expiraEn, usadoEn: tokensRefresco.usadoEn })
        .from(tokensRefresco)
        .where(eq(tokensRefresco.tokenHash, tokenHash))
        .limit(1)
      return r ?? null
    },
    async usarRefresco(id, ahora) {
      const filas = await db
        .update(tokensRefresco)
        .set({ usadoEn: ahora })
        .where(and(eq(tokensRefresco.id, id), isNull(tokensRefresco.usadoEn)))
        .returning({ id: tokensRefresco.id })
      return filas.length === 1
    },
  }
}

export function repoCodigos(db: Ejecutor): RepoCodigos {
  const a = (r: typeof codigosVerificacion.$inferSelect): CodigoVerificacion => r
  return {
    async vigente(email, proposito, ahora) {
      const [r] = await db
        .select()
        .from(codigosVerificacion)
        .where(
          and(
            eq(codigosVerificacion.email, email),
            eq(codigosVerificacion.proposito, proposito),
            isNull(codigosVerificacion.consumidoEn),
            gt(codigosVerificacion.expiraEn, ahora),
          ),
        )
        .orderBy(desc(codigosVerificacion.creadoEn))
        .limit(1)
      return r ? a(r) : null
    },
    async ultimo(email, proposito) {
      const [r] = await db
        .select()
        .from(codigosVerificacion)
        .where(and(eq(codigosVerificacion.email, email), eq(codigosVerificacion.proposito, proposito)))
        .orderBy(desc(codigosVerificacion.creadoEn))
        .limit(1)
      return r ? a(r) : null
    },
    async contarDesde(email, proposito, desde) {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(codigosVerificacion)
        .where(and(eq(codigosVerificacion.email, email), eq(codigosVerificacion.proposito, proposito), gte(codigosVerificacion.creadoEn, desde)))
      return r?.n ?? 0
    },
    async crear(datos) {
      const [r] = await db.insert(codigosVerificacion).values(datos).returning()
      return a(r!)
    },
    async invalidar(email, proposito, ahora) {
      await db
        .update(codigosVerificacion)
        .set({ consumidoEn: ahora })
        .where(and(eq(codigosVerificacion.email, email), eq(codigosVerificacion.proposito, proposito), isNull(codigosVerificacion.consumidoEn)))
    },
    async sumarIntento(id) {
      const [r] = await db
        .update(codigosVerificacion)
        .set({ intentos: sql`${codigosVerificacion.intentos} + 1` })
        .where(eq(codigosVerificacion.id, id))
        .returning({ intentos: codigosVerificacion.intentos })
      return r?.intentos ?? 0
    },
    async consumir(id, ahora) {
      const filas = await db
        .update(codigosVerificacion)
        .set({ consumidoEn: ahora })
        .where(and(eq(codigosVerificacion.id, id), isNull(codigosVerificacion.consumidoEn)))
        .returning({ id: codigosVerificacion.id })
      return filas.length === 1
    },
  }
}

export function repoInvitaciones(db: Ejecutor): RepoInvitaciones {
  const a = (r: typeof invitaciones.$inferSelect): Invitacion => ({
    id: r.id,
    email: r.email,
    rol: r.rol,
    sedeId: r.sedeId,
    invitadoPor: r.invitadoPor,
    expiraEn: r.expiraEn,
    aceptadaEn: r.aceptadaEn,
    revocadaEn: r.revocadaEn,
    creadoEn: r.creadoEn,
  })
  return {
    async crear(datos) {
      const [r] = await db.insert(invitaciones).values(datos).returning()
      return a(r!)
    },
    async porTokenHash(tokenHash) {
      const [r] = await db.select().from(invitaciones).where(eq(invitaciones.tokenHash, tokenHash)).limit(1)
      return r ? a(r) : null
    },
    async porId(id) {
      const [r] = await db.select().from(invitaciones).where(eq(invitaciones.id, id)).limit(1)
      return r ? a(r) : null
    },
    async aceptar(id, usuarioId, ahora) {
      const filas = await db
        .update(invitaciones)
        .set({ aceptadaEn: ahora, usuarioId })
        .where(and(eq(invitaciones.id, id), isNull(invitaciones.aceptadaEn), isNull(invitaciones.revocadaEn), gt(invitaciones.expiraEn, ahora)))
        .returning({ id: invitaciones.id })
      return filas.length === 1
    },
    async revocar(id, ahora) {
      await db
        .update(invitaciones)
        .set({ revocadaEn: ahora })
        .where(and(eq(invitaciones.id, id), isNull(invitaciones.aceptadaEn)))
    },
    async revocarPendientesDe(email, ahora) {
      await db
        .update(invitaciones)
        .set({ revocadaEn: ahora })
        .where(and(eq(invitaciones.email, email), isNull(invitaciones.aceptadaEn), isNull(invitaciones.revocadaEn)))
    },
    async pendientes(ahora) {
      const filas = await db
        .select()
        .from(invitaciones)
        .where(and(isNull(invitaciones.aceptadaEn), isNull(invitaciones.revocadaEn), gt(invitaciones.expiraEn, ahora)))
        .orderBy(desc(invitaciones.creadoEn))
      return filas.map(a)
    },
  }
}

export function repoDirecciones(db: Ejecutor): RepoDirecciones {
  const a = (r: typeof direccionesCliente.$inferSelect): DireccionCliente => ({
    id: r.id,
    usuarioId: r.usuarioId,
    etiqueta: r.etiqueta,
    direccion: r.direccion,
    detalle: r.detalle,
    barrio: r.barrio,
    lat: r.lat,
    lng: r.lng,
  })
  return {
    async deUsuario(usuarioId) {
      const filas = await db.select().from(direccionesCliente).where(eq(direccionesCliente.usuarioId, usuarioId)).orderBy(desc(direccionesCliente.creadoEn))
      return filas.map(a)
    },
    async crear(datos) {
      const [r] = await db.insert(direccionesCliente).values(datos).returning()
      return a(r!)
    },
    async eliminar(id, usuarioId) {
      const filas = await db
        .delete(direccionesCliente)
        .where(and(eq(direccionesCliente.id, id), eq(direccionesCliente.usuarioId, usuarioId)))
        .returning({ id: direccionesCliente.id })
      return filas.length === 1
    },
    async contar(usuarioId) {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(direccionesCliente).where(eq(direccionesCliente.usuarioId, usuarioId))
      return r?.n ?? 0
    },
  }
}
