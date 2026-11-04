import { createHash } from 'node:crypto'
import {
  INICIO_ROL,
  VERSION_PRIVACIDAD,
  type ProveedorOAuth,
  type Rol,
  type RolEmpleado,
  type UsuarioDTO,
} from '@rejana/shared'
import { esClaveComun } from '../domain/clave'
import { ErrorDominio, err } from '../domain/errores'
import { exigirPermiso, exigirUsuario, type Actor } from '../domain/permisos'
import type { CodigoVerificacion, PropositoCodigo, Repositorios, UnidadDeTrabajo, Usuario } from '../ports/repositorios'
import type { Criptografia, EmisorTokens, HasherClaves, Logger, ProveedorIdentidad, Reloj, ServicioCorreo, VerificadorClavesFiltradas } from '../ports/servicios'
import { auditar, enviarEnSegundoPlano, rutaSegura, usuarioDTO, type ContextoSolicitud } from './comun'
import {
  correoClaveCambiada,
  correoCodigoRecuperacion,
  correoCodigoRegistro,
  correoCuentaExistente,
  correoInvitacion,
} from './correos'

// --- Políticas -------------------------------------------------------------------------------

export const POLITICA = {
  codigo: { minutos: 10, maxIntentos: 5, esperaReenvioSeg: 60, maxPorHora: 5 },
  login: { maxFallos: 5, minutosBloqueo: 15 },
  minutosAcceso: 15,
  invitacionHoras: 72,
  /** Ventana en la que un refresh token ya usado se considera una carrera entre pestañas y no un robo. */
  graciaReusoMs: 30_000,
}

const HORA = 3_600_000
const DIA = 24 * HORA

/** Vida de la sesión según el rol: los clientes permanecen más tiempo; el personal, menos. */
export function politicaSesion(rol: Rol): { absolutaMs: number; inactividadMs: number } {
  if (rol === 'cliente') return { absolutaMs: 30 * DIA, inactividadMs: 14 * DIA }
  if (rol === 'admin') return { absolutaMs: 7 * DIA, inactividadMs: 12 * HORA }
  return { absolutaMs: 7 * DIA, inactividadMs: 24 * HORA }
}

export interface SesionEmitida {
  acceso: string
  refresco: string
  /** Vence el refresh token (cookie). */
  expiraRefresco: Date
  usuario: UsuarioDTO
}

export interface DepsAuth {
  uow: UnidadDeTrabajo
  reloj: Reloj
  cripto: Criptografia
  hasher: HasherClaves
  filtradas: VerificadorClavesFiltradas
  tokens: EmisorTokens
  correo: ServicioCorreo
  log: Logger
  webOrigin: string
  proveedores: Partial<Record<ProveedorOAuth, ProveedorIdentidad>>
}

const credencialesInvalidas = () => new ErrorDominio('CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos')
const tokenInvalido = () => new ErrorDominio('TOKEN_INVALIDO', 'Tu sesión expiró. Vuelve a iniciar sesión.')
const invitacionInvalida = () => new ErrorDominio('TOKEN_INVALIDO', 'La invitación no es válida, ya se usó o venció. Pide una nueva al administrador.')

export function crearCasosAuth(d: DepsAuth) {
  const { uow, reloj, cripto, hasher, tokens, log } = d
  const url = (ruta: string) => new URL(ruta, d.webOrigin).href
  let hashFicticio: Promise<string> | null = null
  const huellaCodigo = (email: string, codigo: string) => cripto.huella(`${email}:${codigo}`)

  async function validarClave(clave: string, contexto: string[]) {
    if (esClaveComun(clave, contexto)) {
      throw new ErrorDominio('CLAVE_DEBIL', 'Esa contraseña es muy común o fácil de adivinar. Prueba con una frase de varias palabras.', { campo: 'clave' })
    }
    if (await d.filtradas.estaFiltrada(clave)) {
      throw new ErrorDominio('CLAVE_DEBIL', 'Esa contraseña aparece en filtraciones de datos conocidas. Elige otra.', { campo: 'clave' })
    }
  }

  /** Límite de envíos de códigos por correo: espera entre envíos y máximo por hora. */
  async function controlarEnvios(email: string, proposito: PropositoCodigo, ahora: Date) {
    const ultimo = await uow.repos.codigos.ultimo(email, proposito)
    if (ultimo) {
      const faltan = Math.ceil((ultimo.creadoEn.getTime() + POLITICA.codigo.esperaReenvioSeg * 1000 - ahora.getTime()) / 1000)
      if (faltan > 0) throw new ErrorDominio('ESPERA_REENVIO', `Espera ${faltan} segundos para pedir otro código`, { segundos: faltan })
    }
    const enHora = await uow.repos.codigos.contarDesde(email, proposito, new Date(ahora.getTime() - HORA))
    if (enHora >= POLITICA.codigo.maxPorHora) {
      throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Pediste demasiados códigos. Inténtalo de nuevo en una hora.')
    }
  }

  /** Verifica un código (fuera de transacción para que los intentos fallidos queden contados). */
  async function verificarCodigo(email: string, proposito: PropositoCodigo, codigo: string, ahora: Date): Promise<CodigoVerificacion> {
    const fila = await uow.repos.codigos.vigente(email, proposito, ahora)
    if (!fila) throw new ErrorDominio('CODIGO_EXPIRADO', 'El código venció o no existe. Pide uno nuevo.')
    if (fila.intentos >= POLITICA.codigo.maxIntentos) {
      await uow.repos.codigos.invalidar(email, proposito, ahora)
      throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Demasiados intentos con este código. Pide uno nuevo.')
    }
    if (!cripto.compararSeguro(fila.codigoHash, huellaCodigo(email, codigo))) {
      const intentos = await uow.repos.codigos.sumarIntento(fila.id)
      const quedan = POLITICA.codigo.maxIntentos - intentos
      if (quedan <= 0) {
        await uow.repos.codigos.invalidar(email, proposito, ahora)
        throw new ErrorDominio('DEMASIADOS_INTENTOS', 'Demasiados intentos con este código. Pide uno nuevo.')
      }
      throw new ErrorDominio('CODIGO_INVALIDO', `Código incorrecto. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.`, { quedan })
    }
    return fila
  }

  async function emitirSesion(repos: Repositorios, u: Usuario, ctx: ContextoSolicitud): Promise<SesionEmitida> {
    const ahora = reloj.ahora()
    const pol = politicaSesion(u.rol)
    const sesion = await repos.sesiones.crear({
      usuarioId: u.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      expiraEn: new Date(ahora.getTime() + pol.absolutaMs),
    })
    const refresco = cripto.tokenAleatorio(32)
    const expiraRefresco = new Date(Math.min(ahora.getTime() + pol.inactividadMs, sesion.expiraEn.getTime()))
    await repos.sesiones.guardarRefresco({ sesionId: sesion.id, tokenHash: cripto.huella(refresco), expiraEn: expiraRefresco })
    const acceso = await tokens.firmarAcceso({ sub: u.id, rol: u.rol, sede: u.sedeId, sid: sesion.id }, POLITICA.minutosAcceso)
    return { acceso, refresco, expiraRefresco, usuario: await usuarioDTO(repos, u) }
  }

  async function invitacionVigente(token: string) {
    if (!token || token.length > 200) throw invitacionInvalida()
    const inv = await uow.repos.invitaciones.porTokenHash(cripto.huella(token))
    if (!inv || inv.aceptadaEn || inv.revocadaEn || inv.expiraEn <= reloj.ahora()) throw invitacionInvalida()
    return inv
  }

  return {
    /** Registro de cliente: la cuenta se crea solo cuando se verifica el código enviado al correo. */
    async registrar(e: { nombre: string; correo: string; clave: string }, ctx: ContextoSolicitud & { vinculo: string }) {
      const ahora = reloj.ahora()
      await validarClave(e.clave, [e.correo, e.nombre])
      await controlarEnvios(e.correo, 'verificar_correo', ahora)
      // Se calcula el hash siempre (también si la cuenta existe) para no delatar nada por el tiempo de respuesta.
      const passwordHash = await hasher.hash(e.clave)
      const existente = await uow.repos.usuarios.porEmail(e.correo)
      const expiraEn = new Date(ahora.getTime() + POLITICA.codigo.minutos * 60_000)
      await uow.repos.codigos.invalidar(e.correo, 'verificar_correo', ahora)
      if (existente) {
        // Se registra el envío (para limitarlo) con un código que nadie conoce.
        await uow.repos.codigos.crear({ email: e.correo, proposito: 'verificar_correo', codigoHash: cripto.huella(cripto.tokenAleatorio()), creadoEn: ahora, expiraEn })
        enviarEnSegundoPlano(d.correo, log, correoCuentaExistente(e.correo, url('/ingresar'), url('/recuperar')))
        return
      }
      const codigo = cripto.codigoNumerico(6)
      await uow.repos.codigos.crear({
        email: e.correo,
        proposito: 'verificar_correo',
        codigoHash: huellaCodigo(e.correo, codigo),
        creadoEn: ahora,
        expiraEn,
        datosPendientes: { nombre: e.nombre, passwordHash, aceptoPrivacidadEn: ahora.toISOString() },
        vinculoHash: cripto.huella(ctx.vinculo),
      })
      enviarEnSegundoPlano(d.correo, log, correoCodigoRegistro(e.correo, e.nombre, codigo, POLITICA.codigo.minutos))
    },

    /** Reenvía el código de un registro pendiente iniciado en este mismo navegador. */
    async reenviarCodigo(e: { correo: string }, ctx: { vinculo: string | null }) {
      const ahora = reloj.ahora()
      const ultimo = await uow.repos.codigos.ultimo(e.correo, 'verificar_correo')
      const propio =
        ultimo?.datosPendientes && ultimo.vinculoHash && ctx.vinculo && cripto.compararSeguro(ultimo.vinculoHash, cripto.huella(ctx.vinculo)) && ahora.getTime() - ultimo.creadoEn.getTime() < DIA
      await controlarEnvios(e.correo, 'verificar_correo', ahora)
      if (!propio || !ultimo?.datosPendientes) return // respuesta genérica
      if (await uow.repos.usuarios.porEmail(e.correo)) return
      const codigo = cripto.codigoNumerico(6)
      await uow.repos.codigos.invalidar(e.correo, 'verificar_correo', ahora)
      await uow.repos.codigos.crear({
        email: e.correo,
        proposito: 'verificar_correo',
        codigoHash: huellaCodigo(e.correo, codigo),
        creadoEn: ahora,
        expiraEn: new Date(ahora.getTime() + POLITICA.codigo.minutos * 60_000),
        datosPendientes: ultimo.datosPendientes,
        vinculoHash: ultimo.vinculoHash,
      })
      enviarEnSegundoPlano(d.correo, log, correoCodigoRegistro(e.correo, ultimo.datosPendientes.nombre, codigo, POLITICA.codigo.minutos))
    },

    async verificarCorreo(e: { correo: string; codigo: string }, ctx: ContextoSolicitud & { vinculo: string | null }): Promise<SesionEmitida> {
      const ahora = reloj.ahora()
      const fila = await verificarCodigo(e.correo, 'verificar_correo', e.codigo, ahora)
      const pendiente = fila.datosPendientes
      if (!pendiente) throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto.')
      if (!fila.vinculoHash || !ctx.vinculo || !cripto.compararSeguro(fila.vinculoHash, cripto.huella(ctx.vinculo))) {
        throw new ErrorDominio('CODIGO_INVALIDO', 'Este código se pidió desde otro dispositivo o navegador. Ábrelo donde te registraste, o regístrate de nuevo aquí.')
      }
      return uow.transaccion(async (repos) => {
        if (!(await repos.codigos.consumir(fila.id, ahora))) throw new ErrorDominio('CODIGO_EXPIRADO', 'Ese código ya se usó. Pide uno nuevo.')
        if (await repos.usuarios.porEmail(e.correo)) throw err.conflicto('Ya tienes una cuenta con este correo: inicia sesión.')
        const u = await repos.usuarios.crear({
          email: e.correo,
          nombre: pendiente.nombre,
          rol: 'cliente',
          passwordHash: pendiente.passwordHash,
          emailVerificadoEn: ahora,
          aceptoPrivacidadEn: new Date(pendiente.aceptoPrivacidadEn),
          versionPrivacidad: VERSION_PRIVACIDAD,
        })
        await repos.usuarios.actualizar(u.id, { ultimoIngresoEn: ahora })
        return emitirSesion(repos, u, ctx)
      })
    },

    async ingresar(e: { correo: string; clave: string }, ctx: ContextoSolicitud): Promise<SesionEmitida> {
      const ahora = reloj.ahora()
      const u = await uow.repos.usuarios.porEmail(e.correo)
      if (!u || !u.passwordHash) {
        hashFicticio ??= hasher.hash(cripto.tokenAleatorio(16))
        await hasher.verificar(e.clave, await hashFicticio) // mismo tiempo de respuesta exista o no la cuenta
        throw credencialesInvalidas()
      }
      if (u.bloqueadoHasta && u.bloqueadoHasta > ahora) {
        const minutos = Math.ceil((u.bloqueadoHasta.getTime() - ahora.getTime()) / 60_000)
        throw new ErrorDominio('CUENTA_BLOQUEADA', `Por seguridad bloqueamos el acceso durante ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} tras varios intentos fallidos. También puedes recuperar tu contraseña.`, { minutos })
      }
      if (!(await hasher.verificar(e.clave, u.passwordHash))) {
        const fallos = await uow.repos.usuarios.sumarIntentoFallido(u.id)
        if (fallos >= POLITICA.login.maxFallos) {
          await uow.repos.usuarios.actualizar(u.id, { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + POLITICA.login.minutosBloqueo * 60_000) })
          log.warn({ usuarioId: u.id }, 'Cuenta bloqueada temporalmente por intentos fallidos')
          await auditar(uow.repos, { tipo: 'sistema' }, 'seguridad.bloqueo_temporal', 'usuario', u.id, { fallos }, ctx.ip)
        }
        throw credencialesInvalidas()
      }
      if (!u.activo) throw new ErrorDominio('CUENTA_INACTIVA', 'Tu cuenta está desactivada. Habla con el administrador.')
      await uow.repos.usuarios.actualizar(u.id, { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngresoEn: ahora })
      return emitirSesion(uow.repos, u, ctx)
    },

    /** Rota el refresh token. Si un token ya usado vuelve a aparecer (fuera de la ventana de gracia), se revoca la sesión. */
    async refrescar(refresco: string | undefined): Promise<Omit<SesionEmitida, 'usuario'>> {
      if (!refresco || refresco.length > 200) throw tokenInvalido()
      const ahora = reloj.ahora()
      const repos = uow.repos
      const t = await repos.sesiones.refrescoPorHash(cripto.huella(refresco))
      if (!t) throw tokenInvalido()
      const sesion = await repos.sesiones.porId(t.sesionId)
      if (!sesion || sesion.revocadaEn || sesion.expiraEn <= ahora) throw tokenInvalido()
      if (t.usadoEn) {
        if (ahora.getTime() - t.usadoEn.getTime() > POLITICA.graciaReusoMs) {
          await repos.sesiones.revocar(sesion.id, 'reuso_refresh', ahora)
          log.warn({ sesionId: sesion.id }, 'Reuso de refresh token detectado: sesión revocada')
          await auditar(repos, { tipo: 'sistema' }, 'seguridad.reuso_refresh', 'sesion', sesion.id, { usuarioId: sesion.usuarioId })
        }
        throw tokenInvalido()
      }
      if (t.expiraEn <= ahora) throw tokenInvalido()
      if (!(await repos.sesiones.usarRefresco(t.id, ahora))) throw tokenInvalido()
      const u = await repos.usuarios.porId(sesion.usuarioId)
      if (!u || !u.activo) {
        await repos.sesiones.revocar(sesion.id, 'usuario_inactivo', ahora)
        throw tokenInvalido()
      }
      const pol = politicaSesion(u.rol)
      const nuevo = cripto.tokenAleatorio(32)
      const expiraRefresco = new Date(Math.min(ahora.getTime() + pol.inactividadMs, sesion.expiraEn.getTime()))
      await repos.sesiones.guardarRefresco({ sesionId: sesion.id, tokenHash: cripto.huella(nuevo), expiraEn: expiraRefresco })
      await repos.sesiones.tocar(sesion.id, ahora)
      // El token de acceso nuevo refleja el rol y la sede actuales del usuario.
      const acceso = await tokens.firmarAcceso({ sub: u.id, rol: u.rol, sede: u.sedeId, sid: sesion.id }, POLITICA.minutosAcceso)
      return { acceso, refresco: nuevo, expiraRefresco }
    },

    async salir(actor: Actor, refresco: string | undefined) {
      const ahora = reloj.ahora()
      if (actor.tipo === 'usuario') {
        await uow.repos.sesiones.revocar(actor.sesionId, 'salir', ahora)
        return
      }
      if (refresco) {
        const t = await uow.repos.sesiones.refrescoPorHash(cripto.huella(refresco))
        if (t) await uow.repos.sesiones.revocar(t.sesionId, 'salir', ahora)
      }
    },

    async yo(actor: Actor): Promise<UsuarioDTO> {
      const a = exigirUsuario(actor)
      const u = await uow.repos.usuarios.porId(a.id)
      if (!u || !u.activo) throw err.noAutenticado()
      return usuarioDTO(uow.repos, u)
    },

    async actualizarPerfil(actor: Actor, e: { nombre?: string; telefono?: string | null }): Promise<UsuarioDTO> {
      const a = exigirUsuario(actor)
      const u = await uow.repos.usuarios.actualizar(a.id, {
        ...(e.nombre !== undefined ? { nombre: e.nombre } : {}),
        ...(e.telefono !== undefined ? { telefono: e.telefono } : {}),
      })
      return usuarioDTO(uow.repos, u)
    },

    /** Cambia la contraseña y cierra todas las demás sesiones. */
    async cambiarClave(actor: Actor, e: { claveActual: string; claveNueva: string }) {
      const a = exigirUsuario(actor)
      const u = await uow.repos.usuarios.porId(a.id)
      if (!u) throw err.noAutenticado()
      if (!u.passwordHash) {
        throw err.validacion('Tu cuenta entra con Google o Apple. Para crear una contraseña usa «¿Olvidaste tu contraseña?».')
      }
      if (!(await hasher.verificar(e.claveActual, u.passwordHash))) {
        await uow.repos.usuarios.sumarIntentoFallido(u.id)
        throw new ErrorDominio('CREDENCIALES_INVALIDAS', 'La contraseña actual no es correcta', { campo: 'claveActual' })
      }
      if (e.claveActual === e.claveNueva) throw err.validacion('La contraseña nueva debe ser distinta de la actual', { campo: 'claveNueva' })
      await validarClave(e.claveNueva, [u.email, u.nombre])
      const ahora = reloj.ahora()
      await uow.transaccion(async (repos) => {
        await repos.usuarios.actualizar(u.id, { passwordHash: await hasher.hash(e.claveNueva), credencialesCambiadasEn: ahora, intentosFallidos: 0 })
        await repos.sesiones.revocarTodas(u.id, 'cambio_clave', ahora, a.sesionId)
      })
      enviarEnSegundoPlano(d.correo, log, correoClaveCambiada(u.email, u.nombre, url('/recuperar')))
    },

    async solicitarRecuperacion(e: { correo: string }) {
      const ahora = reloj.ahora()
      const u = await uow.repos.usuarios.porEmail(e.correo)
      if (!u || !u.activo) return // respuesta genérica: no se revela si la cuenta existe
      await controlarEnvios(e.correo, 'recuperar_clave', ahora)
      const codigo = cripto.codigoNumerico(6)
      await uow.repos.codigos.invalidar(e.correo, 'recuperar_clave', ahora)
      await uow.repos.codigos.crear({
        email: e.correo,
        proposito: 'recuperar_clave',
        codigoHash: huellaCodigo(e.correo, codigo),
        creadoEn: ahora,
        expiraEn: new Date(ahora.getTime() + POLITICA.codigo.minutos * 60_000),
      })
      enviarEnSegundoPlano(d.correo, log, correoCodigoRecuperacion(u.email, u.nombre, codigo, POLITICA.codigo.minutos))
    },

    async restablecerClave(e: { correo: string; codigo: string; claveNueva: string }, ctx: ContextoSolicitud): Promise<SesionEmitida> {
      const ahora = reloj.ahora()
      const fila = await verificarCodigo(e.correo, 'recuperar_clave', e.codigo, ahora)
      const u = await uow.repos.usuarios.porEmail(e.correo)
      if (!u || !u.activo) throw new ErrorDominio('CODIGO_INVALIDO', 'Código incorrecto.')
      await validarClave(e.claveNueva, [u.email, u.nombre])
      const hash = await hasher.hash(e.claveNueva)
      const sesion = await uow.transaccion(async (repos) => {
        if (!(await repos.codigos.consumir(fila.id, ahora))) throw new ErrorDominio('CODIGO_EXPIRADO', 'Ese código ya se usó. Pide uno nuevo.')
        const actualizado = await repos.usuarios.actualizar(u.id, {
          passwordHash: hash,
          credencialesCambiadasEn: ahora,
          emailVerificadoEn: u.emailVerificadoEn ?? ahora,
          intentosFallidos: 0,
          bloqueadoHasta: null,
          ultimoIngresoEn: ahora,
        })
        await repos.sesiones.revocarTodas(u.id, 'restablecer_clave', ahora)
        return emitirSesion(repos, actualizado, ctx)
      })
      enviarEnSegundoPlano(d.correo, log, correoClaveCambiada(u.email, u.nombre, url('/recuperar')))
      return sesion
    },

    // --- OAuth (Google / Apple) -------------------------------------------------------------

    proveedorDisponible(proveedor: ProveedorOAuth): boolean {
      return !!d.proveedores[proveedor]
    },

    async iniciarOAuth(proveedor: ProveedorOAuth, opciones: { invitacion?: string; volver?: string }) {
      const p = d.proveedores[proveedor]
      if (!p) throw new ErrorDominio('SERVICIO_NO_DISPONIBLE', `El inicio de sesión con ${proveedor === 'google' ? 'Google' : 'Apple'} aún no está configurado.`)
      if (opciones.invitacion) await invitacionVigente(opciones.invitacion)
      const state = cripto.tokenAleatorio(24)
      const nonce = cripto.tokenAleatorio(24)
      const verificador = cripto.tokenAleatorio(48)
      const desafio = createHash('sha256').update(verificador).digest('base64url')
      const redirectUri = url(`/api/auth/oauth/${proveedor}/callback`)
      const estado = await tokens.firmarEstadoOAuth(
        { state, nonce, verificador, proveedor, invitacion: opciones.invitacion ?? '', volver: rutaSegura(opciones.volver) },
        600,
      )
      return { url: p.urlAutorizacion({ state, nonce, codeChallenge: desafio, redirectUri }), estado }
    },

    async completarOAuth(
      proveedor: ProveedorOAuth,
      e: { code?: string; state?: string; usuarioApple?: string | null; error?: string },
      estadoFirmado: string | undefined,
      ctx: ContextoSolicitud,
    ): Promise<{ sesion: SesionEmitida; destino: string }> {
      const p = d.proveedores[proveedor]
      if (!p) throw new ErrorDominio('SERVICIO_NO_DISPONIBLE', 'Proveedor no configurado')
      if (e.error) throw new ErrorDominio('NO_AUTENTICADO', 'Cancelaste el inicio de sesión')
      if (!estadoFirmado || !e.code || !e.state) throw new ErrorDominio('TOKEN_INVALIDO', 'La solicitud de inicio de sesión expiró. Inténtalo de nuevo.')
      let estado: Record<string, string>
      try {
        estado = await tokens.verificarEstadoOAuth(estadoFirmado)
      } catch {
        throw new ErrorDominio('TOKEN_INVALIDO', 'La solicitud de inicio de sesión expiró. Inténtalo de nuevo.')
      }
      if (estado.proveedor !== proveedor || !estado.state || !cripto.compararSeguro(estado.state, e.state)) {
        throw new ErrorDominio('TOKEN_INVALIDO', 'La solicitud de inicio de sesión no es válida. Inténtalo de nuevo.')
      }
      const perfil = await p.intercambiar({
        code: e.code,
        codeVerifier: estado.verificador!,
        nonce: estado.nonce!,
        redirectUri: url(`/api/auth/oauth/${proveedor}/callback`),
        usuarioApple: e.usuarioApple ?? null,
      })
      if (!perfil.emailVerificado) throw new ErrorDominio('NO_AUTENTICADO', 'Tu correo no está verificado con ese proveedor.')
      const email = perfil.email.toLowerCase()
      const ahora = reloj.ahora()

      // Aceptar una invitación de empleado con Google/Apple: el correo debe coincidir.
      if (estado.invitacion) {
        const inv = await invitacionVigente(estado.invitacion)
        if (inv.email !== email) throw new ErrorDominio('PROHIBIDO', `Esta invitación es para ${inv.email}. Entra con esa cuenta de ${proveedor === 'google' ? 'Google' : 'Apple'}.`)
        const sesion = await uow.transaccion(async (repos) => {
          if (await repos.usuarios.porEmail(email)) throw err.conflicto('Ya existe una cuenta con ese correo.')
          const u = await repos.usuarios.crear({
            email,
            nombre: perfil.nombre ?? email.split('@')[0]!,
            rol: inv.rol,
            sedeId: inv.rol === 'admin' ? null : inv.sedeId,
            emailVerificadoEn: ahora,
            aceptoPrivacidadEn: ahora,
            versionPrivacidad: VERSION_PRIVACIDAD,
          })
          if (!(await repos.invitaciones.aceptar(inv.id, u.id, ahora))) throw invitacionInvalida()
          await repos.identidades.crear({ usuarioId: u.id, proveedor, sujeto: perfil.sujeto, email })
          await auditar(repos, { tipo: 'usuario', id: u.id, rol: u.rol, sedeId: u.sedeId, sesionId: '' }, 'invitacion.aceptada', 'usuario', u.id, { via: proveedor }, ctx.ip)
          return emitirSesion(repos, u, ctx)
        })
        return { sesion, destino: INICIO_ROL[sesion.usuario.rol] }
      }

      const sesion = await uow.transaccion(async (repos) => {
        const identidad = await repos.identidades.buscar(proveedor, perfil.sujeto)
        let u = identidad ? await repos.usuarios.porId(identidad.usuarioId) : await repos.usuarios.porEmail(email)
        if (!u) {
          // Cuenta nueva de cliente. El aviso de privacidad se muestra junto al botón (aceptación por conducta inequívoca).
          u = await repos.usuarios.crear({
            email,
            nombre: perfil.nombre ?? email.split('@')[0]!,
            rol: 'cliente',
            emailVerificadoEn: ahora,
            aceptoPrivacidadEn: ahora,
            versionPrivacidad: VERSION_PRIVACIDAD,
          })
        }
        if (!u.activo) throw new ErrorDominio('CUENTA_INACTIVA', 'Tu cuenta está desactivada. Habla con el administrador.')
        if (!identidad) await repos.identidades.crear({ usuarioId: u.id, proveedor, sujeto: perfil.sujeto, email })
        u = await repos.usuarios.actualizar(u.id, { ultimoIngresoEn: ahora, emailVerificadoEn: u.emailVerificadoEn ?? ahora, intentosFallidos: 0, bloqueadoHasta: null })
        return emitirSesion(repos, u, ctx)
      })
      return { sesion, destino: estado.volver || INICIO_ROL[sesion.usuario.rol] }
    },

    // --- Invitaciones de empleados -----------------------------------------------------------

    async invitar(actor: Actor, e: { correo: string; rol: RolEmpleado; sedeId: string | null }, ctx: ContextoSolicitud) {
      const admin = exigirPermiso(actor, 'empleados.gestionar')
      const sedeId = e.rol === 'admin' ? null : e.sedeId
      let sedeNombre: string | null = null
      if (sedeId) {
        const sede = await uow.repos.sedes.porId(sedeId)
        if (!sede) throw err.noEncontrado('La sede no existe')
        sedeNombre = sede.nombre
      } else if (e.rol !== 'admin') throw err.validacion('Elige la sede del empleado', { campo: 'sedeId' })
      if (await uow.repos.usuarios.porEmail(e.correo)) throw err.conflicto('Ya existe una cuenta con ese correo. Si es un empleado, cambia su rol desde la lista.')
      const ahora = reloj.ahora()
      const token = cripto.tokenAleatorio(32)
      const inv = await uow.transaccion(async (repos) => {
        await repos.invitaciones.revocarPendientesDe(e.correo, ahora)
        const creada = await repos.invitaciones.crear({
          email: e.correo,
          rol: e.rol,
          sedeId,
          tokenHash: cripto.huella(token),
          invitadoPor: admin.id,
          expiraEn: new Date(ahora.getTime() + POLITICA.invitacionHoras * HORA),
        })
        await auditar(repos, actor, 'invitacion.crear', 'invitacion', creada.id, { email: e.correo, rol: e.rol, sedeId }, ctx.ip)
        return creada
      })
      const quien = (await uow.repos.usuarios.porId(admin.id))?.nombre ?? 'El administrador'
      try {
        // El enlace lleva el token en el fragmento (#): no viaja al servidor ni queda en logs ni en el Referer.
        await d.correo.enviar(correoInvitacion(e.correo, e.rol, sedeNombre, quien, `${url('/invitacion')}#t=${token}`, POLITICA.invitacionHoras))
      } catch (error) {
        log.error({ err: (error as Error).message }, 'No se pudo enviar la invitación')
        throw new ErrorDominio('SERVICIO_NO_DISPONIBLE', 'Creamos la invitación pero no pudimos enviar el correo. Intenta reenviarla en unos minutos.')
      }
      return { id: inv.id, correo: inv.email, rol: inv.rol, sedeId: inv.sedeId, expiraEn: inv.expiraEn.toISOString() }
    },

    async consultarInvitacion(token: string) {
      const inv = await invitacionVigente(token)
      const sede = inv.sedeId ? await uow.repos.sedes.porId(inv.sedeId) : null
      return {
        correo: inv.email,
        rol: inv.rol,
        sedeNombre: sede?.nombre ?? null,
        expiraEn: inv.expiraEn.toISOString(),
        proveedores: (['google', 'apple'] as const).filter((p) => !!d.proveedores[p]),
      }
    },

    async aceptarInvitacion(token: string, e: { nombre: string; telefono?: string; clave: string }, ctx: ContextoSolicitud): Promise<SesionEmitida> {
      const inv = await invitacionVigente(token)
      await validarClave(e.clave, [inv.email, e.nombre])
      const hash = await hasher.hash(e.clave)
      const ahora = reloj.ahora()
      return uow.transaccion(async (repos) => {
        if (await repos.usuarios.porEmail(inv.email)) throw err.conflicto('Ya existe una cuenta con ese correo.')
        const u = await repos.usuarios.crear({
          email: inv.email,
          nombre: e.nombre,
          telefono: e.telefono ?? null,
          rol: inv.rol,
          sedeId: inv.rol === 'admin' ? null : inv.sedeId,
          passwordHash: hash,
          emailVerificadoEn: ahora, // el enlace llegó a ese correo: prueba de propiedad
          aceptoPrivacidadEn: ahora,
          versionPrivacidad: VERSION_PRIVACIDAD,
        })
        if (!(await repos.invitaciones.aceptar(inv.id, u.id, ahora))) throw invitacionInvalida()
        await auditar(repos, { tipo: 'usuario', id: u.id, rol: u.rol, sedeId: u.sedeId, sesionId: '' }, 'invitacion.aceptada', 'usuario', u.id, { via: 'clave' }, ctx.ip)
        return emitirSesion(repos, u, ctx)
      })
    },

    async listarInvitaciones(actor: Actor) {
      exigirPermiso(actor, 'empleados.gestionar')
      const [pendientes, sedes] = await Promise.all([uow.repos.invitaciones.pendientes(reloj.ahora()), uow.repos.sedes.todas(false)])
      const nombreSede = new Map(sedes.map((s) => [s.id, s.nombre]))
      return pendientes.map((i) => ({
        id: i.id,
        correo: i.email,
        rol: i.rol,
        sedeId: i.sedeId,
        sedeNombre: i.sedeId ? (nombreSede.get(i.sedeId) ?? null) : null,
        expiraEn: i.expiraEn.toISOString(),
        creadaEn: i.creadoEn.toISOString(),
      }))
    },

    async revocarInvitacion(actor: Actor, id: string, ctx: ContextoSolicitud) {
      exigirPermiso(actor, 'empleados.gestionar')
      const inv = await uow.repos.invitaciones.porId(id)
      if (!inv) throw err.noEncontrado('La invitación no existe')
      await uow.repos.invitaciones.revocar(id, reloj.ahora())
      await auditar(uow.repos, actor, 'invitacion.revocar', 'invitacion', id, { email: inv.email }, ctx.ip)
    },
  }
}

export type CasosAuth = ReturnType<typeof crearCasosAuth>
