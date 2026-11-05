// Punto de entrada del paquete: lo importan los route handlers de Next.js (apps/web).
export { crearApp, type AppLista } from './app'
export { cargarEnv, type Env } from './config/env'
export { crearContenedor, type Contenedor, type Sobrescrituras } from './contenedor'
export { tareasDeArranque } from './arranque'
export type { Peticion, Respuesta, Router } from './adapters/http/router'
