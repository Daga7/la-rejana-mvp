import type { Repositorios, UnidadDeTrabajo } from '../../../ports/repositorios'
import type { BaseDatos, Ejecutor } from '../cliente'
import { repoCodigos, repoDirecciones, repoIdentidades, repoInvitaciones, repoSesiones, repoUsuarios } from './acceso'
import { repoCatalogo, repoInventario, repoSedes } from './catalogo'
import { repoAuditoria, repoBuzon, repoReportes, repoWhatsapp } from './gobierno'
import { repoMesas } from './mesas'
import { repoPedidos, repoRecorridos, repoSuscripciones } from './pedidos'

export function crearRepositorios(db: Ejecutor): Repositorios {
  return {
    usuarios: repoUsuarios(db),
    identidades: repoIdentidades(db),
    sesiones: repoSesiones(db),
    codigos: repoCodigos(db),
    invitaciones: repoInvitaciones(db),
    direcciones: repoDirecciones(db),
    sedes: repoSedes(db),
    catalogo: repoCatalogo(db),
    inventario: repoInventario(db),
    pedidos: repoPedidos(db),
    mesas: repoMesas(db),
    recorridos: repoRecorridos(db),
    suscripciones: repoSuscripciones(db),
    buzon: repoBuzon(db),
    auditoria: repoAuditoria(db),
    whatsapp: repoWhatsapp(db),
    reportes: repoReportes(db),
  }
}

export function unidadDeTrabajoPostgres(db: BaseDatos): UnidadDeTrabajo {
  return {
    repos: crearRepositorios(db),
    transaccion: (fn) => db.transaction((tx) => fn(crearRepositorios(tx))),
  }
}
