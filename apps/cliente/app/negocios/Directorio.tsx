'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  enlaceParaLlegar,
  esquemaDirectorio,
  esquemaMisTarjetas,
} from '@repunto/contratos';
import { Aviso, Boton, LogoDelNegocio, variablesDeMarca } from '@repunto/ui';

import { negocios } from '../../lib/api/cliente';
import {
  type NegocioEnElDirectorio,
  agruparPorRubro,
  promoDe,
} from '../../lib/directorio';
import { ultimoDelTelefono } from '../../lib/ultimo';
import { NombreDeLaApp, Pantalla } from '../componentes/Pantalla';
import { useConsulta } from '../componentes/usar-consulta';
import css from './Directorio.module.css';

/**
 * "Dónde juntar sellos": los negocios adheridos, para mirar. No hay boton de
 * alta a proposito: anotarse exige el QR del mostrador (especificacion,
 * seccion 10). Se ve sin conexion, como las tarjetas.
 */
export function Directorio() {
  const router = useRouter();
  const consulta = useConsulta('negocios', esquemaDirectorio, (senal) => negocios(senal));
  const conTarjeta = useNegociosConTarjeta();

  return (
    <Pantalla>
      <Boton variante="texto" onClick={() => router.push('/')}>
        ‹ Inicio
      </Boton>
      <NombreDeLaApp />
      <section className={css.encabezado}>
        <h1>Dónde juntar sellos</h1>
        <p>
          Estos negocios usan Repunto. Para sumarte, pedí tu tarjeta en el mostrador y
          escaneá el QR.
        </p>
      </section>

      {consulta.tipo === 'cargando' && <p className={css.nota}>Buscando negocios…</p>}
      {consulta.tipo === 'error' && <Aviso mensaje={consulta.fallo.mensaje} />}

      {consulta.tipo === 'listo' && (
        <>
          {consulta.guardado && (
            <p className={css.sinConexion}>Sin conexión: esto es lo último que vimos.</p>
          )}
          {consulta.datos.negocios.length === 0 ? (
            <p className={css.nota}>Todavía no hay negocios adheridos.</p>
          ) : (
            agruparPorRubro(consulta.datos.negocios, conTarjeta).map((rubro) => (
              <section key={rubro.categoria} className={css.rubro}>
                <h2>{rubro.titulo}</h2>
                <ul className={css.lista}>
                  {rubro.negocios.map((item) => (
                    <li key={item.negocio.id}>
                      <Negocio item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </Pantalla>
  );
}

function Negocio({ item }: { item: NegocioEnElDirectorio }) {
  const { negocio } = item;
  return (
    <article className={css.negocio}>
      <header
        className={css.marca}
        data-superficie="marca"
        style={variablesDeMarca(negocio.color_principal)}
      >
        <LogoDelNegocio nombre={negocio.nombre} url={negocio.logo_url} />
        <h3>{negocio.nombre}</h3>
      </header>
      <div className={css.cuerpo}>
        <p className={css.promo}>{promoDe(negocio)}</p>
        <ul className={css.locales}>
          {negocio.locales.map((local) => (
            <li key={`${local.nombre}|${local.direccion}`} className={css.local}>
              <span>
                <strong>{local.nombre}</strong> · {local.direccion}
              </span>
              {/* Abre Google Maps con el recorrido: en la app, si el
                  telefono la tiene. Sin clave ni costo. */}
              <a
                className={css.comoLlegar}
                href={enlaceParaLlegar(local)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Cómo llegar
              </a>
            </li>
          ))}
        </ul>
        <p className={item.tieneTarjeta ? css.yaTiene : css.comoSumarse}>
          {item.tieneTarjeta ? 'Ya tenés tarjeta acá' : 'Pedí tu tarjeta en el mostrador'}
        </p>
      </div>
    </article>
  );
}

/**
 * Los negocios de las tarjetas que el telefono ya vio, sin pedirlas de nuevo:
 * es lo que guardo la lista de "Mis tarjetas". Sin sesion, o si todavia no se
 * abrio la lista, ninguno: el directorio se ve igual, sin la marca.
 */
function useNegociosConTarjeta(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const guardadas = ultimoDelTelefono().leer('tarjetas', esquemaMisTarjetas);
    if (guardadas !== null) {
      setIds(new Set(guardadas.tarjetas.map((t) => t.negocio.id)));
    }
  }, []);
  return ids;
}
