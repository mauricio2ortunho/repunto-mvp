'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ResumenDelDueno } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../lib/api/dueno';
import { hora } from '../../lib/fechas';
import {
  localesParaElDueno,
  pieDeVolvieron,
  textoDeFrecuencia,
} from '../../lib/resumen-del-dueno';
import css from './Dueno.module.css';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; resumen: ResumenDelDueno }
  | { tipo: 'error'; mensaje: string };

/**
 * Cómo le va al negocio: sus clientes, sus visitas, sus premios y sus
 * locales. Se calcula al abrir; "Actualizar" lo vuelve a pedir.
 */
export function Resumen({ aEntrar }: { aEntrar: () => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [actualizando, setActualizando] = useState(false);

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      setActualizando(true);
      const r = await api.resumen(senal);
      if (senal?.aborted === true) return;
      setActualizando(false);
      if (r.ok) return setEstado({ tipo: 'listo', resumen: r.datos });
      if (api.sesionPerdida(r)) return aEntrar();
      setEstado({ tipo: 'error', mensaje: api.mensajeParaElDueno(r) });
    },
    [aEntrar],
  );

  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  if (estado.tipo === 'cargando') {
    return <p className={css.texto}>Juntando tus números…</p>;
  }
  if (estado.tipo === 'error') {
    return (
      <div className={css.bloque}>
        <Aviso mensaje={estado.mensaje} />
        <Boton variante="secundario" onClick={() => void consultar()}>
          Probar de nuevo
        </Boton>
      </div>
    );
  }

  const { resumen } = estado;
  const { clientes, visitas, premios, ventanas } = resumen;
  const frecuencia = textoDeFrecuencia(visitas.dias_entre_visitas);

  return (
    <div className={css.contenido}>
      <section className={css.bloque} aria-labelledby="tus-clientes">
        <h2 id="tus-clientes" className={css.subtitulo}>
          Tus clientes
        </h2>
        <ul className={css.cifras}>
          <Cifra
            titulo="Volvieron"
            valor={clientes.volvieron}
            pie={pieDeVolvieron(clientes)}
          />
          <Cifra titulo="Nuevos este mes" valor={clientes.nuevos_del_mes} />
          <Cifra
            titulo="Activos"
            valor={clientes.activos}
            pie={`Con un sello en ${ventanas.cliente_activo_dias} días`}
          />
          <Cifra
            titulo="Dejaron de venir"
            valor={clientes.enfriados}
            pie={`Venían seguido y hace ${ventanas.enfriado_dias} días que no vienen`}
          />
        </ul>
        {clientes.enfriados > 0 && (
          <p className={css.nota}>
            Pronto vas a poder mandarles un mensaje a los que dejaron de venir.
          </p>
        )}
      </section>

      <section className={css.bloque} aria-labelledby="tus-visitas">
        <h2 id="tus-visitas" className={css.subtitulo}>
          Visitas
        </h2>
        <ul className={css.cifras}>
          <Cifra
            titulo={`Sellos en ${ventanas.semana_dias} días`}
            valor={visitas.sellos_semana}
          />
          <Cifra
            titulo={`Regresos en ${ventanas.mes_dias} días`}
            valor={visitas.regresos_mes}
            pie={`De ${visitas.sellos_mes} visitas: las de clientes que ya habían venido`}
          />
          <Cifra
            titulo="Vuelven"
            valor={frecuencia ?? '—'}
            pie={
              frecuencia === null
                ? 'Cuando alguien vuelva, vas a ver cada cuánto.'
                : 'Lo más común entre una visita y la siguiente'
            }
          />
        </ul>
      </section>

      <section className={css.bloque} aria-labelledby="tus-premios">
        <h2 id="tus-premios" className={css.subtitulo}>
          Premios
        </h2>
        <ul className={css.cifras}>
          <Cifra
            titulo={`Entregados en ${ventanas.mes_dias} días`}
            valor={premios.canjes_mes}
          />
          <Cifra
            titulo="Tarjetas en curso"
            valor={premios.tarjetas_abiertas}
            pie="Con al menos un sello"
          />
          <Cifra
            titulo="Listas para canjear"
            valor={premios.listas_para_canjear}
            pie="Completas: les falta retirar el premio"
          />
        </ul>
      </section>

      <section className={css.bloque} aria-labelledby="tus-locales">
        <h2 id="tus-locales" className={css.subtitulo}>
          Tus locales
        </h2>
        {resumen.locales.length === 0 ? (
          <p className={css.texto}>No tenés locales abiertos.</p>
        ) : (
          <ul className={css.locales}>
            {localesParaElDueno(resumen).map((l) => (
              <li key={l.id} className={css.local}>
                <strong>{l.nombre}</strong>
                <span className={css.detalle}>{l.detalle}</span>
                {l.alerta !== null && (
                  <span className={css.alerta}>
                    <span className={css.marcaDeAlerta} aria-hidden="true">
                      !
                    </span>
                    {l.alerta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={css.bloque}>
        <p className={css.nota}>
          Actualizado a las {hora(resumen.generado_el)}. Los sellos deshechos no cuentan.
        </p>
        <Boton
          variante="secundario"
          disabled={actualizando}
          onClick={() => void consultar()}
        >
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </Boton>
      </div>
    </div>
  );
}

function Cifra(p: { titulo: string; valor: number | string; pie?: string }) {
  const enPalabras = typeof p.valor === 'string';
  return (
    <li className={css.cifra}>
      <span className={css.tituloDeCifra}>{p.titulo}</span>
      <span className={enPalabras ? `${css.valor} ${css.valorEnPalabras}` : css.valor}>
        {typeof p.valor === 'number' ? p.valor.toLocaleString('es-BO') : p.valor}
      </span>
      {/* Vacío también: la fila del pie la comparten las vecinas. */}
      <span className={css.pie}>{p.pie}</span>
    </li>
  );
}
