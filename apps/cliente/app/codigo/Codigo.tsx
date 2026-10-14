'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodigoDelCliente } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import { miCodigo } from '../../lib/api/cliente';
import { type RelojDelServidor, relojDesde } from '../../lib/reloj';
import { sesionDelTelefono } from '../../lib/sesion';
import { Pantalla } from '../componentes/Pantalla';
import css from './Codigo.module.css';
import { type Vigente, codigoVigente, partesDelCodigo } from './vigente';

/**
 * El codigo que el cliente muestra en caja (especificacion, seccion 10):
 * numero grande, cuenta regresiva, y la pantalla encendida mientras se
 * muestra.
 *
 * El codigo NO se ve sin conexion, a proposito: uno viejo en pantalla es peor
 * que ninguno, porque el cajero lo tipea y la caja lo rechaza.
 */

/** Cada cuanto se redibuja la cuenta regresiva. */
const CADA_MS = 250;
/** Entre reintentos fallidos, para no martillar la api sin conexion. */
const ENTRE_REINTENTOS_MS = 5_000;

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; datos: CodigoDelCliente; reloj: RelojDelServidor }
  | { tipo: 'error'; mensaje: string; sinSesion: boolean };

export function Codigo() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [vigente, setVigente] = useState<Vigente | null>(null);
  const pidiendo = useRef(false);
  const ultimoIntento = useRef(Number.NEGATIVE_INFINITY);

  const pedir = useCallback(
    async (senal?: AbortSignal) => {
      const token = sesionDelTelefono().token();
      if (token === null) {
        router.replace('/');
        return;
      }
      if (pidiendo.current) return;
      pidiendo.current = true;
      ultimoIntento.current = performance.now();
      const respuesta = await miCodigo(token, senal);
      pidiendo.current = false;
      if (senal?.aborted) return;

      if (respuesta.ok) {
        setEstado({
          tipo: 'listo',
          datos: respuesta.datos,
          reloj: relojDesde(respuesta.datos.ahora),
        });
        return;
      }
      if (respuesta.tipo === 'rechazo' && respuesta.codigo === 'TOKEN_INVALIDO') {
        sesionDelTelefono().cerrar();
        setEstado({ tipo: 'error', mensaje: respuesta.mensaje, sinSesion: true });
        return;
      }
      // Si ya hay codigos en pantalla, se siguen mostrando mientras sirvan.
      setEstado((antes) =>
        antes.tipo === 'listo'
          ? antes
          : { tipo: 'error', mensaje: respuesta.mensaje, sinSesion: false },
      );
    },
    [router],
  );

  useEffect(() => {
    const control = new AbortController();
    void pedir(control.signal);
    return () => control.abort();
  }, [pedir]);

  // La cuenta regresiva, con el reloj del servidor. Cuando se esta mostrando
  // el ultimo codigo, o ya no queda ninguno, se piden los siguientes.
  useEffect(() => {
    if (estado.tipo !== 'listo') return;
    const actualizar = () => {
      const ahora = codigoVigente(estado.datos, estado.reloj.ahora());
      setVigente(ahora);
      const toca = ahora.tipo === 'vencidos' || ahora.pedirMas;
      if (toca && performance.now() - ultimoIntento.current > ENTRE_REINTENTOS_MS) {
        void pedir();
      }
    };
    actualizar();
    const intervalo = setInterval(actualizar, CADA_MS);
    return () => clearInterval(intervalo);
  }, [estado, pedir]);

  useMantenerPantallaEncendida();

  return (
    <Pantalla>
      <Contenido
        estado={estado}
        vigente={vigente}
        alReintentar={() => void pedir()}
        alVolver={() => router.push('/')}
      />
    </Pantalla>
  );
}

function Contenido(p: {
  estado: Estado;
  vigente: Vigente | null;
  alReintentar: () => void;
  alVolver: () => void;
}) {
  const { estado, vigente } = p;

  if (estado.tipo === 'cargando') {
    return <p className={css.espera}>Pidiendo tu código…</p>;
  }

  if (estado.tipo === 'error') {
    return (
      <section className={css.problema}>
        <Aviso mensaje={estado.mensaje} />
        {estado.sinSesion ? (
          <Boton tamano="grande" ancho onClick={p.alVolver}>
            Ir al inicio
          </Boton>
        ) : (
          <>
            <p className={css.nota}>
              El código necesita conexión: cambia cada 30 segundos.
            </p>
            <Boton tamano="grande" ancho onClick={p.alReintentar}>
              Probar de nuevo
            </Boton>
          </>
        )}
      </section>
    );
  }

  if (vigente === null || vigente.tipo === 'vencidos') {
    return (
      <section className={css.problema}>
        <Aviso mensaje="Sin conexión. El código necesita internet para renovarse." />
        <p className={css.nota}>Seguimos intentando…</p>
      </section>
    );
  }

  const { prefijo, digitos } = partesDelCodigo(vigente.codigo);
  const segundos = Math.max(1, Math.ceil(vigente.restanteMs / 1000));

  return (
    <section className={css.codigo}>
      <h1 className={css.instruccion}>Mostrale este código al cajero</h1>

      <p className={css.numero} aria-label={`Código ${vigente.codigo}`}>
        <span className={css.prefijo}>{prefijo}</span>
        <span className={css.digitos}>{digitos}</span>
      </p>

      <div className={css.barra} aria-hidden="true">
        <span style={{ transform: `scaleX(${vigente.fraccion})` }} />
      </div>
      <p className={css.cuenta}>Cambia en {segundos} s</p>

      <p className={css.nota}>
        Si el cajero lo está tipeando cuando cambia, el anterior todavía sirve.
      </p>

      <Boton variante="texto" onClick={p.alVolver}>
        Volver a mis tarjetas
      </Boton>
    </section>
  );
}

/**
 * Que el telefono no apague la pantalla mientras el cajero tipea. Donde el
 * navegador no lo permite, no pasa nada: el codigo se sigue viendo.
 */
function useMantenerPantallaEncendida() {
  useEffect(() => {
    let candado: WakeLockSentinel | null = null;
    const pedirCandado = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        candado = await navigator.wakeLock.request('screen');
      } catch {
        // Bateria baja, permiso negado: la pantalla se apaga sola, nada mas.
      }
    };
    // El navegador lo suelta al ocultar la pestaña: se vuelve a pedir al volver.
    const alVolver = () => void pedirCandado();
    void pedirCandado();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      void candado?.release();
    };
  }, []);
}
