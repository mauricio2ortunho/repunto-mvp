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
  RegistroPendiente,
  Rol,
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
  elegirTarjeta,
  estaCompleta,
  estaVencida,
  faltanPara,
  ordenadosPorFecha,
  progresoDe,
  ultimoSelloDe,
  vencimientoDesde,
} from './tarjeta';
export type { TarjetaElegida } from './tarjeta';

export { PREFIJO_BOLIVIA, normalizarTelefono, ultimosCuatro } from './telefono';

export {
  ESTADOS_PARA_EL_CLIENTE,
  estadoParaElCliente,
  ordenarParaElCliente,
} from './tarjeta-del-cliente';
export type { EstadoParaElCliente, SituacionDeTarjeta } from './tarjeta-del-cliente';

export {
  MINUTOS_DE_INACTIVIDAD_DEL_TURNO,
  finPorInactividad,
  revisarCaja,
  revisarCajaParaSellar,
  revisarTablet,
  turnoAgotado,
} from './caja';

export {
  MINUTOS_DEL_TRAMO_DE_PIN,
  PIN_EQUIVOCADOS_PARA_BLOQUEAR,
  decidirApertura,
  finDelTramoDePin,
} from './turno';
export type { DecisionDeApertura, EntradaDeApertura, UsuarioDeCaja } from './turno';

export {
  LARGO_CODIGO_DE_VINCULACION,
  MINUTOS_DE_VINCULACION,
  codigoDeVinculacionDesde,
  decidirVinculacion,
  formatearCodigoDeVinculacion,
  normalizarCodigoDeVinculacion,
} from './vinculacion';
export type {
  DecisionDeVinculacion,
  EntradaDeVinculacion,
  VinculacionPendiente,
} from './vinculacion';
export type { Caja, PromoConfigurada, RevisionDeCaja } from './caja';

export { decidirSello, planDeSellado } from './sellado';
export type {
  DecisionDeSellado,
  EfectoDeSellado,
  EntradaDeSellado,
  EntradaDeTarjeta,
  PlanDeSellado,
  ResultadoDelPlan,
} from './sellado';

export { decidirAlta, decidirDescarte } from './alta';
export type {
  DecisionDeAlta,
  DecisionDeDescarte,
  EfectoDeAlta,
  EntradaDeAlta,
  EntradaDeDescarte,
} from './alta';

export { MINUTOS_PARA_DESHACER, decidirAnulacion } from './anulacion';
export type {
  DecisionDeAnulacion,
  EfectoDeAnulacion,
  EntradaDeAnulacion,
  SelloParaAnular,
} from './anulacion';

export { decidirCanje } from './canje';
export type { DecisionDeCanje, EfectoDeCanje, EntradaDeCanje } from './canje';
