'use client';

import { useRef, useState } from 'react';
import type {
  CodigoDeVinculacion,
  LocalDelAdmin,
  TabletDelAdmin,
} from '@repunto/contratos';
import { Aviso, Boton, BotonDeDosToques } from '@repunto/ui';

import type { Fallo } from '../../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import type {
  EquipoDelNegocio,
  OperacionesDelNegocio,
} from '../../../../lib/api/operaciones';
import { fechaYHora, hora } from '../../../../lib/fechas';
import {
  saludDeTablet,
  tabletsDelLocal,
  textoDeRevocada,
} from '../../../../lib/tablets-del-admin';
import estilos from '../Negocios.module.css';

interface Props {
  negocio: EquipoDelNegocio;
  ops: OperacionesDelNegocio;
  local: LocalDelAdmin;
  fallo: (f: Fallo) => string | null;
  alCambiar: () => void;
}

/**
 * Las tablets de un local: cada una con su último sello, el código para
 * vincular una nueva y la revocación de una perdida. Es lo que reemplaza a
 * `pnpm tablets`: el admin el día de la capacitación, el dueño después.
 */
export function TabletsDelLocal(p: Props) {
  const { activas, revocadas } = tabletsDelLocal(p.negocio, p.local.id);
  const [codigo, setCodigo] = useState<CodigoDeVinculacion | null>(null);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Si la respuesta no llega y se vuelve a tocar, viaja la misma clave y la
  // api devuelve el mismo código en lugar de dejar dos pendientes.
  const idempotencia = useRef(crearGestorDeIdempotencia());
  const ahora = new Date();

  const generar = async () => {
    if (generando) return;
    const firma = `vinculacion:${p.local.id}`;
    setGenerando(true);
    setAviso(null);
    const r = await p.ops.generarCodigoDeVinculacion(
      p.local.id,
      idempotencia.current.clavePara(firma),
    );
    setGenerando(false);
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      return setCodigo(r.datos);
    }
    if (r.tipo === 'rechazo') idempotencia.current.olvidar(firma);
    setAviso(p.fallo(r));
  };

  // Un local cerrado sin tablets no tiene nada que mostrar acá.
  if (!p.local.activo && activas.length === 0 && revocadas.length === 0) return null;

  return (
    <div className={estilos.tablets}>
      <h3 className={estilos.subtitulo}>Tablets</h3>
      {activas.length === 0 ? (
        <p className={estilos.ayuda}>
          {p.local.activo
            ? 'Ninguna tablet vinculada: en este local todavía no se puede sellar.'
            : 'Ninguna tablet activa.'}
        </p>
      ) : (
        <ul className={estilos.locales}>
          {activas.map((t) => (
            <FilaDeTablet key={t.id} {...p} tablet={t} ahora={ahora} />
          ))}
        </ul>
      )}

      {codigo !== null ? (
        <CodigoParaLaTablet
          codigo={codigo}
          alTerminar={() => {
            setCodigo(null);
            p.alCambiar();
          }}
        />
      ) : (
        p.local.activo && (
          <Boton
            variante="secundario"
            className={estilos.alInicio}
            disabled={generando}
            onClick={() => void generar()}
          >
            {generando ? 'Generando…' : 'Vincular una tablet'}
          </Boton>
        )
      )}
      {aviso !== null && <Aviso mensaje={aviso} />}

      {revocadas.length > 0 && (
        <details className={estilos.historial}>
          <summary>Revocadas ({revocadas.length})</summary>
          <ul>
            {revocadas.map((t) => (
              <li key={t.id}>{textoDeRevocada(t, fechaYHora)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FilaDeTablet(p: Props & { tablet: TabletDelAdmin; ahora: Date }) {
  const [revocando, setRevocando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const salud = saludDeTablet(p.tablet, p.ahora);

  const revocar = async () => {
    setRevocando(true);
    setAviso(null);
    const r = await p.ops.revocarTablet(p.tablet.id);
    setRevocando(false);
    if (r.ok) return p.alCambiar();
    setAviso(p.fallo(r));
  };

  return (
    <li className={estilos.tablet}>
      <div className={estilos.datosDelLocal}>
        <strong>{p.tablet.nombre}</strong>
        <span className={estilos.detalle}>
          {salud.texto} · vinculada el {fechaYHora(p.tablet.vinculada_el)}
        </span>
        {salud.alerta !== null && <span className={estilos.error}>{salud.alerta}</span>}
      </div>
      <BotonDeDosToques
        texto="Revocar"
        confirmar="Tocá de nuevo: deja de funcionar al instante"
        trabajando={revocando}
        textoTrabajando="Revocando…"
        disabled={revocando}
        alConfirmar={() => void revocar()}
      />
      {aviso !== null && <Aviso mensaje={aviso} />}
    </li>
  );
}

/**
 * El código, grande, con lo que hay que hacer en la tablet. La página
 * /vincular es de este mismo panel, así que la dirección es la de acá.
 */
function CodigoParaLaTablet(p: { codigo: CodigoDeVinculacion; alTerminar: () => void }) {
  const direccion = `${window.location.origin}/vincular`;

  return (
    <div className={estilos.codigoDeVinculacion} role="status">
      <p>En la tablet, abrí {direccion} y escribí este código:</p>
      <output aria-label="Código de vinculación">{p.codigo.codigo}</output>
      <p className={estilos.ayuda}>
        Sirve una sola vez y vence a las {hora(p.codigo.expira_el)}. Si vence, generá
        otro.
      </p>
      <Boton variante="secundario" onClick={p.alTerminar}>
        Listo, ya la vinculé
      </Boton>
    </div>
  );
}
