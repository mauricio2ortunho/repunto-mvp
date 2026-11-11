import { describe, expect, it } from 'vitest';
import type { SolicitudDelAdmin } from '@repunto/contratos';

import {
  borradorDesdeSolicitud,
  chatConQuienPidio,
  mensajeParaQuienPidio,
  pasoSiguienteDelAlta,
  separarSolicitudes,
} from './solicitudes-del-admin';

function solicitud(cambio: Partial<SolicitudDelAdmin> = {}): SolicitudDelAdmin {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nombre_negocio: 'Salteñería Doña Rosa',
    categoria: 'restaurante',
    contacto: 'Rosa Vaca',
    telefono: '+59176554433',
    mensaje: null,
    estado: 'pendiente',
    motivo_rechazo: null,
    negocio_id: null,
    creado_el: '2026-11-11T15:00:00.000Z',
    resuelta_el: null,
    ...cambio,
  };
}

describe('solicitudes en el panel del admin', () => {
  it('separa las pendientes de las resueltas', () => {
    const r = separarSolicitudes([
      solicitud(),
      solicitud({ estado: 'rechazada' }),
      solicitud({ estado: 'aprobada' }),
    ]);
    expect(r.pendientes).toHaveLength(1);
    expect(r.resueltas).toHaveLength(2);
  });

  it('el alta arranca con el nombre y el rubro', () => {
    expect(borradorDesdeSolicitud(solicitud())).toMatchObject({
      nombre: 'Salteñería Doña Rosa',
      categoria: 'restaurante',
    });
    // Un rubro que el panel no conoce queda para elegir.
    expect(borradorDesdeSolicitud(solicitud({ categoria: 'nuevo' })).categoria).toBe('');
  });

  it('le habla a quien pidió por su nombre, desde su número', () => {
    expect(mensajeParaQuienPidio(solicitud())).toMatch(
      /^¡Hola Rosa!.*Salteñería Doña Rosa/,
    );
    const chat = chatConQuienPidio(solicitud());
    expect(chat.startsWith('https://wa.me/59176554433?text=')).toBe(true);
  });

  it('recuerda cargar al dueño con su teléfono', () => {
    expect(pasoSiguienteDelAlta(solicitud())).toContain('Rosa Vaca');
    expect(pasoSiguienteDelAlta(solicitud())).toContain('7655 4433');
  });
});
