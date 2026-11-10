import { createHash, createHmac } from 'node:crypto';

/**
 * La firma de un pedido a R2 (AWS Signature Version 4, la de S3). Escrita a
 * mano y no con una librería: la única chica (aws4fetch) depende de los
 * tipos globales de `fetch`, y el compilador de Vercel los resuelve vacíos
 * (`RequestInit` sin `method`, `Response` sin `ok`), así que la api no
 * desplegaba. Para un PUT alcanza con esto, y el test la compara con el
 * ejemplo de la documentación de Amazon.
 *
 * Referencia: docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */

export interface Credencial {
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 usa `auto`. */
  region: string;
  servicio: string;
}

export interface PedidoAFirmar {
  metodo: string;
  url: URL;
  /** Las que van firmadas, además de host, x-amz-date y x-amz-content-sha256. */
  cabeceras: Record<string, string>;
  /** sha256 en hex del cuerpo. */
  huellaDelCuerpo: string;
}

export function sha256Hex(datos: string | Uint8Array): string {
  return createHash('sha256').update(datos).digest('hex');
}

function hmac(clave: string | Buffer, datos: string): Buffer {
  return createHmac('sha256', clave).update(datos, 'utf8').digest();
}

/** RFC 3986, como la quiere S3: todo salvo letras, números y `-_.~`. */
function codificar(segmento: string): string {
  return encodeURIComponent(segmento).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `20130524T000000Z`. */
function fechaAmz(ahora: Date): string {
  return ahora
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Las cabeceras con que sale el pedido: las dadas, más host, x-amz-date,
 * x-amz-content-sha256 y authorization.
 */
export function firmar(
  pedido: PedidoAFirmar,
  credencial: Credencial,
  ahora: Date,
): Record<string, string> {
  const amzDate = fechaAmz(ahora);
  const dia = amzDate.slice(0, 8);
  const cabeceras: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(pedido.cabeceras).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: pedido.url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': pedido.huellaDelCuerpo,
  };
  const nombres = Object.keys(cabeceras).sort();
  const firmadas = nombres.join(';');

  const ruta = pedido.url.pathname.split('/').map(codificar).join('/') || '/';
  const consulta = [...pedido.url.searchParams.entries()]
    .map(([k, v]) => `${codificar(k)}=${codificar(v)}`)
    .sort()
    .join('&');
  const pedidoCanonico = [
    pedido.metodo,
    ruta,
    consulta,
    ...nombres.map((n) => `${n}:${cabeceras[n] ?? ''}`),
    '',
    firmadas,
    pedido.huellaDelCuerpo,
  ].join('\n');

  const alcance = `${dia}/${credencial.region}/${credencial.servicio}/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', amzDate, alcance, sha256Hex(pedidoCanonico)].join(
    '\n',
  );
  const clave = hmac(
    hmac(
      hmac(hmac(`AWS4${credencial.secretAccessKey}`, dia), credencial.region),
      credencial.servicio,
    ),
    'aws4_request',
  );
  const firma = createHmac('sha256', clave).update(aFirmar, 'utf8').digest('hex');

  return {
    ...cabeceras,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${credencial.accessKeyId}/${alcance}, ` +
      `SignedHeaders=${firmadas}, Signature=${firma}`,
  };
}
