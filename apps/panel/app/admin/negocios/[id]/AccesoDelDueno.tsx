'use client';

import { useEffect, useRef, useState } from 'react';
import type { EntradaDelDueno, PersonaDelAdmin } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import {
  chatDeWhatsApp,
  direccionDeEntrada,
  mensajeDeAcceso,
} from '../../../../lib/acceso-del-dueno';
import * as api from '../../../../lib/api/admin';
import type { Fallo } from '../../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import { fechaYHora } from '../../../../lib/fechas';
import estilos from '../Negocios.module.css';

/**
 * El código para que el dueño entre a su panel, mientras no exista WhatsApp:
 * se genera al abrir esto, y el admin copia el mensaje armado y se lo manda
 * por su cuenta. Generar otro no invalida el anterior; cada uno sirve una vez.
 */
export function AccesoDelDueno(p: {
  negocio: string;
  persona: PersonaDelAdmin;
  fallo: (f: Fallo) => string | null;
  alTerminar: () => void;
}) {
  const [entrada, setEntrada] = useState<EntradaDelDueno | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Si la respuesta no llega y se reintenta, viaja la misma clave y la api
  // devuelve el mismo código en lugar de dejar dos.
  const idempotencia = useRef(crearGestorDeIdempotencia());
  const firma = `entrada:${p.persona.id}`;

  const generar = async () => {
    setAviso(null);
    const r = await api.generarEntradaDelDueno(
      p.negocio,
      p.persona.id,
      idempotencia.current.clavePara(firma),
    );
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      return setEntrada(r.datos);
    }
    if (r.tipo === 'rechazo') idempotencia.current.olvidar(firma);
    setAviso(p.fallo(r));
  };

  // Una sola vez al abrir: un código nuevo por cada vez que se toca el botón.
  // Si React lo monta dos veces (modo estricto), el segundo pedido viaja con
  // la misma clave y recibe el mismo código.
  useEffect(() => {
    void generar();
  }, []);

  if (entrada === null) {
    return (
      <div className={estilos.codigoDeVinculacion} role="status">
        {aviso === null ? (
          <p>Generando el código…</p>
        ) : (
          <>
            <Aviso mensaje={aviso} />
            <div className={estilos.acciones}>
              <Boton variante="secundario" onClick={() => void generar()}>
                Probar de nuevo
              </Boton>
              <Boton variante="texto" onClick={p.alTerminar}>
                Cancelar
              </Boton>
            </div>
          </>
        )}
      </div>
    );
  }

  const mensaje = mensajeDeAcceso({
    nombre: p.persona.nombre,
    entrada,
    direccion: direccionDeEntrada(window.location.origin),
    fechaYHora,
  });
  const chat = chatDeWhatsApp(p.persona.telefono);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
    } catch {
      setAviso('No se pudo copiar solo: seleccioná el mensaje y copialo a mano.');
    }
  };

  return (
    <div className={estilos.codigoDeVinculacion} role="status">
      <p>Mandale este mensaje a {p.persona.nombre}:</p>
      <output aria-label="Código de entrada del dueño">{entrada.codigo}</output>
      <textarea
        className={estilos.mensajeParaCopiar}
        readOnly
        value={mensaje}
        rows={7}
        aria-label="Mensaje para el dueño"
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className={estilos.ayuda}>
        Si vence sin usarse, generá otro desde acá. Cuando WhatsApp esté conectado, le va
        a llegar solo.
      </p>
      {aviso !== null && <Aviso mensaje={aviso} />}
      <div className={estilos.acciones}>
        <Boton onClick={() => void copiar()}>
          {copiado ? 'Copiado' : 'Copiar mensaje'}
        </Boton>
        {chat !== null && (
          <a
            className={estilos.enlaceSimple}
            href={chat}
            target="_blank"
            rel="noreferrer"
          >
            Abrir su WhatsApp
          </a>
        )}
        <Boton variante="secundario" onClick={p.alTerminar}>
          Listo
        </Boton>
      </div>
    </div>
  );
}
