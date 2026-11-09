export { esquemaSalud } from './salud';
export type { Salud } from './salud';

export {
  CODIGOS_DE_ERROR_DE_API,
  CODIGOS_DE_ERROR_DE_CAJA,
  esquemaAnularRespuesta,
  esquemaCanjearPeticion,
  esquemaCanjearRespuesta,
  esquemaConfirmarPeticion,
  esquemaConfirmarRespuesta,
  esquemaDescartarRespuesta,
  esquemaError,
  esquemaEstadoDeCaja,
  esquemaRegistroEnCaja,
  esquemaRegistrosPendientes,
  esquemaSellarPeticion,
  esquemaSellarRespuesta,
  esquemaSelloReciente,
  esquemaSellosRecientes,
  mensajeParaElCajero,
} from './caja';
export type {
  AnularRespuesta,
  CanjearPeticion,
  CanjearRespuesta,
  CodigoDeErrorDeApi,
  CodigoDeErrorDeCaja,
  ConfirmarPeticion,
  ConfirmarRespuesta,
  DescartarRespuesta,
  DetalleDelMensaje,
  ErrorDeLaApi,
  EstadoDeCaja,
  RegistroEnCaja,
  RegistrosPendientes,
  SellarPeticion,
  SellarRespuesta,
  SelloReciente,
  SellosRecientes,
} from './caja';

export {
  FORMATO_DEL_PIN,
  esquemaAbrirTurnoPeticion,
  esquemaUsuarioDeCaja,
  esquemaUsuariosDeCaja,
} from './turno';
export type { AbrirTurnoPeticion, UsuarioDeCaja, UsuariosDeCaja } from './turno';

export { esquemaVincularPeticion, esquemaVincularRespuesta } from './vinculacion';
export type { VincularPeticion, VincularRespuesta } from './vinculacion';

export {
  CONDICIONES_EN_LA_FICHA,
  LIMITES_DEL_NEGOCIO,
  esquemaAdminActual,
  esquemaCondicionCambiada,
  esquemaCondicionDelHistorial,
  esquemaProgramaVigente,
  esquemaCondicionNueva,
  LIMITES_DEL_LOCAL,
  LIMITES_DE_PERSONA,
  ROLES_DE_PERSONA,
  esquemaDatosDePersona,
  esquemaEstadoDePersona,
  esquemaPersonaBorrada,
  esquemaCodigoDeVinculacion,
  esquemaQrCambiado,
  esquemaTabletDelAdmin,
  esquemaTabletRevocada,
  esquemaReactivacionDePersona,
  esquemaPersonaCreada,
  esquemaPersonaDelAdmin,
  esquemaPersonaNueva,
  esquemaPinNuevo,
  esquemaPinPuesto,
  esquemaDatosDelLocal,
  esquemaDatosDelNegocio,
  esquemaEstadoDelLocal,
  esquemaLocalCreado,
  esquemaLocalDelAdmin,
  esquemaEstadoDelNegocio,
  esquemaFichaDelNegocio,
  esquemaProgramaCambiado,
  esquemaEntrarComoAdminPeticion,
  esquemaEntrarComoAdminRespuesta,
  esquemaNegocioCreado,
  esquemaNegocioDelAdmin,
  esquemaNegocioNuevo,
  esquemaNegociosDelAdmin,
  esquemaProgramaNuevo,
} from './admin';
export type {
  AdminActual,
  CondicionCambiada,
  CondicionDelHistorial,
  ProgramaVigente,
  CondicionNueva,
  DatosDelLocal,
  DatosDePersona,
  EstadoDePersona,
  PersonaBorrada,
  CodigoDeVinculacion,
  QrCambiado,
  TabletDelAdmin,
  TabletRevocada,
  ReactivacionDePersona,
  PersonaCreada,
  PersonaDelAdmin,
  PersonaNueva,
  PinNuevo,
  PinPuesto,
  RolDePersona,
  DatosDelNegocio,
  EstadoDelLocal,
  LocalCreado,
  LocalDelAdmin,
  EstadoDelNegocio,
  FichaDelNegocio,
  ProgramaCambiado,
  EntrarComoAdminPeticion,
  EntrarComoAdminRespuesta,
  NegocioCreado,
  NegocioDelAdmin,
  NegocioNuevo,
  NegociosDelAdmin,
  ProgramaNuevo,
} from './admin';

export {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  CONTRASTE_MINIMO,
  ICONOS_DE_SELLO,
  ICONO_DE_SELLO_POR_DEFECTO,
  PLANTILLAS_DE_TARJETA,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  RUBROS_DE_NEGOCIO,
  TEXTO_SOBRE_CLARO,
  TEXTO_SOBRE_OSCURO,
  TITULOS_DE_RUBRO,
  colorDeTextoSobre,
  contrasteEntre,
  esColorHex,
  esIconoDeSello,
  esPlantillaDeTarjeta,
  esRubroDeNegocio,
  iconoDeSelloDe,
  plantillaDeTarjetaDe,
  tituloDeRubro,
} from './diseno';
export type {
  ColorDeTexto,
  IconoDeSello,
  PlantillaDeTarjeta,
  RubroDeNegocio,
} from './diseno';

export {
  CODIGOS_DE_ERROR_DEL_CLIENTE,
  ESTADOS_DE_TARJETA_DEL_CLIENTE,
  MENSAJE_GENERICO_PARA_EL_CLIENTE,
  esquemaCodigoDelCliente,
  esquemaDetalleDeTarjeta,
  esquemaDirectorio,
  esquemaEstadoDelRegistro,
  esquemaMarcaDelNegocio,
  esquemaNegocioDelDirectorio,
  esquemaMisTarjetas,
  esquemaRegistroPeticion,
  esquemaRegistroRespuesta,
  esquemaTarjetaDelCliente,
  mensajeParaElCliente,
} from './cliente';
export type {
  CodigoDeErrorDelCliente,
  CodigoDelCliente,
  DetalleDeTarjeta,
  Directorio,
  EstadoDeTarjetaDelCliente,
  EstadoDelRegistro,
  MarcaDelNegocio,
  MisTarjetas,
  NegocioDelDirectorio,
  RegistroPeticion,
  RegistroRespuesta,
  TarjetaDelCliente,
} from './cliente';

export {
  limpiarEvento,
  limpiarMiga,
  problemasDelEsquema,
  tacharDatos,
} from './privacidad';
export type { EventoDeError, MigaDeError } from './privacidad';

export {
  enlaceDelMapa,
  enlaceParaLlegar,
  esquemaUbicacion,
  leerUbicacion,
  textoDeUbicacion,
} from './ubicacion';
export type { LecturaDeUbicacion, Ubicacion } from './ubicacion';

export {
  esquemaLocalEnElTablero,
  esquemaNegocioEnElTablero,
  esquemaTableroDelPiloto,
} from './tablero';
export type { LocalEnElTablero, NegocioEnElTablero, TableroDelPiloto } from './tablero';

export {
  CLIENTES_EN_LA_LISTA,
  esquemaClienteDelDueno,
  esquemaClientesDelDueno,
  esquemaDuenoActual,
  esquemaEntradaDelDueno,
  esquemaEntrarComoDuenoPeticion,
  esquemaEntrarComoDuenoRespuesta,
  esquemaNegocioDelDueno,
  esquemaPersonaDelEquipo,
  esquemaPromoDelDueno,
} from './dueno';
export type {
  ClienteDelDueno,
  ClientesDelDueno,
  DuenoActual,
  EntradaDelDueno,
  EntrarComoDuenoPeticion,
  EntrarComoDuenoRespuesta,
  NegocioDelDueno,
  PromoDelDueno,
} from './dueno';

export { esquemaLocalEnElResumen, esquemaResumenDelDueno } from './resumen';
export type { LocalEnElResumen, ResumenDelDueno } from './resumen';
