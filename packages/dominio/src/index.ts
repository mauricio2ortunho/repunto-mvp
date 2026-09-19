/**
 * Logica de negocio pura de Repunto. Sin HTTP, sin Prisma, sin reloj del
 * sistema: recibe datos planos y el instante por parametro, y devuelve
 * decisiones. `apps/api` ejecuta esas decisiones dentro de su transaccion.
 */

export type {
  Asignacion,
  Cliente,
  Condicion,
  Dispositivo,
  Local,
  Negocio,
  Programa,
  Sello,
  Tarjeta,
  TarjetaEnCurso,
  Turno,
} from './tipos';

export { CODIGOS_DE_ERROR, rechazo } from './errores';
export type { CodigoDeError, DetalleDeRechazo, Rechazo } from './errores';

export {
  ZONA_HORARIA,
  DESFASE_LA_PAZ_MINUTOS,
  diaEnLaPaz,
  diasDelMes,
  finDelDia,
  finDelDiaEnLaPaz,
  sumarMesesCalendario,
} from './tiempo';
export type { DiaEnLaPaz } from './tiempo';

export {
  ALFABETO_CODIGO_PUBLICO,
  DIGITOS_TOTP,
  LARGO_CODIGO_PUBLICO,
  VENTANA_SEGUNDOS,
  codigoDeVentana,
  codigoPublicoDesde,
  esCodigoPublicoValido,
  partirCodigoTipeado,
  revisarCodigo,
  ventanaDe,
  ventanasAceptadas,
  verificarCodigo,
} from './codigo';
export type { CodigoTipeado, RevisionDeCodigo, VerificacionDeCodigo } from './codigo';

export {
  estaCompleta,
  estaVencida,
  faltanPara,
  ordenadosPorFecha,
  progresoDe,
  ultimoSelloDe,
  vencimientoDesde,
} from './tarjeta';

export { revisarCaja } from './caja';
export type { Caja, RevisionDeCaja } from './caja';

export { decidirSello } from './sellado';
export type { DecisionDeSellado, EfectoDeSellado, EntradaDeSellado } from './sellado';

export { decidirCanje } from './canje';
export type { DecisionDeCanje, EfectoDeCanje, EntradaDeCanje } from './canje';
