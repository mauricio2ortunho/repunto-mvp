'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ClienteDelDueno, ClientesDelDueno as Lista } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../../lib/api/dueno';
import {
  FILTROS_DE_CLIENTES,
  chatParaQueVuelva,
  type FiltroDeClientes,
  clientesQueSeVen,
  cuantosPorFiltro,
  historiaDelCliente,
  tarjetaDelCliente,
  telefonoParaVer,
} from '../../../lib/clientes-del-dueno';
import estilos from '../../admin/negocios/Negocios.module.css';
import css from '../Dueno.module.css';
import { useDuenoActual } from '../MarcoDelDueno';
import { useSesionDeDueno } from '../usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; lista: Lista }
  | { tipo: 'error'; mensaje: string };

/**
 * Sus clientes: quién tiene tarjeta en su negocio, cuándo vino por última
 * vez y cómo va su tarjeta. Los que dejaron de venir se marcan: es el número
 * del resumen que pide una acción, y acá están sus nombres y teléfonos.
 */
export function ClientesDelDueno(p: { filtroInicial: FiltroDeClientes }) {
  const { aEntrar } = useSesionDeDueno();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [filtro, setFiltro] = useState<FiltroDeClientes>(p.filtroInicial);
  const [buscado, setBuscado] = useState('');

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.clientes(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', lista: r.datos });
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
    return <p className={css.texto}>Buscando tus clientes…</p>;
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

  const { lista } = estado;
  const ahora = new Date(lista.generado_el);
  const cuantos = cuantosPorFiltro(lista.clientes);
  const visibles = clientesQueSeVen(lista.clientes, filtro, buscado);

  if (lista.total === 0) {
    return (
      <section className={css.bloque}>
        <h2 className={css.subtitulo}>Tus clientes</h2>
        <p className={css.texto}>
          Todavía no tenés clientes. Aparecen acá cuando tu caja les abre la tarjeta.
        </p>
      </section>
    );
  }

  return (
    <section className={css.bloque} aria-labelledby="tus-clientes">
      <h2 id="tus-clientes" className={css.subtitulo}>
        Tus clientes ({lista.total})
      </h2>

      <label className={css.etiqueta} htmlFor="buscar-cliente">
        Buscar por nombre o teléfono
      </label>
      <input
        id="buscar-cliente"
        className={estilos.entrada}
        type="search"
        value={buscado}
        autoComplete="off"
        placeholder="María, 7001…"
        onChange={(e) => setBuscado(e.target.value)}
      />

      <div className={estilos.opciones} role="radiogroup" aria-label="Qué clientes ver">
        {FILTROS_DE_CLIENTES.map((f) => (
          <label key={f.id} className={estilos.opcion}>
            <input
              type="radio"
              name="filtro-de-clientes"
              checked={filtro === f.id}
              onChange={() => setFiltro(f.id)}
            />
            {f.titulo} ({cuantos[f.id]})
          </label>
        ))}
      </div>

      {filtro === 'enfriados' && (
        <p className={css.nota}>
          Venían seguido ({lista.ventanas.sellos_para_enfriado} sellos o más) y hace{' '}
          {lista.ventanas.enfriado_dias} días que no vienen.
        </p>
      )}
      {lista.total > lista.clientes.length && (
        <p className={css.nota}>
          Se ven los {lista.clientes.length} que vinieron más recientemente, de{' '}
          {lista.total}.
        </p>
      )}

      {visibles.length === 0 ? (
        <p className={css.texto}>Nadie coincide.</p>
      ) : (
        <ul className={css.locales}>
          {visibles.map((c) => (
            <FilaDeCliente key={c.telefono} cliente={c} ahora={ahora} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaDeCliente({ cliente: c, ahora }: { cliente: ClienteDelDueno; ahora: Date }) {
  const { negocio } = useDuenoActual();
  const tarjeta = tarjetaDelCliente(c, ahora);
  return (
    <li className={css.local}>
      <strong>{c.nombre}</strong>
      <a className={estilos.enlaceSimple} href={`tel:${c.telefono}`}>
        {telefonoParaVer(c.telefono)}
      </a>
      <span className={css.detalle}>{historiaDelCliente(c, ahora)}</span>
      {tarjeta !== null && <span className={css.detalle}>{tarjeta}</span>}
      {c.enfriado && (
        <span className={css.alerta}>
          <span className={css.marcaDeAlerta} aria-hidden="true">
            !
          </span>
          Dejó de venir
        </span>
      )}
      {/* Lo manda el dueño desde su WhatsApp, y puede cambiar el texto antes. */}
      {c.enfriado && (
        <a
          className={css.whatsapp}
          href={chatParaQueVuelva(c, negocio.nombre, ahora)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Escribirle por WhatsApp
        </a>
      )}
      {c.nuevo_del_mes && <span className={css.detalle}>Nuevo este mes</span>}
    </li>
  );
}
