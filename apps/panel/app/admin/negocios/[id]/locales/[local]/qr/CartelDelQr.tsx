'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LocalDelAdmin, NegocioDelDueno } from '@repunto/contratos';
import {
  Aviso,
  Boton,
  BotonDeDosToques,
  LogoDelNegocio,
  variablesDeMarca,
} from '@repunto/ui';

import * as api from '../../../../../../../lib/api/admin';
import type { Fallo, Respuesta } from '../../../../../../../lib/api/http';
import { urlDeLaAppDelCliente } from '../../../../../../../lib/configuracion';
import { dibujarQr, direccionDelQr } from '../../../../../../../lib/qr-del-local';
import css from '../../../../../Admin.module.css';
import { useSesionDeAdmin } from '../../../../../usar-sesion';
import estilos from './Cartel.module.css';

/** Lo que el cartel necesita: la marca del negocio y sus locales. */
export interface DatosDelCartel {
  marca: NegocioDelDueno['marca'];
  locales: LocalDelAdmin[];
}

/** De dónde sale el cartel: la ficha del admin o el panel del dueño. */
export interface FuenteDelCartel {
  cargar: (senal?: AbortSignal) => Promise<Respuesta<DatosDelCartel>>;
  cambiarQr: (local: string) => Promise<Respuesta<unknown>>;
  /** El texto a mostrar; null si la sesión se perdió y ya se fue a entrar. */
  fallo: (f: Fallo) => string | null;
  volver: { href: string; texto: string };
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; datos: DatosDelCartel }
  | { tipo: 'error'; mensaje: string };

/** El cartel desde la ficha del admin: /admin/negocios/:id/locales/:local/qr. */
export function CartelDelAdmin() {
  const { id, local } = useParams<{ id: string; local: string }>();
  const { aEntrar } = useSesionDeAdmin();
  const fuente = useMemo<FuenteDelCartel>(
    () => ({
      cargar: async (senal) => {
        const r = await api.ficha(id, senal);
        if (!r.ok) return r;
        const { nombre, color_principal, logo_url, locales } = r.datos;
        return { ...r, datos: { marca: { nombre, color_principal, logo_url }, locales } };
      },
      cambiarQr: (elLocal) => api.cambiarQr(id, elLocal),
      fallo: (f) => {
        if (!api.sesionPerdida(f)) return api.mensajeParaElAdmin(f);
        aEntrar();
        return null;
      },
      volver: { href: `/admin/negocios/${id}`, texto: 'Volver a la ficha' },
    }),
    [id, aEntrar],
  );
  return <CartelDelQr localId={local} fuente={fuente} />;
}

/**
 * El cartel del mostrador: el negocio, la sucursal y el QR que lleva al alta.
 * No lleva la promo: el cartel queda pegado meses, y la promo cambia cuando
 * el negocio quiere. El cliente la ve en el telefono, siempre al dia.
 */
export function CartelDelQr({
  localId,
  fuente,
}: {
  localId: string;
  fuente: FuenteDelCartel;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [cambiando, setCambiando] = useState(false);
  const [avisoDelCambio, setAvisoDelCambio] = useState<string | null>(null);

  const cargar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await fuente.cargar(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', datos: r.datos });
      const mensaje = fuente.fallo(r);
      if (mensaje !== null) setEstado({ tipo: 'error', mensaje });
    },
    [fuente],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  // Si una foto del QR anda circulando, la gente se anota desde la casa: un
  // QR nuevo deja sin efecto el cartel pegado, y hay que imprimir este.
  const cambiarQr = async () => {
    setCambiando(true);
    setAvisoDelCambio(null);
    const r = await fuente.cambiarQr(localId);
    if (r.ok) {
      await cargar();
      setCambiando(false);
      return setAvisoDelCambio(
        'Listo: QR nuevo. Imprimilo y reemplazá el cartel pegado.',
      );
    }
    setCambiando(false);
    setAvisoDelCambio(fuente.fallo(r));
  };

  const volver = (
    <Link href={fuente.volver.href} className={estilos.volver}>
      ‹ {fuente.volver.texto}
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

  const { marca, locales } = estado.datos;
  const local = locales.find((l) => l.id === localId);
  if (local === undefined) {
    return (
      <main className={css.pantalla}>
        {volver}
        <Aviso mensaje="Ese local no está en este negocio." />
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
          <Aviso mensaje="Este local está cerrado: su QR no anota a nadie hasta que se reabra." />
        )}
        <Boton onClick={() => window.print()}>Imprimir</Boton>
        <p className={css.texto}>
          Se imprime solo el cartel. Pegalo cerca de la caja, a la altura de los ojos.
        </p>
        <p className={css.texto}>
          ¿Una foto de este QR anda circulando? Cambialo: el cartel pegado deja de anotar
          gente y hay que imprimir el nuevo.
        </p>
        <BotonDeDosToques
          texto="Cambiar el QR"
          confirmar="Tocá de nuevo: el cartel pegado deja de servir"
          trabajando={cambiando}
          textoTrabajando="Cambiando…"
          disabled={cambiando}
          alConfirmar={() => void cambiarQr()}
        />
        {avisoDelCambio !== null && <p className={css.texto}>{avisoDelCambio}</p>}
      </div>

      <article className={estilos.cartel}>
        <header
          className={estilos.marca}
          data-superficie="marca"
          style={variablesDeMarca(marca.color_principal)}
        >
          <LogoDelNegocio nombre={marca.nombre} url={marca.logo_url} />
          <h1>{marca.nombre}</h1>
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
