import { NOMBRE_ROL, type RolEmpleado } from '@rejana/shared'
import type { MensajeCorreo } from '../ports/servicios'

// Plantillas de correo transaccional. Todo dato dinámico se escapa (nunca HTML del usuario).

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function plantilla(titulo: string, cuerpoHtml: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escaparHtml(titulo)}</title></head>
<body style="margin:0;background:#0b0f2b;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#14121f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f2b;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:8px 4px 16px;color:#ffc93c;font-style:italic;font-family:Georgia,serif;font-size:16px">La Rejana Callejera</td></tr>
<tr><td style="background:#fbf4e6;border:2px solid #14121f;border-radius:18px;padding:28px;box-shadow:4px 4px 0 #14121f">
<h1 style="margin:0 0 12px;font-size:22px;font-weight:900;text-transform:uppercase">${escaparHtml(titulo)}</h1>
${cuerpoHtml}
</td></tr>
<tr><td style="padding:16px 4px;color:#a3a8d1;font-size:12px;line-height:1.5">Recibes este correo porque alguien usó esta dirección en la app de La Rejana Callejera. Si no fuiste tú, puedes ignorarlo. Nunca te pediremos tu contraseña ni tus códigos por teléfono o WhatsApp.</td></tr>
</table></td></tr></table></body></html>`
}

const parrafo = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${t}</p>`

function bloqueCodigo(codigo: string): string {
  return `<div style="margin:18px 0;padding:16px;text-align:center;background:#fff;border:2px solid #14121f;border-radius:14px;font-size:34px;font-weight:900;letter-spacing:10px;font-family:Consolas,Menlo,monospace">${escaparHtml(codigo)}</div>`
}

function boton(texto: string, url: string): string {
  return `<p style="margin:22px 0"><a href="${escaparHtml(url)}" style="display:inline-block;background:#e8237d;color:#fff;text-decoration:none;font-weight:800;padding:13px 22px;border:2px solid #14121f;border-radius:999px;box-shadow:2px 2px 0 #14121f">${escaparHtml(texto)}</a></p>`
}

export function correoCodigoRegistro(para: string, nombre: string, codigo: string, minutos: number): MensajeCorreo {
  const n = escaparHtml(nombre.split(' ')[0] ?? nombre)
  return {
    para,
    asunto: `${codigo} es tu código de La Rejana`,
    texto: `Hola ${nombre}:\n\nTu código para activar tu cuenta es ${codigo}. Vence en ${minutos} minutos.\n\nSi no fuiste tú, ignora este correo.`,
    html: plantilla(
      'Activa tu cuenta',
      parrafo(`¡Hola, ${n}! Escribe este código en la app para terminar tu registro:`) + bloqueCodigo(codigo) + parrafo(`Vence en ${minutos} minutos y solo funciona en el dispositivo donde te registraste.`),
    ),
  }
}

export function correoCuentaExistente(para: string, urlIngresar: string, urlRecuperar: string): MensajeCorreo {
  return {
    para,
    asunto: 'Ya tienes una cuenta en La Rejana',
    texto: `Alguien intentó crear una cuenta con este correo, pero ya tienes una.\n\nInicia sesión: ${urlIngresar}\n¿Olvidaste tu contraseña? ${urlRecuperar}`,
    html: plantilla(
      'Ya tienes una cuenta',
      parrafo('Alguien intentó registrarse con este correo, pero ya tienes una cuenta con nosotros.') + boton('Iniciar sesión', urlIngresar) + parrafo(`¿No recuerdas tu contraseña? <a href="${escaparHtml(urlRecuperar)}">Recupérala aquí</a>.`),
    ),
  }
}

export function correoCodigoRecuperacion(para: string, nombre: string, codigo: string, minutos: number): MensajeCorreo {
  return {
    para,
    asunto: `${codigo} es tu código para cambiar la contraseña`,
    texto: `Hola ${nombre}:\n\nTu código para crear una contraseña nueva es ${codigo}. Vence en ${minutos} minutos.\n\nSi no lo pediste, ignora este correo: tu contraseña sigue igual.`,
    html: plantilla(
      'Recupera tu contraseña',
      parrafo(`Hola, ${escaparHtml(nombre)}. Usa este código para crear una contraseña nueva:`) + bloqueCodigo(codigo) + parrafo(`Vence en ${minutos} minutos. Si no lo pediste, ignora este correo: tu contraseña sigue igual.`),
    ),
  }
}

export function correoClaveCambiada(para: string, nombre: string, urlRecuperar: string): MensajeCorreo {
  return {
    para,
    asunto: 'Tu contraseña de La Rejana cambió',
    texto: `Hola ${nombre}:\n\nLa contraseña de tu cuenta acaba de cambiar y cerramos tus otras sesiones. Si no fuiste tú, recupérala de inmediato: ${urlRecuperar}`,
    html: plantilla(
      'Tu contraseña cambió',
      parrafo(`Hola, ${escaparHtml(nombre)}. La contraseña de tu cuenta acaba de cambiar y cerramos las demás sesiones abiertas.`) + parrafo('Si no fuiste tú, recupera el acceso de inmediato:') + boton('Recuperar mi cuenta', urlRecuperar),
    ),
  }
}

/** Invitación del primer administrador (ADMIN_INICIAL_CORREO): la envía la propia API al arrancar. */
export function correoAdminInicial(para: string, url: string, horas: number): MensajeCorreo {
  return {
    para,
    asunto: 'Crea tu acceso de administrador de La Rejana Callejera',
    texto: `La app de La Rejana Callejera ya está funcionando. Crea tu acceso de administrador aquí (vence en ${horas} horas y solo sirve una vez): ${url}\n\nSi no esperabas este correo, ignóralo.`,
    html: plantilla(
      'Tu acceso de administrador',
      parrafo('La app de La Rejana Callejera ya está funcionando. Crea tu acceso de administrador para empezar a configurarla.') +
        boton('Crear mi acceso', url) +
        parrafo(`El enlace vence en ${horas} horas y solo sirve una vez. Si vence, reinicia el servicio de la API y te llegará uno nuevo. Si no esperabas este correo, ignóralo.`),
    ),
  }
}

export function correoInvitacion(para: string, rol: RolEmpleado, sedeNombre: string | null, invitadoPor: string, url: string, horas: number): MensajeCorreo {
  const donde = sedeNombre ? ` en la sede ${sedeNombre}` : ''
  return {
    para,
    asunto: `Te invitaron a La Rejana Callejera como ${NOMBRE_ROL[rol]}`,
    texto: `${invitadoPor} te invitó a unirte al equipo de La Rejana Callejera como ${NOMBRE_ROL[rol]}${donde}.\n\nCrea tu acceso aquí (vence en ${horas} horas y solo sirve una vez): ${url}`,
    html: plantilla(
      '¡Bienvenido al parche!',
      parrafo(`${escaparHtml(invitadoPor)} te invitó a unirte al equipo como <b>${escaparHtml(NOMBRE_ROL[rol])}</b>${escaparHtml(donde)}.`) +
        boton('Crear mi acceso', url) +
        parrafo(`El enlace vence en ${horas} horas, solo sirve una vez y solo para este correo. Puedes crear una contraseña o entrar con Google o Apple usando este mismo correo.`),
    ),
  }
}
