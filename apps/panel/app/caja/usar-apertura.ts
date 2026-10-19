'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import type { EstadoDeCaja, UsuarioDeCaja } from '@repunto/contratos';
import * as api from '../../lib/api/caja';
import { mensajeIncierto } from '../../lib/api/mensajes';
import { aperturaInicial, hayQueEnviar, reducirApertura } from './apertura';

/**
 * Abrir turno: trae la lista de la tablet, lleva el PIN y lo manda al
 * completarse. Lo que decide —si entra, si esta bloqueado— lo decide la api;
 * aca solo se muestra.
 *
 * Abrir turno no pasa por `useCaja`: aquel genera siempre una clave de
 * idempotencia y guarda en memoria una firma del cuerpo, y el cuerpo lleva el
 * PIN.
 */
export function useApertura({ alAbrir }: { alAbrir: (estado: EstadoDeCaja) => void }) {
  const [estado, despachar] = useReducer(reducirApertura, aperturaInicial);
  const [usuarios, setUsuarios] = useState<UsuarioDeCaja[] | null>(null);
  const [problemaDeLista, setProblemaDeLista] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setProblemaDeLista(null);
    const r = await api.usuariosDeCaja();
    if (r.ok) setUsuarios(r.datos.usuarios);
    else
      setProblemaDeLista(r.tipo === 'rechazo' ? r.mensaje : 'No se pudo traer la lista.');
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Si la persona ya no podia abrir turno, la lista vieja todavia la trae.
  const volvioALaListaConAviso = estado.paso === 'lista' && estado.aviso !== null;
  useEffect(() => {
    if (volvioALaListaConAviso) void cargar();
  }, [volvioALaListaConAviso, cargar]);

  const enviar = hayQueEnviar(estado);
  useEffect(() => {
    if (!enviar || estado.paso !== 'pin') return;
    const { usuario, pin } = estado;
    despachar({ tipo: 'envio' });
    void (async () => {
      const r = await api.abrirTurno({ usuario_id: usuario.id, pin });
      if (r.ok) {
        despachar({ tipo: 'volvio' });
        alAbrir(r.datos);
        return;
      }
      despachar({
        tipo: 'fallo',
        codigo: r.tipo === 'rechazo' ? r.codigo : null,
        mensaje:
          r.tipo === 'rechazo' ? r.mensaje : mensajeIncierto(r.causa, 'abrir_turno'),
      });
    })();
    // Corre solo cuando el PIN se completa. `alAbrir` y lo tecleado se leen
    // en ese momento; volver a correr por ellos mandaria el PIN dos veces.
  }, [enviar]);

  return {
    estado,
    usuarios,
    problemaDeLista,
    recargar: cargar,
    elegir: (usuario: UsuarioDeCaja) => despachar({ tipo: 'eligio', usuario }),
    teclear: (pin: string) => despachar({ tipo: 'tecleo', pin }),
    volver: () => despachar({ tipo: 'volvio' }),
  };
}
