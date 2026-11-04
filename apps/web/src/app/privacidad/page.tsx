import { VERSION_PRIVACIDAD } from '@rejana/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = { title: 'Aviso de privacidad' }

// Texto base conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).
// Debe validarlo un abogado antes de salir a producción (ver PENDIENTES.md).

export default function Privacidad() {
  return (
    <main id="contenido" className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <Link href="/" className="btn btn-fantasma btn-sm -ml-3 text-noche-300">
        <ArrowLeft size={16} aria-hidden /> Volver
      </Link>
      <article className="sticker mt-4 p-6 text-tinta sm:p-10 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-extrabold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <p className="acento !mt-0 !text-rosa-600">Ley 1581 de 2012 · Habeas data</p>
        <h1 className="text-3xl font-black uppercase">Aviso de privacidad y tratamiento de datos personales</h1>
        <p className="text-sm text-tinta-soft">Versión {VERSION_PRIVACIDAD}</p>

        <h2>¿Quién es responsable de tus datos?</h2>
        <p>
          La Rejana Callejera (NIT por confirmar), con domicilio en Bogotá D.C., Colombia, es la responsable del tratamiento de los datos
          personales que recoge esta aplicación. Contacto para temas de datos personales: <b>privacidad@larejana.co</b> o WhatsApp 316 358 2301.
        </p>

        <h2>¿Qué datos recogemos?</h2>
        <ul>
          <li>Clientes: nombre, correo (si te registras), celular, dirección y punto de entrega en el mapa, notas del pedido e historial de compras.</li>
          <li>Invitados: solo nombre, celular y dirección de entrega del pedido que hacen.</li>
          <li>Empleados: nombre, correo, celular, rol y sede. La ubicación del domiciliario se usa solo durante un recorrido activo.</li>
          <li>Datos técnicos mínimos para la seguridad de la cuenta (por ejemplo, fecha de la sesión y dirección IP en los registros de seguridad).</li>
        </ul>
        <p>No recogemos datos sensibles ni datos de menores de edad de forma intencional.</p>

        <h2>¿Para qué los usamos?</h2>
        <ul>
          <li>Preparar, entregar y cobrar tus pedidos, y contactarte si hay alguna novedad.</li>
          <li>Mostrarte el estado de tu pedido y la ubicación del domiciliario mientras va en camino.</li>
          <li>Enviarte notificaciones del pedido si las activas.</li>
          <li>Proteger tu cuenta (verificación por correo, prevención de fraude y abuso) y cumplir obligaciones legales.</li>
        </ul>
        <p>No vendemos ni alquilamos tus datos. No te enviaremos publicidad sin una autorización aparte.</p>

        <h2>Ubicación en tiempo real</h2>
        <p>
          La ubicación del domiciliario solo la ve el cliente del pedido y solo mientras el pedido está «en camino». Al terminar el recorrido
          se deja de compartir y se borra la última posición guardada.
        </p>

        <h2>Tus derechos</h2>
        <p>Como titular puedes, de forma gratuita:</p>
        <ul>
          <li>Conocer, actualizar y rectificar tus datos.</li>
          <li>Pedir prueba de la autorización que nos diste.</li>
          <li>Saber cómo hemos usado tus datos.</li>
          <li>Revocar la autorización y pedir que borremos tus datos cuando no exista un deber legal de conservarlos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC).</li>
        </ul>
        <p>
          Escríbenos a <b>privacidad@larejana.co</b>. Respondemos consultas en máximo 10 días hábiles y reclamos en máximo 15 días hábiles, como
          lo indica la ley.
        </p>

        <h2>¿Con quién los compartimos?</h2>
        <p>
          Con proveedores que nos prestan servicios tecnológicos (alojamiento de la aplicación y la base de datos, envío de correos,
          notificaciones y mapas), que actúan como encargados y deben proteger tus datos. Algunos de estos servidores están fuera de
          Colombia; al aceptar este aviso autorizas esa transferencia con las finalidades descritas.
        </p>

        <h2>¿Cómo los protegemos?</h2>
        <p>
          Conexiones cifradas (HTTPS), contraseñas guardadas con algoritmos de una sola vía, acceso restringido por rol y sede, y registro de
          las acciones administrativas. Conservamos los datos mientras tengas una cuenta o mientras sea necesario para la finalidad y las
          obligaciones contables y legales.
        </p>

        <h2>Vigencia</h2>
        <p>Este aviso rige desde el 1 de noviembre de 2026. Si lo cambiamos de forma importante, te lo informaremos en la aplicación.</p>
      </article>
    </main>
  )
}
