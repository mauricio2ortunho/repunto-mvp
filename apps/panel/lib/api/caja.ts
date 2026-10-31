import {
  esquemaAnularRespuesta,
  esquemaCanjearRespuesta,
  esquemaConfirmarRespuesta,
  esquemaDescartarRespuesta,
  esquemaEstadoDeCaja,
  esquemaRegistrosPendientes,
  esquemaSellarRespuesta,
  esquemaSellosRecientes,
  esquemaUsuariosDeCaja,
  esquemaVincularRespuesta,
  type AbrirTurnoPeticion,
  type AnularRespuesta,
  type CanjearPeticion,
  type CanjearRespuesta,
  type ConfirmarPeticion,
  type ConfirmarRespuesta,
  type DescartarRespuesta,
  type EstadoDeCaja,
  type RegistrosPendientes,
  type SellarPeticion,
  type SellarRespuesta,
  type SellosRecientes,
  type UsuariosDeCaja,
  type VincularPeticion,
  type VincularRespuesta,
} from '@repunto/contratos';
import { interpretar, pedir, pedirCrudo, type Fallo, type Respuesta } from './http';

/**
 * Un endpoint de caja por funcion. Todos los POST piden la clave de
 * idempotencia: quien llama la saca del gestor, porque solo quien llama sabe
 * si esto es un intento nuevo o el reintento de uno que quedo en el aire.
 */

const segmento = (id: string) => encodeURIComponent(id);

export function sellar(
  peticion: SellarPeticion,
  clave: string,
): Promise<Respuesta<SellarRespuesta>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: '/caja/sellos',
      cuerpo: peticion,
      claveDeIdempotencia: clave,
    },
    esquemaSellarRespuesta,
  );
}

export function canjear(
  peticion: CanjearPeticion,
  clave: string,
): Promise<Respuesta<CanjearRespuesta>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: '/caja/canjes',
      cuerpo: peticion,
      claveDeIdempotencia: clave,
    },
    esquemaCanjearRespuesta,
  );
}

export function confirmarRegistro(
  id: string,
  peticion: ConfirmarPeticion,
  clave: string,
): Promise<Respuesta<ConfirmarRespuesta>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/caja/registros/${segmento(id)}/confirmar`,
      cuerpo: peticion,
      claveDeIdempotencia: clave,
    },
    esquemaConfirmarRespuesta,
  );
}

export function descartarRegistro(
  id: string,
  clave: string,
): Promise<Respuesta<DescartarRespuesta>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/caja/registros/${segmento(id)}/descartar`,
      claveDeIdempotencia: clave,
    },
    esquemaDescartarRespuesta,
  );
}

export function anularSello(
  id: string,
  clave: string,
): Promise<Respuesta<AnularRespuesta>> {
  return pedir(
    {
      metodo: 'POST',
      ruta: `/caja/sellos/${segmento(id)}/anulacion`,
      claveDeIdempotencia: clave,
    },
    esquemaAnularRespuesta,
  );
}

/** Quien es esta caja y si puede operar. Contesta 200 aunque no pueda. */
export function estadoDeCaja(): Promise<Respuesta<EstadoDeCaja>> {
  return pedir({ metodo: 'GET', ruta: '/caja/estado' }, esquemaEstadoDeCaja);
}

/** Quienes pueden abrir turno en esta tablet. */
export function usuariosDeCaja(): Promise<Respuesta<UsuariosDeCaja>> {
  return pedir({ metodo: 'GET', ruta: '/caja/usuarios' }, esquemaUsuariosDeCaja);
}

/**
 * Abrir turno con PIN. SIN clave de idempotencia, al reves que el resto de
 * los POST: la api la guardaria con un hash del cuerpo, y el de un PIN de
 * cuatro digitos se revierte. El doble toque lo cubre la api. Responde el
 * estado de la caja ya con el turno.
 */
export function abrirTurno(
  peticion: AbrirTurnoPeticion,
): Promise<Respuesta<EstadoDeCaja>> {
  return pedir(
    { metodo: 'POST', ruta: '/caja/turnos', cuerpo: peticion },
    esquemaEstadoDeCaja,
  );
}

/**
 * Vincular esta tablet: el codigo de un solo uso por su token. Sin clave de
 * idempotencia: el codigo mismo es de un solo uso. Quien llama guarda el token.
 */
export function vincular(
  peticion: VincularPeticion,
): Promise<Respuesta<VincularRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: '/caja/vinculacion', cuerpo: peticion },
    esquemaVincularRespuesta,
  );
}

/** Cerrar el turno de esta tablet. Responde el estado, ya sin turno. */
export function cerrarTurno(): Promise<Respuesta<EstadoDeCaja>> {
  return pedir({ metodo: 'POST', ruta: '/caja/turno/cierre' }, esquemaEstadoDeCaja);
}

export function sellosRecientes(): Promise<Respuesta<SellosRecientes>> {
  return pedir({ metodo: 'GET', ruta: '/caja/sellos/recientes' }, esquemaSellosRecientes);
}

export type ConsultaDeRegistros =
  { ok: true; datos: RegistrosPendientes } | Fallo | { ok: false; tipo: 'cancelado' };

/**
 * `GET /caja/registros`, la lista entera cada vez.
 *
 * Nunca condicional: Vercel le saca a los 304 el permiso de CORS, el
 * navegador los descarta como un corte de red y la banda mostraba "Sin
 * conexion" con la API andando. No agregar `If-None-Match`.
 */
export async function registrosPendientes(
  senal?: AbortSignal,
): Promise<ConsultaDeRegistros> {
  const crudo = await pedirCrudo({
    metodo: 'GET',
    ruta: '/caja/registros',
    ...(senal !== undefined && { senal }),
  });
  if (crudo === 'cancelado') return { ok: false, tipo: 'cancelado' };
  if (crudo === 'sin_conexion' || crudo === 'tiempo') {
    return { ok: false, tipo: 'incierto', causa: crudo };
  }
  const r = interpretar(crudo, esquemaRegistrosPendientes);
  return r.ok ? { ok: true, datos: r.datos } : r;
}
