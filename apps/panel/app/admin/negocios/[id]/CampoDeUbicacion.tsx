'use client';

import { useState } from 'react';
import { leerUbicacion, textoDeUbicacion } from '@repunto/contratos';
import { Boton } from '@repunto/ui';

import { vistaDeUbicacion } from '../../../../lib/locales-del-admin';
import { Etiquetado } from '../Campos';
import estilos from '../Negocios.module.css';

/** Más que esto, el GPS no sirve para marcar una puerta: que la revise. */
const METROS_DE_PRECISION_ACEPTABLE = 50;

/**
 * Dónde está el local en el mapa. Sin clave de Google: se pegan los números
 * que copia Google Maps, o se toma la ubicación del teléfono estando en el
 * local. "Revisar en Google Maps" abre el punto para confirmarlo.
 */
export function CampoDeUbicacion(p: {
  id: string;
  valor: string;
  problema: string | undefined;
  alCambiar: (valor: string) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const vista = vistaDeUbicacion(p.valor);
  const id = `local-ubicacion-${p.id}`;

  const usarMiUbicacion = () => {
    if (!('geolocation' in navigator)) {
      setAviso('Este navegador no da la ubicación. Pegá los números de Google Maps.');
      return;
    }
    setBuscando(true);
    setAviso(null);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setBuscando(false);
        const { latitude, longitude, accuracy } = posicion.coords;
        const lectura = leerUbicacion(`${latitude}, ${longitude}`);
        if (!lectura.ok) {
          setAviso('La ubicación que dio el teléfono no se entiende. Pegá los números.');
          return;
        }
        p.alCambiar(textoDeUbicacion(lectura.ubicacion));
        if (accuracy > METROS_DE_PRECISION_ACEPTABLE) {
          setAviso(
            `Es aproximada (unos ${Math.round(accuracy)} metros): revisala en Google Maps antes de guardar.`,
          );
        }
      },
      (error) => {
        setBuscando(false);
        setAviso(
          error.code === error.PERMISSION_DENIED
            ? 'El navegador no dio permiso para la ubicación. Pegá los números de Google Maps.'
            : 'No se pudo tomar la ubicación. Probá de nuevo, o pegá los números de Google Maps.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return (
    <div className={estilos.etiquetado}>
      <Etiquetado id={id} titulo="Ubicación en el mapa (opcional)" problema={p.problema}>
        <input
          id={id}
          className={estilos.entrada}
          value={p.valor}
          inputMode="text"
          placeholder="-17.7833, -63.1821"
          autoComplete="off"
          onChange={(e) => {
            setAviso(null);
            p.alCambiar(e.target.value);
          }}
        />
      </Etiquetado>
      <p className={estilos.ayuda}>
        En Google Maps, mantené apretado sobre la puerta del local (en la computadora,
        clic derecho) y copiá los números que aparecen. Si estás en el local, tocá
        &quot;Usar mi ubicación&quot;.
      </p>
      <div className={estilos.acciones}>
        <Boton variante="secundario" disabled={buscando} onClick={usarMiUbicacion}>
          {buscando ? 'Buscando…' : 'Usar mi ubicación'}
        </Boton>
        {vista.enlace !== null && (
          <a
            className={estilos.enlaceDeAccion}
            href={vista.enlace}
            target="_blank"
            rel="noopener noreferrer"
          >
            Revisar en Google Maps
          </a>
        )}
      </div>
      {vista.aviso !== null && <p className={estilos.error}>{vista.aviso}</p>}
      {aviso !== null && <p className={estilos.error}>{aviso}</p>}
    </div>
  );
}
