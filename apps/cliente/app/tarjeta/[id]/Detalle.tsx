'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type DetalleDeTarjeta, esquemaDetalleDeTarjeta } from '@repunto/contratos';
import {
  AparienciaDeTarjeta,
  Aviso,
  Boton,
  DefinicionesDeTinta,
  LogoDelNegocio,
  Sellos,
  esMontoCero,
  formatearBolivianos,
  variablesDeMarca,
} from '@repunto/ui';

import { miTarjeta } from '../../../lib/api/cliente';
import { fechaYHoraEnLaPaz } from '../../../lib/fechas';
import { explicacionDeEstado, tituloDeEstado, vencimientoDe } from '../../../lib/frases';
import { cerrarSesionDelTelefono } from '../../../lib/salir';
import { sesionDelTelefono } from '../../../lib/sesion';
import { BotonDeCodigo } from '../../componentes/BotonDeCodigo';
import { Pantalla } from '../../componentes/Pantalla';
import { useConsulta } from '../../componentes/usar-consulta';
import css from './Detalle.module.css';

/**
 * El detalle de una tarjeta (especificacion, seccion 10): los sellos, la
 * condicion vigente, cuando vence y el historial por fecha y local. La tarjeta
 * completa no es otra pantalla: es esta, con la franja del premio.
 */
export function Detalle({ id }: { id: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const leido = sesionDelTelefono().token();
    if (leido === null) router.replace('/');
    setToken(leido);
  }, [router]);

  if (typeof token !== 'string') return <Pantalla>{null}</Pantalla>;
  return <ConSesion id={id} token={token} />;
}

function ConSesion(p: { id: string; token: string }) {
  const router = useRouter();
  const consulta = useConsulta(`tarjeta:${p.id}`, esquemaDetalleDeTarjeta, (senal) =>
    miTarjeta(p.token, p.id, senal),
  );

  const sinSesion =
    consulta.tipo === 'error' &&
    consulta.fallo.tipo === 'rechazo' &&
    consulta.fallo.codigo === 'TOKEN_INVALIDO';
  useEffect(() => {
    if (!sinSesion) return;
    cerrarSesionDelTelefono();
    router.replace('/');
  }, [sinSesion, router]);

  const volver = (
    <Boton variante="texto" onClick={() => router.push('/')}>
      ‹ Mis tarjetas
    </Boton>
  );

  if (consulta.tipo === 'cargando') {
    return (
      <Pantalla>
        {volver}
        <p className={css.nota}>Buscando la tarjeta…</p>
      </Pantalla>
    );
  }
  if (consulta.tipo === 'error') {
    return (
      <Pantalla>
        {volver}
        {!sinSesion && <Aviso mensaje={consulta.fallo.mensaje} />}
      </Pantalla>
    );
  }

  const tarjeta = consulta.datos;
  // Con datos frescos, el reloj del servidor; con lo guardado sin conexion, el
  // del telefono: para contar dias alcanza.
  const ahora = consulta.guardado ? Date.now() : Date.parse(tarjeta.ahora);
  const sigue = tarjeta.estado === 'en_curso' || tarjeta.estado === 'completa';

  return (
    <Pantalla>
      <DefinicionesDeTinta />
      {volver}
      {consulta.guardado && (
        <p className={css.sinConexion}>Sin conexión: esto es lo último que vimos.</p>
      )}

      <article className={css.tarjeta} data-estado={tarjeta.estado}>
        <header
          className={css.marca}
          data-superficie="marca"
          style={variablesDeMarca(tarjeta.negocio.color_principal)}
        >
          <LogoDelNegocio
            nombre={tarjeta.negocio.nombre}
            url={tarjeta.negocio.logo_url}
          />
          <h1>{tarjeta.negocio.nombre}</h1>
        </header>

        <div className={css.cuerpo}>
          <p className={css.titulo}>{tituloDeEstado(tarjeta)}</p>
          <p className={css.explicacion}>{explicacionDeEstado(tarjeta.estado)}</p>
          <AparienciaDeTarjeta
            icono={tarjeta.negocio.icono_sello}
            plantilla={tarjeta.negocio.plantilla_tarjeta}
          >
            <Sellos progreso={tarjeta.progreso} faltan={tarjeta.faltan} nuevo={null} />
          </AparienciaDeTarjeta>
          <Datos tarjeta={tarjeta} ahora={ahora} sigue={sigue} />
        </div>
      </article>

      {sigue && tarjeta.condicion !== null && <Condicion condicion={tarjeta.condicion} />}
      <Historial sellos={tarjeta.sellos} />
      {sigue && <BotonDeCodigo />}
    </Pantalla>
  );
}

function Datos(p: { tarjeta: DetalleDeTarjeta; ahora: number; sigue: boolean }) {
  const vence = vencimientoDe(p.tarjeta, p.ahora);
  return (
    <dl className={css.datos}>
      <div>
        <dt>Premio</dt>
        <dd>{p.tarjeta.premio}</dd>
      </div>
      {p.sigue && p.tarjeta.canje_en !== null && (
        <div>
          <dt>Se entrega en</dt>
          <dd>la sucursal {p.tarjeta.canje_en}</dd>
        </div>
      )}
      {vence !== null && (
        <div>
          <dt>Vencimiento</dt>
          <dd>{vence}</dd>
        </div>
      )}
    </dl>
  );
}

function Condicion(p: { condicion: NonNullable<DetalleDeTarjeta['condicion']> }) {
  const monto = p.condicion.monto_minimo;
  return (
    <section className={css.seccion}>
      <h2>Para sumar un sello</h2>
      <p>{p.condicion.texto}</p>
      {monto !== null && !esMontoCero(monto) && (
        <p className={css.monto}>
          Compra mínima <strong>{formatearBolivianos(monto)}</strong>
        </p>
      )}
    </section>
  );
}

function Historial(p: { sellos: DetalleDeTarjeta['sellos'] }) {
  return (
    <section className={css.seccion}>
      <h2>Tus sellos</h2>
      {p.sellos.length === 0 ? (
        <p className={css.nota}>Todavía no tenés sellos en esta tarjeta.</p>
      ) : (
        <ol className={css.historial}>
          {p.sellos.map((sello) => (
            <li key={`${sello.fecha}-${sello.local}`}>
              <span>{fechaYHoraEnLaPaz(sello.fecha)}</span>
              <span className={css.local}>{sello.local}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
