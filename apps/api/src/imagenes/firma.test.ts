import { describe, expect, it } from 'vitest';

import { firmar, sha256Hex } from './firma';

/**
 * El ejemplo "GET Object" de la documentación de Amazon
 * (sig-v4-header-based-auth.html): mismas credenciales de ejemplo, misma
 * fecha, misma firma esperada. Si la firma se aparta de la de S3, R2 rechaza
 * todas las subidas; esto lo dice antes de desplegar.
 */
const CREDENCIAL_DE_EJEMPLO = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  servicio: 's3',
};

describe('firmar', () => {
  it('da la firma del ejemplo de Amazon', () => {
    const cabeceras = firmar(
      {
        metodo: 'GET',
        url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
        cabeceras: { Range: 'bytes=0-9' },
        huellaDelCuerpo: sha256Hex(''),
      },
      CREDENCIAL_DE_EJEMPLO,
      new Date('2013-05-24T00:00:00Z'),
    );

    expect(cabeceras['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(cabeceras['x-amz-date']).toBe('20130524T000000Z');
  });

  it('firma también el tipo y el cache del PUT', () => {
    const cabeceras = firmar(
      {
        metodo: 'PUT',
        url: new URL(
          'https://cuenta.r2.cloudflarestorage.com/bucket/negocios/x/logo-ab.webp',
        ),
        cabeceras: { 'Content-Type': 'image/webp', 'Cache-Control': 'public' },
        huellaDelCuerpo: sha256Hex('abc'),
      },
      { ...CREDENCIAL_DE_EJEMPLO, region: 'auto' },
      new Date('2026-11-10T12:00:00Z'),
    );

    expect(cabeceras['authorization']).toContain(
      'SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date',
    );
    expect(cabeceras['authorization']).toContain('/20261110/auto/s3/aws4_request');
    expect(cabeceras['x-amz-content-sha256']).toBe(sha256Hex('abc'));
  });
});
