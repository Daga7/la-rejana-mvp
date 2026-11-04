// Lista local de contraseñas demasiado comunes (ASVS 5.0 §6.2.4). Complementa la consulta a
// Have I Been Pwned, que cubre las contraseñas filtradas (§6.2.12) cuando hay conexión.
const COMUNES = new Set(
  [
    '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344', '123123123',
    'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm123', 'iloveyou',
    'abc12345', 'abcd1234', 'a1b2c3d4', 'aa123456', 'welcome1', 'letmein1', 'sunshine', 'princess', 'football', 'baseball',
    'superman', 'starwars', 'trustno1', 'dragon123', 'master123', 'monkey123', 'shadow123', 'michael1', 'jennifer',
    'contraseña', 'contrasena', 'contrasena1', 'contrasena123', 'micontrasena', 'teamo123', 'tequiero', 'colombia',
    'colombia1', 'colombia123', 'bogota123', 'medellin', 'millonarios', 'santafe1', 'nacional', 'americadecali',
    'hamburguesa', 'larejana', 'larejana1', 'larejana123', 'rejana123', 'callejera', 'choriperro', 'restaurante',
    'qwerty12', 'q1w2e3r4', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'administrador', 'admin123', 'admin1234', 'usuario1',
    'usuario123', 'cambiame', 'cambiar123', 'clave123', 'miclave1', 'secreto1', 'holahola', 'hola1234', 'mariposa',
    'estrella', 'corazon1', 'angelito', 'chocolate', 'computador', 'barcelona', 'realmadrid', 'mamapapa', 'familia1',
  ].map((c) => c.toLowerCase()),
)

export function esClaveComun(clave: string, contexto: string[] = []): boolean {
  const c = clave.toLowerCase()
  if (COMUNES.has(c)) return true
  if (/^(.)\1+$/.test(c)) return true // aaaaaaaa
  // No permitir la clave igual al correo, al nombre o a partes obvias de ellos.
  return contexto.some((t) => {
    const v = t.toLowerCase().trim()
    return v.length >= 4 && (c === v || c === v.split('@')[0])
  })
}
