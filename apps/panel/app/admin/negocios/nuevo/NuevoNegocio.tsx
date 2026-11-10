'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IMAGENES_DEL_NEGOCIO, type ImagenDelNegocio } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import { BORRADOR_INICIAL, revisar } from '../../../../lib/alta-de-negocio';
import * as api from '../../../../lib/api/admin';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import css from '../../Admin.module.css';
import { useSesionDeAdmin } from '../../usar-sesion';
import {
  CamposDeCondicion,
  CamposDeDatos,
  CamposDePrograma,
  useFormulario,
} from '../Campos';
import estilos from '../Negocios.module.css';
import {
  BotonDeArchivo,
  type Eleccion,
  TEXTOS_DE_IMAGEN,
  elegirImagen,
} from '../[id]/Imagenes';
import { VistaPrevia } from './VistaPrevia';

type Elegidas = Record<ImagenDelNegocio, Eleccion>;

/**
 * El alta de un negocio: datos, apariencia, logo y portada, promo y
 * condicion, todo junto, con la tarjeta a la vista. Que se pueda dar de alta
 * lo decide la api; aca solo se avisa que corregir antes de mandar
 * (`revisar`).
 *
 * Las imagenes necesitan el negocio ya creado: se suben despues del alta.
 * Si una no sube, el negocio queda igual y la ficha dice cual falta.
 */
export function NuevoNegocio() {
  const router = useRouter();
  const { aEntrar } = useSesionDeAdmin();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Lo que decia el aviso ya puede no ser cierto: se vuelve a revisar al mandar.
  const f = useFormulario(
    BORRADOR_INICIAL,
    useCallback(() => setAviso(null), []),
  );
  // Una clave por alta: si la respuesta no llega y se vuelve a tocar, viaja
  // la misma y la api no crea dos negocios.
  const idempotencia = useRef(crearGestorDeIdempotencia());
  const [imagenes, setImagenes] = useState<Elegidas>({ logo: null, portada: null });

  const enviar = async () => {
    if (enviando) return;
    setAviso(null);
    const revision = revisar(f.b);
    if (!revision.ok) {
      f.setProblemas(revision.problemas);
      setAviso('Faltan datos o hay algo para corregir: está marcado en rojo.');
      return;
    }
    f.setProblemas({});
    setEnviando(true);
    const firma = `alta:${JSON.stringify(revision.peticion)}`;
    const r = await api.crearNegocio(
      revision.peticion,
      idempotencia.current.clavePara(firma),
    );
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      const faltan: ImagenDelNegocio[] = [];
      for (const imagen of IMAGENES_DEL_NEGOCIO) {
        const elegida = imagenes[imagen];
        if (elegida === null) continue;
        const subida = await api.subirImagen(r.datos.id, imagen, elegida.archivo);
        if (!subida.ok) faltan.push(imagen);
      }
      const consulta = faltan.length === 0 ? '' : `?faltan=${faltan.join(',')}`;
      router.push(`/admin/negocios/${r.datos.id}${consulta}`);
      return;
    }
    setEnviando(false);
    if (r.tipo === 'rechazo') {
      idempotencia.current.olvidar(firma);
      if (api.sesionPerdida(r)) return aEntrar();
      setAviso(api.mensajeParaElAdmin(r));
      return;
    }
    setAviso(
      `${api.mensajeParaElAdmin(r)} Si volvés a tocar "Dar de alta", no se crea dos veces.`,
    );
  };

  return (
    <main className={css.pantalla}>
      <header>
        <Link href="/admin/negocios" className={estilos.volver}>
          ‹ Negocios
        </Link>
        <h1 className={css.titulo}>Nuevo negocio</h1>
      </header>

      <div className={estilos.alta}>
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>El negocio y cómo se ve</legend>
            <CamposDeDatos f={f} logo={imagenes.logo?.vista ?? null} />
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>Logo y portada</legend>
            <p className={estilos.ayuda}>
              Opcionales: se pueden subir después desde la ficha.
            </p>
            <div className={estilos.imagenes}>
              {IMAGENES_DEL_NEGOCIO.map((imagen) => (
                <ImagenDelAlta
                  key={imagen}
                  imagen={imagen}
                  eleccion={imagenes[imagen]}
                  deshabilitado={enviando}
                  alCambiar={(eleccion) =>
                    setImagenes((actuales) => ({ ...actuales, [imagen]: eleccion }))
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>La promo</legend>
            <CamposDePrograma f={f} />
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>La condición del sello</legend>
            <p className={estilos.ayuda}>
              Qué compra suma un sello. El negocio la puede cambiar cuando quiera; queda
              firmada por Administración.
            </p>
            <CamposDeCondicion f={f} />
          </fieldset>

          {aviso !== null && <Aviso mensaje={aviso} />}
          <Boton type="submit" tamano="grande" disabled={enviando}>
            {enviando ? 'Dando de alta…' : 'Dar de alta'}
          </Boton>
        </form>

        <VistaPrevia borrador={f.b} logoUrl={imagenes.logo?.vista ?? null} />
      </div>
    </main>
  );
}

/** Elegir el logo o la portada antes del alta: se ve, se cambia o se saca. */
function ImagenDelAlta(p: {
  imagen: ImagenDelNegocio;
  eleccion: Eleccion;
  deshabilitado: boolean;
  alCambiar: (eleccion: Eleccion) => void;
}) {
  const textos = TEXTOS_DE_IMAGEN[p.imagen];
  const [preparando, setPreparando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { eleccion } = p;

  // La vista previa es una dirección del navegador: se libera al cambiarla.
  useEffect(() => {
    if (eleccion === null) return;
    return () => URL.revokeObjectURL(eleccion.vista);
  }, [eleccion]);

  const elegir = async (archivo: File) => {
    setAviso(null);
    setPreparando(true);
    const r = await elegirImagen(archivo, p.imagen);
    setPreparando(false);
    if (!r.ok) return setAviso(r.mensaje);
    p.alCambiar(r.eleccion);
  };

  return (
    <div className={estilos.imagen} data-imagen={p.imagen}>
      <h3 className={estilos.subtitulo}>{textos.titulo}</h3>
      <p className={estilos.ayuda}>{textos.ayuda}</p>
      <div className={estilos.marcoDeImagen}>
        {eleccion === null ? (
          <p className={estilos.ayuda}>{textos.vacia}</p>
        ) : (
          <img src={eleccion.vista} alt={textos.alt} />
        )}
      </div>
      <div className={estilos.acciones}>
        <BotonDeArchivo
          id={`alta-${p.imagen}`}
          texto={
            preparando ? 'Preparando…' : eleccion === null ? 'Elegir imagen' : 'Cambiar'
          }
          deshabilitado={preparando || p.deshabilitado}
          alElegir={(archivo) => void elegir(archivo)}
        />
        {eleccion !== null && (
          <Boton
            variante="texto"
            disabled={p.deshabilitado}
            onClick={() => p.alCambiar(null)}
          >
            Sacar
          </Boton>
        )}
      </div>
      {aviso !== null && <Aviso mensaje={aviso} />}
    </div>
  );
}
