import {
  esquemaAnularRespuesta,
  esquemaCanjearRespuesta,
  esquemaConfirmarRespuesta,
  esquemaDescartarRespuesta,
  esquemaEstadoDeCaja,
  esquemaRegistrosPendientes,
  esquemaSellarRespuesta,
  esquemaSellosRecientes,
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
} from '@repunto/contratos';
import { interpretar, pedir, pedirCrudo, type Fallo, type Respuesta } from './http';

/**
 * Un endpoint de caja por funcion. Todos los POST piden la clave de
 * idempotencia: quien llama la saca del gestor, porque solo quien llama sabe
 * si esto es un intento nuevo o el reintento de uno que quedo en el aire.
 */

const segmento = (id: string) => encodeURIComponent(id);

export function sellar(peticion: SellarPeticion, clave: string): Promise<Respuesta<SellarRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: '/caja/sellos', cuerpo: peticion, claveDeIdempotencia: clave },
    esquemaSellarRespuesta,
  );
}

export function canjear(
  peticion: CanjearPeticion,
  clave: string,
): Promise<Respuesta<CanjearRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: '/caja/canjes', cuerpo: peticion, claveDeIdempotencia: clave },
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
    { metodo: 'POST', ruta: `/caja/registros/${segmento(id)}/descartar`, claveDeIdempotencia: clave },
    esquemaDescartarRespuesta,
  );
}

export function anularSello(id: string, clave: string): Promise<Respuesta<AnularRespuesta>> {
  return pedir(
    { metodo: 'POST', ruta: `/caja/sellos/${segmento(id)}/anulacion`, claveDeIdempotencia: clave },
    esquemaAnularRespuesta,
  );
}

/** Quien es esta caja y si puede operar. Contesta 200 aunque no pueda. */
export function estadoDeCaja(): Promise<Respuesta<EstadoDeCaja>> {
  return pedir({ metodo: 'GET', ruta: '/caja/estado' }, esquemaEstadoDeCaja);
}

export function sellosRecientes(): Promise<Respuesta<SellosRecientes>> {
  return pedir({ metodo: 'GET', ruta: '/caja/sellos/recientes' }, esquemaSellosRecientes);
}

export type ConsultaDeRegistros =
  | { ok: true; tipo: 'sin_cambios' }
  /** `etag` es null si la API no lo manda o el navegador no deja leerlo. */
  | { ok: true; tipo: 'nuevos'; datos: RegistrosPendientes; etag: string | null }
  | Fallo
  | { ok: false; tipo: 'cancelado' };

let avisoDeEtagDado = false;

/**
 * `GET /caja/registros` condicional. Mientras la lista no cambie, la API
 * contesta 304 sin cuerpo.
 *
 * Si el ETag no se puede leer, todo sigue andando, pero cada consulta baja la
 * lista entera. Pasa cuando la API lo manda sin `Access-Control-Expose-Headers:
 * ETag`: el navegador lo esconde y no hay error que lo delate.
 */
export async function registrosPendientes(
  etag: string | null,
  senal?: AbortSignal,
): Promise<ConsultaDeRegistros> {
  const crudo = await pedirCrudo({
    metodo: 'GET',
    ruta: '/caja/registros',
    ...(etag !== null && { cabeceras: { 'If-None-Match': etag } }),
    ...(senal !== undefined && { senal }),
  });
  if (crudo === 'cancelado') return { ok: false, tipo: 'cancelado' };
  if (crudo === 'sin_conexion' || crudo === 'tiempo') {
    return { ok: false, tipo: 'incierto', causa: crudo };
  }
  if (crudo.estado === 304) return { ok: true, tipo: 'sin_cambios' };

  const r = interpretar(crudo, esquemaRegistrosPendientes);
  if (!r.ok) return r;

  const nuevoEtag = r.cabeceras.get('ETag');
  if (nuevoEtag === null && !avisoDeEtagDado) {
    avisoDeEtagDado = true;
    console.warn(
      '[repunto] GET /caja/registros llego sin ETag visible. Si la API lo manda, falta ' +
        '`Access-Control-Expose-Headers: ETag`: sin eso el panel baja la lista entera cada 3 segundos.',
    );
  }
  return { ok: true, tipo: 'nuevos', datos: r.datos, etag: nuevoEtag };
}
