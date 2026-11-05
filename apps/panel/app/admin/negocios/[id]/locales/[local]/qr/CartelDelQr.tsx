'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { FichaDelNegocio } from '@repunto/contratos';
import { Aviso, Boton, LogoDelNegocio, variablesDeMarca } from '@repunto/ui';

import * as api from '../../../../../../../lib/api/admin';
import { urlDeLaAppDelCliente } from '../../../../../../../lib/configuracion';
import { dibujarQr, direccionDelQr } from '../../../../../../../lib/qr-del-local';
import css from '../../../../../Admin.module.css';
import { useSesionDeAdmin } from '../../../../../usar-sesion';
import estilos from './Cartel.module.css';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; ficha: FichaDelNegocio }
  | { tipo: 'error'; mensaje: string };

/**
 * El cartel del mostrador: el negocio, la sucursal y el QR que lleva al alta.
 * No lleva la promo: el cartel queda pegado meses, y la promo cambia cuando
 * el negocio quiere. El cliente la ve en el telefono, siempre al dia.
 */
export function CartelDelQr() {
  const { id, local: localId } = useParams<{ id: string; local: string }>();
  const { aEntrar } = useSesionDeAdmin();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.ficha(id, senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', ficha: r.datos });
      if (api.sesionPerdida(r)) return aEntrar();
      setEstado({ tipo: 'error', mensaje: api.mensajeParaElAdmin(r) });
    },
    [id, aEntrar],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  const volver = (
    <Link href={`/admin/negocios/${id}`} className={estilos.volver}>
      ‹ Volver a la ficha
    </Link>
  );

  if (estado.tipo === 'cargando') {
    return (
      <main className={css.pantalla}>
        {volver}
        <p className={css.texto}>Cargando el QR…</p>
      </main>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <main className={css.pantalla}>
        {volver}
        <Aviso mensaje={estado.mensaje} />
      </main>
    );
  }

  const { ficha } = estado;
  const local = ficha.locales.find((l) => l.id === localId);
  if (local === undefined) {
    return (
      <main className={css.pantalla}>
        {volver}
        <Aviso mensaje="Ese local no está en este negocio. Volvé a la ficha." />
      </main>
    );
  }
  if (urlDeLaAppDelCliente === null) {
    return (
      <main className={css.pantalla}>
        {volver}
        <Aviso mensaje="Falta configurar la dirección de la app del cliente (NEXT_PUBLIC_URL_CLIENTE). Sin ella el QR llevaría a otro lado: no se imprime." />
      </main>
    );
  }

  const direccion = direccionDelQr(urlDeLaAppDelCliente, local.qr_slug);
  const qr = dibujarQr(direccion);

  return (
    <main className={estilos.hoja}>
      <div className={estilos.herramientas}>
        {volver}
        {!local.activo && (
          <Aviso mensaje="Este local está cerrado: su QR no anota a nadie hasta que lo reabras." />
        )}
        <Boton onClick={() => window.print()}>Imprimir</Boton>
        <p className={css.texto}>
          Se imprime solo el cartel. Pegalo cerca de la caja, a la altura de los ojos.
        </p>
      </div>

      <article className={estilos.cartel}>
        <header
          className={estilos.marca}
          data-superficie="marca"
          style={variablesDeMarca(ficha.color_principal)}
        >
          <LogoDelNegocio nombre={ficha.nombre} url={ficha.logo_url} />
          <h1>{ficha.nombre}</h1>
        </header>
        <div className={estilos.cuerpo}>
          <p className={estilos.sucursal}>{local.nombre}</p>
          <h2 className={estilos.llamado}>Juntá sellos acá</h2>
          <p className={estilos.pasos}>
            Escaneá con la cámara del teléfono, escribí tu número y avisale a quien te
            atiende.
          </p>
          <svg
            className={estilos.qr}
            viewBox={`0 0 ${qr.lado} ${qr.lado}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label={`QR que lleva a ${direccion}`}
          >
            <rect width={qr.lado} height={qr.lado} className={estilos.fondoDelQr} />
            <path d={qr.camino} className={estilos.modulos} />
          </svg>
          <p className={estilos.direccion}>{direccion.replace(/^https?:\/\//, '')}</p>
        </div>
      </article>
    </main>
  );
}
