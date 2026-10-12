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
  CONTRASTE_MINIMO,
  ICONOS_DE_SELLO,
  ICONO_DE_SELLO_POR_DEFECTO,
  PLANTILLAS_DE_TARJETA,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  TEXTO_SOBRE_CLARO,
  TEXTO_SOBRE_OSCURO,
  colorDeTextoSobre,
  contrasteEntre,
  esColorHex,
  esIconoDeSello,
  esPlantillaDeTarjeta,
  iconoDeSelloDe,
  plantillaDeTarjetaDe,
} from './diseno';
export type { ColorDeTexto, IconoDeSello, PlantillaDeTarjeta } from './diseno';

export {
  esquemaCodigoDelCliente,
  esquemaEstadoDelRegistro,
  esquemaRegistroPeticion,
  esquemaRegistroRespuesta,
} from './cliente';
export type {
  CodigoDelCliente,
  EstadoDelRegistro,
  RegistroPeticion,
  RegistroRespuesta,
} from './cliente';
