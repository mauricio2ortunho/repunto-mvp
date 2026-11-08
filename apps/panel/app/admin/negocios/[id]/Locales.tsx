'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { FichaDelNegocio, LocalDelAdmin } from '@repunto/contratos';
import { LIMITES_DEL_LOCAL, enlaceDelMapa } from '@repunto/contratos';
import { Aviso, Boton, BotonDeDosToques } from '@repunto/ui';

import * as api from '../../../../lib/api/admin';
import type { Fallo } from '../../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import {
  type BorradorDeLocal,
  LOCAL_VACIO,
  type RevisionDeLocal,
  borradorDeLocal,
  confirmacionDeCierre,
  revisarLocal,
} from '../../../../lib/locales-del-admin';
import { Etiquetado } from '../Campos';
import { CampoDeUbicacion } from './CampoDeUbicacion';
import { TabletsDelLocal } from './Tablets';
import estilos from '../Negocios.module.css';

interface Props {
  ficha: FichaDelNegocio;
  fallo: (f: Fallo) => string | null;
  /** Vuelve a pedir la ficha: cambio algo que se ve en otras partes. */
  alCambiar: () => void;
}

/**
 * Los locales del negocio: agregar, editar, cerrar y reabrir. Un local
 * cerrado no se borra: deja de sellar y de anotar gente, y su historial queda.
 */
export function SeccionLocales(p: Props) {
  const [agregando, setAgregando] = useState(p.ficha.locales.length === 0);

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>Locales</h2>
      {p.ficha.locales.length === 0 ? (
        <p className={estilos.ayuda}>
          Todavía no tiene locales. Sin un local abierto el negocio no aparece en
          &quot;Dónde juntar sellos&quot; y no hay dónde sellar.
        </p>
      ) : (
        <ul className={estilos.locales}>
          {p.ficha.locales.map((l) => (
            <FilaDeLocal key={`${l.id}-${l.nombre}-${l.direccion}`} {...p} local={l} />
          ))}
        </ul>
      )}

      {agregando ? (
        <LocalNuevo {...p} alTerminar={() => setAgregando(false)} />
      ) : (
        <Boton
          variante="secundario"
          className={estilos.alInicio}
          onClick={() => setAgregando(true)}
        >
          Agregar local
        </Boton>
      )}
    </section>
  );
}

function FilaDeLocal(p: Props & { local: LocalDelAdmin }) {
  const { local } = p;
  const [editando, setEditando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiarEstado = async () => {
    setTrabajando(true);
    setAviso(null);
    const r = await api.cambiarEstadoDelLocal(p.ficha.id, local.id, !local.activo);
    setTrabajando(false);
    if (r.ok) return p.alCambiar();
    setAviso(p.fallo(r));
  };

  if (editando) {
    return (
      <li className={estilos.local}>
        <FormularioDeLocal
          id={local.id}
          inicial={borradorDeLocal(local)}
          textoGuardar="Guardar"
          alCancelar={() => setEditando(false)}
          enviar={async (datos) => {
            const r = await api.guardarLocal(p.ficha.id, local.id, datos);
            if (r.ok) {
              setEditando(false);
              p.alCambiar();
              return null;
            }
            return p.fallo(r);
          }}
        />
      </li>
    );
  }

  return (
    <li className={estilos.local} data-activo={local.activo}>
      <div className={estilos.datosDelLocal}>
        <div className={estilos.nombre}>
          <strong>{local.nombre}</strong>
          {!local.activo && <span className={estilos.suspendido}>Cerrado</span>}
        </div>
        <span className={estilos.detalle}>{local.direccion}</span>
        {local.ubicacion === null ? (
          <span className={estilos.ayuda}>Sin ubicación en el mapa</span>
        ) : (
          <a
            className={estilos.enlaceSimple}
            href={enlaceDelMapa(local.ubicacion)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en el mapa
          </a>
        )}
      </div>
      <div className={estilos.acciones}>
        {local.activo ? (
          <>
            <Boton
              variante="secundario"
              disabled={trabajando}
              onClick={() => setEditando(true)}
            >
              Editar
            </Boton>
            <Link
              className={estilos.enlaceDeAccion}
              href={`/admin/negocios/${p.ficha.id}/locales/${local.id}/qr`}
            >
              QR para imprimir
            </Link>
            <BotonDeDosToques
              texto="Cerrar"
              confirmar={confirmacionDeCierre(p.ficha, local)}
              trabajando={trabajando}
              textoTrabajando="Cerrando…"
              disabled={trabajando}
              alConfirmar={() => void cambiarEstado()}
            />
          </>
        ) : (
          <Boton
            variante="secundario"
            disabled={trabajando}
            onClick={() => void cambiarEstado()}
          >
            {trabajando ? 'Reabriendo…' : 'Reabrir'}
          </Boton>
        )}
      </div>
      {aviso !== null && <Aviso mensaje={aviso} />}
      <TabletsDelLocal {...p} local={local} />
    </li>
  );
}

function LocalNuevo(p: Props & { alTerminar: () => void }) {
  // Una clave por local: si la respuesta no llega y se vuelve a tocar, viaja
  // la misma y la api no crea dos.
  const idempotencia = useRef(crearGestorDeIdempotencia());

  return (
    <div className={estilos.local}>
      <FormularioDeLocal
        id="nuevo"
        inicial={LOCAL_VACIO}
        textoGuardar="Agregar"
        alCancelar={p.ficha.locales.length > 0 ? p.alTerminar : undefined}
        enviar={async (datos) => {
          const firma = `local:${p.ficha.id}:${JSON.stringify(datos)}`;
          const r = await api.crearLocal(
            p.ficha.id,
            datos,
            idempotencia.current.clavePara(firma),
          );
          if (r.ok) {
            idempotencia.current.olvidar(firma);
            p.alTerminar();
            p.alCambiar();
            return null;
          }
          if (r.tipo === 'rechazo') idempotencia.current.olvidar(firma);
          const mensaje = p.fallo(r);
          if (mensaje === null || r.tipo === 'rechazo') return mensaje;
          return `${mensaje} Si volvés a tocar "Agregar", no se crea dos veces.`;
        }}
      />
    </div>
  );
}

/** Nombre y direccion. `enviar` devuelve el aviso a mostrar, o null si salio bien. */
function FormularioDeLocal(p: {
  id: string;
  inicial: BorradorDeLocal;
  textoGuardar: string;
  alCancelar: (() => void) | undefined;
  enviar: (
    datos: Extract<RevisionDeLocal, { ok: true }>['peticion'],
  ) => Promise<string | null>;
}) {
  const [b, setB] = useState<BorradorDeLocal>(p.inicial);
  const [problemas, setProblemas] = useState<
    Extract<RevisionDeLocal, { ok: false }>['problemas']
  >({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const poner = (campo: keyof BorradorDeLocal, valor: string) => {
    setB((actual) => ({ ...actual, [campo]: valor }));
    setProblemas((actuales) => {
      const resto = { ...actuales };
      delete resto[campo];
      return resto;
    });
    setAviso(null);
  };

  const guardar = async () => {
    if (enviando) return;
    const revision = revisarLocal(b);
    if (!revision.ok) return setProblemas(revision.problemas);
    setEnviando(true);
    setAviso(null);
    const resultado = await p.enviar(revision.peticion);
    setEnviando(false);
    setAviso(resultado);
  };

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <fieldset className={estilos.sinMarco} disabled={enviando}>
        <div className={estilos.fila}>
          <Etiquetado
            id={`local-nombre-${p.id}`}
            titulo="Nombre del local"
            problema={problemas.nombre}
          >
            <input
              id={`local-nombre-${p.id}`}
              className={estilos.entrada}
              value={b.nombre}
              maxLength={LIMITES_DEL_LOCAL.nombre}
              placeholder="Equipetrol"
              autoComplete="off"
              onChange={(e) => poner('nombre', e.target.value)}
            />
          </Etiquetado>
          <Etiquetado
            id={`local-direccion-${p.id}`}
            titulo="Dirección"
            problema={problemas.direccion}
          >
            <input
              id={`local-direccion-${p.id}`}
              className={estilos.entrada}
              value={b.direccion}
              maxLength={LIMITES_DEL_LOCAL.direccion}
              placeholder="Av. San Martín 123"
              autoComplete="off"
              onChange={(e) => poner('direccion', e.target.value)}
            />
          </Etiquetado>
        </div>
        <CampoDeUbicacion
          id={p.id}
          valor={b.ubicacion}
          problema={problemas.ubicacion}
          alCambiar={(valor) => poner('ubicacion', valor)}
        />
      </fieldset>
      {aviso !== null && <Aviso mensaje={aviso} />}
      <div className={estilos.acciones}>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : p.textoGuardar}
        </Boton>
        {p.alCancelar !== undefined && (
          <Boton variante="texto" disabled={enviando} onClick={p.alCancelar}>
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  );
}
