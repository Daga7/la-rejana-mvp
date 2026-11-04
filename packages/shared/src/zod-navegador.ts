import { z } from 'zod'

// En el navegador la CSP prohíbe `eval`: Zod no debe intentar compilar validadores con `new Function`
// (lo prueba al crear cada esquema de objeto y el navegador lo reporta como violación de la CSP).
// Debe evaluarse antes que cualquier esquema: por eso es la primera importación de esquemas.ts
// (y figura en "sideEffects" del package.json para que el empaquetador no la descarte).
if (typeof window !== 'undefined') z.config({ jitless: true })
