'use client';

import { useEffect, useState } from 'react';
import type { FichaDelNegocio, ImagenDelNegocio } from '@repunto/contratos';
import { Aviso, Boton, BotonDeDosToques } from '@repunto/ui';

import * as api from '../../../../lib/api/admin';
import type { Fallo } from '../../../../lib/api/http';
import { ACEPTA, achicarImagen } from '../../../../lib/imagen';
import estilos from '../Negocios.module.css';

interface Props {
  ficha: FichaDelNegocio;
  fallo: (f: Fallo) => string | null;
  /** Vuelve a pedir la ficha: la imagen nueva se ve en la vista previa. */
  alCambiar: () => void;
}

export const TEXTOS_DE_IMAGEN: Record<
  ImagenDelNegocio,
  { titulo: string; ayuda: string; vacia: string; alt: string }
> = {
  logo: {
    titulo: 'Logo',
    ayuda: 'Va en la tarjeta, en el directorio y en el cartel del QR. Mejor cuadrado.',
    vacia: 'Sin logo: se muestra la inicial del nombre.',
    alt: 'El logo del negocio',
  },
  portada: {
    titulo: 'Foto de portada',
    ayuda: 'Va arriba del detalle de la tarjeta, en el teléfono. Mejor horizontal.',
    vacia: 'Sin portada: se usa el color del negocio.',
    alt: 'La foto de portada del negocio',
  },
};

/**
 * El logo y la portada. Se eligen desde la computadora o el teléfono, se
 * achican en el navegador y se suben a R2; en la base queda la dirección.
 */
export function SeccionImagenes(p: Props) {
  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>Logo y portada</h2>
      <div className={estilos.imagenes}>
        <CampoDeImagen {...p} imagen="logo" actual={p.ficha.logo_url} />
        <CampoDeImagen {...p} imagen="portada" actual={p.ficha.portada_url} />
      </div>
    </section>
  );
}

/** Una imagen elegida y ya achicada, con su dirección del navegador para verla. */
export type Eleccion = { archivo: Blob; vista: string } | null;

/**
 * Lo común a la ficha y al alta: elegir el archivo y achicarlo. Devuelve la
 * imagen lista, o el texto de por qué no sirve.
 */
export async function elegirImagen(
  archivo: File,
  imagen: ImagenDelNegocio,
): Promise<
  { ok: true; eleccion: NonNullable<Eleccion> } | { ok: false; mensaje: string }
> {
  const achicada = await achicarImagen(archivo, imagen);
  if (!achicada.ok) return achicada;
  return {
    ok: true,
    eleccion: { archivo: achicada.archivo, vista: URL.createObjectURL(achicada.archivo) },
  };
}

/**
 * El botón que abre el selector de archivos: una etiqueta con el campo
 * oculto, para que se vea como los demás botones.
 */
export function BotonDeArchivo(p: {
  id: string;
  texto: string;
  deshabilitado: boolean;
  alElegir: (archivo: File) => void;
}) {
  return (
    <>
      <label
        htmlFor={p.id}
        className={estilos.enlaceDeAccion}
        aria-disabled={p.deshabilitado}
      >
        {p.texto}
      </label>
      <input
        id={p.id}
        className={estilos.oculto}
        type="file"
        accept={ACEPTA}
        disabled={p.deshabilitado}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          // Elegir el mismo archivo otra vez también tiene que avisar.
          e.target.value = '';
          if (archivo !== undefined) p.alElegir(archivo);
        }}
      />
    </>
  );
}

function CampoDeImagen(p: Props & { imagen: ImagenDelNegocio; actual: string | null }) {
  const textos = TEXTOS_DE_IMAGEN[p.imagen];
  const [eleccion, setEleccion] = useState<Eleccion>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const id = `imagen-${p.imagen}`;

  // La vista previa es una dirección del navegador: se libera al cambiarla.
  useEffect(() => {
    if (eleccion === null) return;
    return () => URL.revokeObjectURL(eleccion.vista);
  }, [eleccion]);

  const elegir = async (archivo: File) => {
    setAviso(null);
    setTrabajando(true);
    const r = await elegirImagen(archivo, p.imagen);
    setTrabajando(false);
    if (!r.ok) return setAviso(r.mensaje);
    setEleccion(r.eleccion);
  };

  const guardar = async () => {
    if (eleccion === null) return;
    setTrabajando(true);
    setAviso(null);
    const r = await api.subirImagen(p.ficha.id, p.imagen, eleccion.archivo);
    setTrabajando(false);
    if (r.ok) {
      setEleccion(null);
      return p.alCambiar();
    }
    setAviso(p.fallo(r));
  };

  const quitar = async () => {
    setTrabajando(true);
    setAviso(null);
    const r = await api.quitarImagen(p.ficha.id, p.imagen);
    setTrabajando(false);
    if (r.ok) return p.alCambiar();
    setAviso(p.fallo(r));
  };

  const mostrada = eleccion?.vista ?? p.actual;

  return (
    <div className={estilos.imagen} data-imagen={p.imagen}>
      <h3 className={estilos.subtitulo}>{textos.titulo}</h3>
      <p className={estilos.ayuda}>{textos.ayuda}</p>
      <div className={estilos.marcoDeImagen}>
        {mostrada === null ? (
          <p className={estilos.ayuda}>{textos.vacia}</p>
        ) : (
          <img src={mostrada} alt={textos.alt} />
        )}
      </div>

      {eleccion !== null ? (
        <div className={estilos.acciones}>
          <Boton disabled={trabajando} onClick={() => void guardar()}>
            {trabajando ? 'Subiendo…' : `Guardar ${textos.titulo.toLowerCase()}`}
          </Boton>
          <Boton variante="texto" disabled={trabajando} onClick={() => setEleccion(null)}>
            Cancelar
          </Boton>
        </div>
      ) : (
        <div className={estilos.acciones}>
          <BotonDeArchivo
            id={id}
            texto={
              trabajando ? 'Preparando…' : p.actual === null ? 'Elegir imagen' : 'Cambiar'
            }
            deshabilitado={trabajando}
            alElegir={(archivo) => void elegir(archivo)}
          />
          {p.actual !== null && (
            <BotonDeDosToques
              texto="Quitar"
              confirmar="Tocá de nuevo: se deja de mostrar"
              trabajando={trabajando}
              textoTrabajando="Quitando…"
              disabled={trabajando}
              alConfirmar={() => void quitar()}
            />
          )}
        </div>
      )}
      {aviso !== null && <Aviso mensaje={aviso} />}
    </div>
  );
}
