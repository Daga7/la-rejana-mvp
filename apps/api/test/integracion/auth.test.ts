import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { codigoDe, idsSeed, levantar, Navegador, ORIGEN_WEB, type Entorno } from '../ayudas'

let e: Entorno
beforeAll(async () => {
  e = await levantar()
})
afterAll(async () => {
  await e.cerrar()
})
beforeEach(() => {
  e.correos.length = 0
})

const MINUTO = 60_000
const nueva = () => new Navegador(e.app)
const correoUnico = () => `persona.${Math.random().toString(36).slice(2, 8)}@ejemplo.co`
const esperarCorreo = async (para: string) => {
  for (let i = 0; i < 40; i++) {
    const m = e.correos.find((x) => x.para === para)
    if (m) return m
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`No llegó correo a ${para}`)
}

describe('registro con código de 6 dígitos', () => {
  it('crea la cuenta solo al verificar el código y deja la sesión iniciada', async () => {
    const nav = nueva()
    const correo = correoUnico()
    const r = await nav.post('/api/auth/registro', { nombre: 'Ana Prueba', correo, clave: 'mi parche favorito', aceptaPrivacidad: true })
    expect(r.statusCode).toBe(202)
    expect(await e.c.uow.repos.usuarios.porEmail(correo)).toBeNull() // todavía no existe
    const codigo = codigoDe(await esperarCorreo(correo))

    const v = await nav.post('/api/auth/verificar-correo', { correo, codigo })
    expect(v.statusCode).toBe(200)
    expect(v.json().usuario).toMatchObject({ correo, rol: 'cliente', correoVerificado: true })
    const yo = await nav.get('/api/auth/yo')
    expect(yo.json().usuario.correo).toBe(correo)
    const u = await e.c.uow.repos.usuarios.porEmail(correo)
    expect(u?.aceptoPrivacidadEn).not.toBeNull()
    expect(u?.passwordHash).toMatch(/^\$2[aby]\$/)
  })

  it('exige aceptar el aviso de privacidad', async () => {
    const r = await nueva().post('/api/auth/registro', { nombre: 'Ana', correo: correoUnico(), clave: 'mi parche favorito', aceptaPrivacidad: false })
    expect(r.statusCode).toBe(400)
  })

  it('no revela si el correo ya tiene cuenta (misma respuesta, correo de aviso)', async () => {
    const r = await nueva().post('/api/auth/registro', { nombre: 'Otro', correo: 'cliente@larejana.test', clave: 'otra clave segura 123', aceptaPrivacidad: true })
    expect(r.statusCode).toBe(202)
    const m = await esperarCorreo('cliente@larejana.test')
    expect(m.asunto).toMatch(/Ya tienes una cuenta/)
    expect(m.texto).not.toMatch(/\b\d{6}\b/)
  })

  it('el código vence a los 10 minutos', async () => {
    const nav = nueva()
    const correo = correoUnico()
    await nav.post('/api/auth/registro', { nombre: 'Ana', correo, clave: 'mi parche favorito', aceptaPrivacidad: true })
    const codigo = codigoDe(await esperarCorreo(correo))
    e.reloj.avanzar(11 * MINUTO)
    const v = await nav.post('/api/auth/verificar-correo', { correo, codigo })
    expect(v.statusCode).toBe(422)
    expect(v.json().error.codigo).toBe('CODIGO_EXPIRADO')
  })

  it('máximo 5 intentos: luego ni el código correcto sirve', async () => {
    const nav = nueva()
    const correo = correoUnico()
    await nav.post('/api/auth/registro', { nombre: 'Ana', correo, clave: 'mi parche favorito', aceptaPrivacidad: true })
    const codigo = codigoDe(await esperarCorreo(correo))
    const malo = codigo === '000000' ? '111111' : '000000'
    for (let i = 1; i <= 4; i++) {
      const r = await nav.post('/api/auth/verificar-correo', { correo, codigo: malo })
      expect(r.json().error.codigo).toBe('CODIGO_INVALIDO')
      expect(r.json().error.detalles.quedan).toBe(5 - i)
    }
    expect((await nav.post('/api/auth/verificar-correo', { correo, codigo: malo })).json().error.codigo).toBe('DEMASIADOS_INTENTOS')
    expect((await nav.post('/api/auth/verificar-correo', { correo, codigo })).json().error.codigo).toBe('CODIGO_EXPIRADO')
  })

  it('limita el reenvío: espera de 60 s y máximo 5 por hora', async () => {
    const nav = nueva()
    const correo = correoUnico()
    await nav.post('/api/auth/registro', { nombre: 'Ana', correo, clave: 'mi parche favorito', aceptaPrivacidad: true })
    const pronto = await nav.post('/api/auth/reenviar-codigo', { correo })
    expect(pronto.statusCode).toBe(429)
    expect(pronto.json().error.codigo).toBe('ESPERA_REENVIO')
    for (let i = 0; i < 4; i++) {
      e.reloj.avanzar(61_000)
      expect((await nav.post('/api/auth/reenviar-codigo', { correo })).statusCode).toBe(202)
    }
    e.reloj.avanzar(61_000)
    const sexto = await nav.post('/api/auth/reenviar-codigo', { correo })
    expect(sexto.json().error.codigo).toBe('DEMASIADOS_INTENTOS')
  })

  it('el código solo funciona en el navegador que hizo el registro', async () => {
    const correo = correoUnico()
    await nueva().post('/api/auth/registro', { nombre: 'Víctima', correo, clave: 'mi parche favorito', aceptaPrivacidad: true })
    const codigo = codigoDe(await esperarCorreo(correo))
    const otro = await nueva().post('/api/auth/verificar-correo', { correo, codigo })
    expect(otro.statusCode).toBe(422)
    expect(await e.c.uow.repos.usuarios.porEmail(correo)).toBeNull()
  })

  it('rechaza contraseñas comunes, filtradas o iguales al correo', async () => {
    const nav = nueva()
    for (const clave of ['contrasena123', 'Filtrada.2026!']) {
      const r = await nav.post('/api/auth/registro', { nombre: 'Ana', correo: correoUnico(), clave, aceptaPrivacidad: true })
      expect(r.json().error.codigo).toBe('CLAVE_DEBIL')
    }
    const correo = correoUnico()
    const igual = await nav.post('/api/auth/registro', { nombre: 'Ana', correo, clave: correo, aceptaPrivacidad: true })
    expect(igual.json().error.codigo).toBe('CLAVE_DEBIL')
    expect((await nav.post('/api/auth/registro', { nombre: 'Ana', correo: correoUnico(), clave: 'corta', aceptaPrivacidad: true })).statusCode).toBe(400)
  })
})

describe('inicio de sesión y bloqueo', () => {
  it('credenciales incorrectas dan el mismo error exista o no la cuenta', async () => {
    const a = await nueva().post('/api/auth/ingresar', { correo: 'no-existe@larejana.test', clave: 'loquesea123' })
    const b = await nueva().post('/api/auth/ingresar', { correo: 'cliente@larejana.test', clave: 'loquesea123' })
    expect(a.statusCode).toBe(401)
    expect(b.statusCode).toBe(401)
    expect(a.json()).toEqual(b.json())
  })

  it('bloquea 15 minutos tras 5 intentos fallidos y luego permite entrar', async () => {
    const nav = nueva()
    for (let i = 0; i < 5; i++) await nav.post('/api/auth/ingresar', { correo: 'mesero.villaluz@larejana.test', clave: 'equivocada-1234' })
    const bloqueada = await nav.post('/api/auth/ingresar', { correo: 'mesero.villaluz@larejana.test', clave: 'Rejana2026*' })
    expect(bloqueada.statusCode).toBe(423)
    expect(bloqueada.json().error.codigo).toBe('CUENTA_BLOQUEADA')
    e.reloj.avanzar(16 * MINUTO)
    expect((await nav.post('/api/auth/ingresar', { correo: 'mesero.villaluz@larejana.test', clave: 'Rejana2026*' })).statusCode).toBe(200)
  })

  it('las cookies de sesión son httpOnly y SameSite=Strict', async () => {
    const r = await nueva().post('/api/auth/ingresar', { correo: 'cliente@larejana.test', clave: 'Rejana2026*' })
    const cookies = ([] as string[]).concat(r.headers['set-cookie'] as string[])
    const acceso = cookies.find((c) => c.startsWith('rj_at='))!
    const refresco = cookies.find((c) => c.startsWith('rj_rt='))!
    for (const c of [acceso, refresco]) {
      expect(c).toMatch(/HttpOnly/i)
      expect(c).toMatch(/SameSite=Strict/i)
    }
    expect(acceso).toMatch(/Max-Age=900/)
  })
})

describe('sesión: refresh rotativo, reuso y revocación', () => {
  it('rota el refresh token y revoca la sesión si se reutiliza uno viejo', async () => {
    const nav = nueva()
    await nav.ingresar('cliente@larejana.test')
    const viejo = nav.cookies.get('rj_rt')!
    expect((await nav.post('/api/auth/refrescar')).statusCode).toBe(204)
    expect(nav.cookies.get('rj_rt')).not.toBe(viejo)
    expect((await nav.get('/api/auth/yo')).statusCode).toBe(200)

    // Un atacante reutiliza el token viejo pasada la ventana de gracia: se revoca la sesión entera.
    e.reloj.avanzar(MINUTO)
    const atacante = nueva()
    atacante.cookies.set('rj_rt', viejo)
    expect((await atacante.post('/api/auth/refrescar')).statusCode).toBe(401)
    expect((await nav.get('/api/auth/yo')).statusCode).toBe(401)
  })

  it('cerrar sesión invalida el token de acceso aunque no haya vencido', async () => {
    const nav = nueva()
    await nav.ingresar('cliente@larejana.test')
    const acceso = nav.cookies.get('rj_at')!
    expect((await nav.post('/api/auth/salir')).statusCode).toBe(204)
    const robado = nueva()
    robado.cookies.set('rj_at', acceso)
    expect((await robado.get('/api/auth/yo')).statusCode).toBe(401)
  })

  it('cambiar la contraseña cierra las otras sesiones y mantiene la actual', async () => {
    const correo = 'domi2.villaluz@larejana.test'
    const pc = nueva()
    const cel = nueva()
    await pc.ingresar(correo)
    await cel.ingresar(correo)
    const r = await pc.post('/api/auth/cambiar-clave', { claveActual: 'Rejana2026*', claveNueva: 'una clave nueva bien larga' })
    expect(r.statusCode).toBe(204)
    expect((await pc.get('/api/auth/yo')).statusCode).toBe(200)
    expect((await cel.get('/api/auth/yo')).statusCode).toBe(401)
    expect((await esperarCorreo(correo)).asunto).toMatch(/contraseña.*cambió/)
    expect((await nueva().post('/api/auth/ingresar', { correo, clave: 'una clave nueva bien larga' })).statusCode).toBe(200)
  })

  it('recuperar la contraseña con código revoca todas las sesiones', async () => {
    const correo = 'caja.normandia@larejana.test'
    const vieja = nueva()
    await vieja.ingresar(correo)
    const nav = nueva()
    expect((await nav.post('/api/auth/recuperar-clave', { correo })).statusCode).toBe(202)
    const codigo = codigoDe(await esperarCorreo(correo))
    const r = await nav.post('/api/auth/restablecer-clave', { correo, codigo, claveNueva: 'recupere mi acceso 2026' })
    expect(r.statusCode).toBe(200)
    expect((await vieja.get('/api/auth/yo')).statusCode).toBe(401)
    expect((await nav.get('/api/auth/yo')).statusCode).toBe(200)
  })

  it('recuperar con un correo inexistente responde igual y no envía nada', async () => {
    const r = await nueva().post('/api/auth/recuperar-clave', { correo: 'nadie@ejemplo.co' })
    expect(r.statusCode).toBe(202)
    await new Promise((res) => setTimeout(res, 50))
    expect(e.correos).toHaveLength(0)
  })
})

describe('CSRF y origen', () => {
  it('rechaza peticiones que cambian estado sin token CSRF', async () => {
    const r = await e.app.inject({ method: 'POST', url: '/api/auth/ingresar', payload: { correo: 'cliente@larejana.test', clave: 'Rejana2026*' }, headers: { origin: ORIGEN_WEB } })
    expect(r.statusCode).toBe(403)
    expect(r.json().error.codigo).toBe('CSRF')
  })

  it('rechaza orígenes ajenos aunque traigan token', async () => {
    const nav = nueva()
    const r = await nav.post('/api/auth/ingresar', { correo: 'cliente@larejana.test', clave: 'Rejana2026*' }, { origin: 'https://sitio-malicioso.example' })
    expect(r.statusCode).toBe(403)
  })
})

describe('invitaciones de empleados', () => {
  it('el admin invita; solo el enlace del correo permite crear el acceso y solo una vez', async () => {
    const { villaluz } = await idsSeed(e.c)
    const admin = nueva()
    await admin.ingresar('admin@larejana.test')
    const correo = correoUnico()
    const r = await admin.post('/api/admin/invitaciones', { correo, rol: 'cocina', sedeId: villaluz })
    expect(r.statusCode).toBe(201)
    const m = await esperarCorreo(correo)
    const token = /#t=([\w-]+)/.exec(m.texto)![1]!

    const empleado = nueva()
    const info = await empleado.post('/api/invitaciones/consultar', { token })
    expect(info.json().invitacion).toMatchObject({ correo, rol: 'cocina', sedeNombre: 'Villaluz' })
    const ok = await empleado.post('/api/invitaciones/aceptar', { token, nombre: 'Nuevo Cocinero', clave: 'cocino con amor 2026', aceptaPrivacidad: true })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().usuario).toMatchObject({ rol: 'cocina', sedeId: villaluz })
    const repetida = await nueva().post('/api/invitaciones/aceptar', { token, nombre: 'Intruso', clave: 'otra clave larga 2026', aceptaPrivacidad: true })
    expect(repetida.statusCode).toBe(401)
  })

  it('la invitación vence a las 72 horas', async () => {
    const { normandia } = await idsSeed(e.c)
    const admin = nueva()
    await admin.ingresar('admin@larejana.test')
    const correo = correoUnico()
    await admin.post('/api/admin/invitaciones', { correo, rol: 'caja', sedeId: normandia })
    const token = /#t=([\w-]+)/.exec((await esperarCorreo(correo)).texto)![1]!
    e.reloj.avanzar(73 * 60 * MINUTO)
    expect((await nueva().post('/api/invitaciones/consultar', { token })).statusCode).toBe(401)
  })

  it('solo el admin puede invitar', async () => {
    const { villaluz } = await idsSeed(e.c)
    const caja = nueva()
    await caja.ingresar('caja.villaluz@larejana.test')
    const r = await caja.post('/api/admin/invitaciones', { correo: correoUnico(), rol: 'cocina', sedeId: villaluz })
    expect(r.statusCode).toBe(403)
    expect((await nueva().post('/api/admin/invitaciones', { correo: correoUnico(), rol: 'cocina', sedeId: villaluz })).statusCode).toBe(401)
  })

  it('con Google, la invitación solo se acepta con el mismo correo', async () => {
    const { villaluz } = await idsSeed(e.c)
    const admin = nueva()
    await admin.ingresar('admin@larejana.test')
    const correo = correoUnico()
    await admin.post('/api/admin/invitaciones', { correo, rol: 'domiciliario', sedeId: villaluz })
    const token = /#t=([\w-]+)/.exec((await esperarCorreo(correo)).texto)![1]!

    const flujo = async (emailGoogle: string) => {
      const nav = nueva()
      const inicio = await nav.get(`/api/auth/oauth/google?invitacion=${token}`)
      expect(inicio.statusCode).toBe(302)
      const autorizar = new URL(inicio.headers.location as string)
      const p = autorizar.searchParams
      const aprobar = await nav.get(`/api/auth/oauth/simulado/aprobar?${new URLSearchParams({ proveedor: 'google', state: p.get('state')!, nonce: p.get('nonce')!, redirect_uri: p.get('redirect_uri')!, email: emailGoogle, nombre: 'Domi Google' })}`)
      const vuelta = new URL(aprobar.headers.location as string)
      const fin = await nav.get(`${vuelta.pathname}${vuelta.search}`)
      return { nav, destino: fin.headers.location as string }
    }
    const ajeno = await flujo('otra.persona@gmail.com')
    expect(ajeno.destino).toContain('/ingresar?error=PROHIBIDO')
    const propio = await flujo(correo)
    expect(propio.destino).toBe(`${ORIGEN_WEB}/domiciliario`)
    expect((await propio.nav.get('/api/auth/yo')).json().usuario).toMatchObject({ rol: 'domiciliario', proveedores: ['google'] })
  })
})

describe('OAuth (proveedor simulado)', () => {
  it('rechaza un callback con state manipulado', async () => {
    const nav = nueva()
    await nav.get('/api/auth/oauth/google')
    const r = await nav.get('/api/auth/oauth/google/callback?code=abc&state=manipulado')
    expect(r.headers.location).toContain('/ingresar?error=TOKEN_INVALIDO')
  })

  it('crea una cuenta de cliente nueva con Google', async () => {
    const nav = nueva()
    const inicio = await nav.get('/api/auth/oauth/google?volver=/carrito')
    const p = new URL(inicio.headers.location as string).searchParams
    const aprobar = await nav.get(`/api/auth/oauth/simulado/aprobar?${new URLSearchParams({ proveedor: 'google', state: p.get('state')!, nonce: p.get('nonce')!, redirect_uri: p.get('redirect_uri')!, email: 'nuevo.google@gmail.com', nombre: 'Nuevo Google' })}`)
    const vuelta = new URL(aprobar.headers.location as string)
    const fin = await nav.get(`${vuelta.pathname}${vuelta.search}`)
    expect(fin.headers.location).toBe(`${ORIGEN_WEB}/carrito`)
    expect((await nav.get('/api/auth/yo')).json().usuario).toMatchObject({ correo: 'nuevo.google@gmail.com', rol: 'cliente', tieneClave: false })
  })
})
