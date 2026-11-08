'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { TableroDelPiloto } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../../lib/api/admin';
import { fechaYHora } from '../../../lib/fechas';
import { localesQuePreocupan, totales } from '../../../lib/tablero';
import css from '../Admin.module.css';
import { useSesionDeAdmin } from '../usar-sesion';
import estilos from './Tablero.module.css';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; tablero: TableroDelPiloto }
  | { tipo: 'error'; mensaje: string };

/**
 * El tablero del piloto: si cada negocio está usando el sistema. Arriba los
 * totales, después los locales que preocupan, y una fila por negocio.
 */
export function Tablero() {
  const { aEntrar } = useSesionDeAdmin();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [actualizando, setActualizando] = useState(false);

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      setActualizando(true);
      const r = await api.tablero(senal);
      if (senal?.aborted === true) return;
      setActualizando(false);
      if (r.ok) return setEstado({ tipo: 'listo', tablero: r.datos });
      if (api.sesionPerdida(r)) return aEntrar();
      setEstado({ tipo: 'error', mensaje: api.mensajeParaElAdmin(r) });
    },
    [aEntrar],
  );

  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  return (
    <main className={css.pantalla}>
      <header className={css.encabezado}>
        <div>
          <Link href="/admin" className={estilos.volver}>
            ‹ Administración
          </Link>
          <h1 className={css.titulo}>Tablero del piloto</h1>
          {estado.tipo === 'listo' && (
            <p className={css.texto}>
              Actualizado el {fechaYHora(estado.tablero.generado_el)}
            </p>
          )}
        </div>
        <Boton
          variante="secundario"
          disabled={actualizando}
          onClick={() => void consultar()}
        >
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </Boton>
      </header>

      {estado.tipo === 'cargando' && <p className={css.texto}>Juntando los números…</p>}
      {estado.tipo === 'error' && <Aviso mensaje={estado.mensaje} />}
      {estado.tipo === 'listo' && <Contenido tablero={estado.tablero} />}
    </main>
  );
}

function Contenido({ tablero }: { tablero: TableroDelPiloto }) {
  const suma = totales(tablero);
  const preocupan = localesQuePreocupan(tablero);
  const { ventanas } = tablero;

  if (tablero.negocios.length === 0) {
    return <p className={css.texto}>Todavía no hay negocios.</p>;
  }

  return (
    <div className={estilos.contenido}>
      <ul className={estilos.cifras} aria-label="Totales de los negocios activos">
        <Cifra
          titulo={`Sellos en ${ventanas.semana_dias} días`}
          valor={suma.sellos_semana}
        />
        <Cifra
          titulo={`Clientes activos (${ventanas.cliente_activo_dias} días)`}
          valor={suma.clientes_activos}
        />
        <Cifra titulo="Clientes nuevos este mes" valor={suma.clientes_nuevos_del_mes} />
        <Cifra titulo={`Premios en ${ventanas.mes_dias} días`} valor={suma.canjes_mes} />
      </ul>

      <section className={estilos.bloque}>
        <h2 className={estilos.subtitulo}>Locales que preocupan</h2>
        {preocupan.length === 0 ? (
          <p className={css.texto}>
            Todos los locales abiertos sellaron en los últimos{' '}
            {ventanas.local_sin_sellos_dias} días.
          </p>
        ) : (
          <ul className={estilos.alertas}>
            {preocupan.map((l) => (
              <li key={`${l.negocio_id}-${l.local}`}>
                <span className={estilos.marcaDeAlerta} aria-hidden="true">
                  !
                </span>
                <span>
                  <Link href={`/admin/negocios/${l.negocio_id}`}>{l.negocio}</Link> ·{' '}
                  {l.local}: {l.motivo}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={estilos.bloque}>
        <h2 className={estilos.subtitulo}>Por negocio</h2>
        <div className={estilos.desplazable}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th scope="col">Negocio</th>
                <th scope="col">Sellos {ventanas.semana_dias} d</th>
                <th scope="col">Sellos {ventanas.mes_dias} d</th>
                <th scope="col">Premios {ventanas.mes_dias} d</th>
                <th scope="col">Activos</th>
                <th scope="col">Nuevos del mes</th>
                <th scope="col">Tarjetas abiertas</th>
              </tr>
            </thead>
            <tbody>
              {tablero.negocios.map((n) => (
                <tr key={n.id} data-estado={n.estado}>
                  <th scope="row">
                    <Link href={`/admin/negocios/${n.id}`}>{n.nombre}</Link>
                    {n.estado === 'suspendido' && (
                      <span className={estilos.suspendido}> (suspendido)</span>
                    )}
                  </th>
                  <td>{n.sellos_semana}</td>
                  <td>{n.sellos_mes}</td>
                  <td>{n.canjes_mes}</td>
                  <td>{n.clientes_activos}</td>
                  <td>{n.clientes_nuevos_del_mes}</td>
                  <td>{n.tarjetas_abiertas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={estilos.nota}>
          Activos: con un sello en los últimos {ventanas.cliente_activo_dias} días. Nuevos
          del mes: su primer sello fue desde el {fechaYHora(tablero.inicio_del_mes)}.
          Tarjetas abiertas: en curso y con algún sello. Los sellos deshechos no cuentan.
        </p>
      </section>
    </div>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <li className={estilos.cifra}>
      <span className={estilos.tituloDeCifra}>{titulo}</span>
      <span className={estilos.valor}>{valor.toLocaleString('es-BO')}</span>
    </li>
  );
}
