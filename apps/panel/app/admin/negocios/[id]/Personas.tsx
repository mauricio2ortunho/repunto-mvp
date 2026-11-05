'use client';

import { useRef, useState } from 'react';
import {
  type FichaDelNegocio,
  LIMITES_DE_PERSONA,
  type PersonaDelAdmin,
  ROLES_DE_PERSONA,
} from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../../../lib/api/admin';
import type { Fallo } from '../../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import {
  type BorradorDePersona,
  type CampoDePersona,
  PERSONA_VACIA,
  type Problemas,
  TITULOS_DE_ROL,
  avisoDePersona,
  localesDe,
  revisarPersona,
  revisarPin,
  telefonoParaVer,
} from '../../../../lib/personas-del-admin';
import css from '../../Admin.module.css';
import { Etiquetado } from '../Campos';
import estilos from '../Negocios.module.css';

interface Props {
  ficha: FichaDelNegocio;
  fallo: (f: Fallo) => string | null;
  /** Vuelve a pedir la ficha. */
  alCambiar: () => void;
}

/**
 * Dueño, supervisores y cajeros. Quien atiende la caja aparece en la tablet
 * de sus locales con su nombre y abre turno con su PIN; el PIN lo escribe la
 * persona, y no se muestra nunca más.
 */
export function SeccionPersonas(p: Props) {
  const [agregando, setAgregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>Personas</h2>
      <p className={estilos.ayuda}>
        Quien atiende la caja aparece en la tablet de sus locales con su nombre, y abre
        turno con su PIN.
      </p>
      {p.ficha.personas.length > 0 && (
        <ul className={estilos.locales}>
          {p.ficha.personas.map((persona) => (
            <FilaDePersona key={persona.id} {...p} persona={persona} />
          ))}
        </ul>
      )}

      {aviso !== null && <Aviso mensaje={aviso} />}
      {agregando ? (
        <PersonaNueva
          {...p}
          alTerminar={(mensaje) => {
            setAgregando(false);
            setAviso(mensaje);
          }}
        />
      ) : (
        <Boton
          variante="secundario"
          className={estilos.alInicio}
          onClick={() => {
            setAviso(null);
            setAgregando(true);
          }}
        >
          Agregar persona
        </Boton>
      )}
    </section>
  );
}

function FilaDePersona(p: Props & { persona: PersonaDelAdmin }) {
  const { persona } = p;
  const [cambiandoPin, setCambiandoPin] = useState(false);
  const falta = avisoDePersona(persona);
  const detalle = [
    TITULOS_DE_ROL[persona.rol],
    ...(persona.telefono === null ? [] : [telefonoParaVer(persona.telefono)]),
    localesDe(persona, p.ficha),
  ].join(' · ');

  return (
    <li className={estilos.local} data-activo={persona.activo}>
      <div className={estilos.datosDelLocal}>
        <div className={estilos.nombre}>
          <strong>{persona.nombre}</strong>
          {!persona.activo && <span className={estilos.suspendido}>Dado de baja</span>}
        </div>
        <span className={estilos.detalle}>{detalle}</span>
        {falta !== null && <span className={estilos.error}>{falta}</span>}
      </div>
      {persona.activo && !cambiandoPin && (
        <div className={estilos.acciones}>
          <Boton variante="secundario" onClick={() => setCambiandoPin(true)}>
            {persona.tiene_pin ? 'Cambiar PIN' : 'Poner PIN'}
          </Boton>
        </div>
      )}
      {cambiandoPin && (
        <FormularioDePin
          {...p}
          persona={persona}
          alTerminar={() => setCambiandoPin(false)}
        />
      )}
    </li>
  );
}

function FormularioDePin(
  p: Props & { persona: PersonaDelAdmin; alTerminar: () => void },
) {
  const [b, setB] = useState({ pin: '', pinOtraVez: '' });
  const [problemas, setProblemas] = useState<Problemas>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const guardar = async () => {
    if (enviando) return;
    const revision = revisarPin(b, true);
    if (!revision.ok || revision.pin === null) {
      return setProblemas(revision.ok ? {} : revision.problemas);
    }
    setEnviando(true);
    setAviso(null);
    const r = await api.ponerPin(p.ficha.id, p.persona.id, revision.pin);
    setEnviando(false);
    if (r.ok) {
      p.alTerminar();
      return p.alCambiar();
    }
    setAviso(p.fallo(r));
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
      <p className={estilos.ayuda}>
        Pasale la pantalla a {p.persona.nombre}: que lo escriba sin que nadie mire.
      </p>
      <fieldset className={estilos.sinMarco} disabled={enviando}>
        <CamposDePin
          id={p.persona.id}
          b={b}
          problemas={problemas}
          poner={(campo, valor) => {
            setB((actual) => ({ ...actual, [campo]: valor }));
            setProblemas({});
            setAviso(null);
          }}
        />
      </fieldset>
      {aviso !== null && <Aviso mensaje={aviso} />}
      <div className={estilos.acciones}>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar PIN'}
        </Boton>
        <Boton variante="texto" disabled={enviando} onClick={p.alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/**
 * El alta, en dos pedidos: la persona (con clave, por si se toca dos veces) y
 * despues su PIN, que no puede ir en el primero. Si el segundo falla, la
 * persona queda cargada sin PIN y la fila lo dice.
 */
function PersonaNueva(p: Props & { alTerminar: (aviso: string | null) => void }) {
  const [b, setB] = useState<BorradorDePersona>(PERSONA_VACIA);
  const [problemas, setProblemas] = useState<Problemas>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const idempotencia = useRef(crearGestorDeIdempotencia());
  const abiertos = p.ficha.locales.filter((l) => l.activo);

  const poner = <K extends CampoDePersona>(campo: K, valor: BorradorDePersona[K]) => {
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
    const revision = revisarPersona(b);
    if (!revision.ok) return setProblemas(revision.problemas);
    setEnviando(true);
    setAviso(null);

    const firma = `persona:${p.ficha.id}:${JSON.stringify(revision.peticion)}`;
    const creada = await api.crearPersona(
      p.ficha.id,
      revision.peticion,
      idempotencia.current.clavePara(firma),
    );
    if (!creada.ok) {
      setEnviando(false);
      if (creada.tipo === 'rechazo') idempotencia.current.olvidar(firma);
      const mensaje = p.fallo(creada);
      if (mensaje === null || creada.tipo === 'rechazo') return setAviso(mensaje);
      return setAviso(`${mensaje} Si volvés a tocar "Agregar", no se carga dos veces.`);
    }
    idempotencia.current.olvidar(firma);

    let resultado: string | null = null;
    if (revision.pin !== null) {
      const pin = await api.ponerPin(p.ficha.id, creada.datos.id, revision.pin);
      if (!pin.ok) {
        resultado = `${revision.peticion.nombre} quedó cargado, pero el PIN no se guardó: tocá "Poner PIN" en su fila.`;
      }
    }
    setEnviando(false);
    p.alTerminar(resultado);
    p.alCambiar();
  };

  const esDueno = b.rol === 'dueno';

  return (
    <div className={estilos.local}>
      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
      >
        <fieldset className={estilos.sinMarco} disabled={enviando}>
          <Etiquetado id="persona-nombre" titulo="Nombre" problema={problemas.nombre}>
            <input
              id="persona-nombre"
              className={estilos.entrada}
              value={b.nombre}
              maxLength={LIMITES_DE_PERSONA.nombre}
              placeholder="Ana Pérez"
              autoComplete="off"
              onChange={(e) => poner('nombre', e.target.value)}
            />
          </Etiquetado>

          <div className={estilos.etiquetado}>
            <span className={css.etiqueta}>Qué hace</span>
            <div className={estilos.opciones} role="radiogroup" aria-label="Rol">
              {ROLES_DE_PERSONA.map((rol) => (
                <label key={rol} className={estilos.opcion}>
                  <input
                    type="radio"
                    name="rol"
                    checked={b.rol === rol}
                    onChange={() => poner('rol', rol)}
                  />
                  {TITULOS_DE_ROL[rol]}
                </label>
              ))}
            </div>
            {problemas.rol !== undefined && (
              <p className={estilos.error}>{problemas.rol}</p>
            )}
          </div>

          {esDueno && (
            <Etiquetado
              id="persona-telefono"
              titulo="Teléfono"
              problema={problemas.telefono}
            >
              <input
                id="persona-telefono"
                className={estilos.entrada}
                inputMode="tel"
                value={b.telefono}
                maxLength={LIMITES_DE_PERSONA.telefono}
                placeholder="7001 2345"
                autoComplete="off"
                onChange={(e) => poner('telefono', e.target.value)}
              />
            </Etiquetado>
          )}

          <div className={estilos.etiquetado}>
            <span className={css.etiqueta}>
              {esDueno
                ? 'Locales donde atiende la caja (opcional)'
                : 'Locales donde trabaja'}
            </span>
            {abiertos.length === 0 ? (
              <p className={estilos.ayuda}>
                No hay locales abiertos: agregá uno arriba para poder asignarlo.
              </p>
            ) : (
              <div className={estilos.opciones}>
                {abiertos.map((l) => (
                  <label key={l.id} className={estilos.opcion}>
                    <input
                      type="checkbox"
                      checked={b.locales.includes(l.id)}
                      onChange={(e) =>
                        poner(
                          'locales',
                          e.target.checked
                            ? [...b.locales, l.id]
                            : b.locales.filter((id) => id !== l.id),
                        )
                      }
                    />
                    {l.nombre}
                  </label>
                ))}
              </div>
            )}
            {problemas.locales !== undefined && (
              <p className={estilos.error}>{problemas.locales}</p>
            )}
          </div>

          {b.rol !== '' && (
            <>
              <p className={estilos.ayuda}>
                {esDueno
                  ? 'El PIN solo hace falta si el dueño también atiende la caja.'
                  : 'Pasale la pantalla: que escriba su PIN sin que nadie mire. No se muestra nunca más.'}
              </p>
              <CamposDePin id="nueva" b={b} problemas={problemas} poner={poner} />
            </>
          )}
        </fieldset>

        {aviso !== null && <Aviso mensaje={aviso} />}
        <div className={estilos.acciones}>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Agregando…' : 'Agregar'}
          </Boton>
          <Boton variante="texto" disabled={enviando} onClick={() => p.alTerminar(null)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </div>
  );
}

/** Dos campos ocultos: un PIN mal tipeado no se ve, y se descubre en la caja. */
function CamposDePin(p: {
  id: string;
  b: Pick<BorradorDePersona, 'pin' | 'pinOtraVez'>;
  problemas: Problemas;
  poner: (campo: 'pin' | 'pinOtraVez', valor: string) => void;
}) {
  const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, 4);
  return (
    <div className={estilos.fila}>
      <Etiquetado
        id={`pin-${p.id}`}
        titulo="PIN (cuatro números)"
        problema={p.problemas.pin}
      >
        <input
          id={`pin-${p.id}`}
          className={estilos.entrada}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={p.b.pin}
          onChange={(e) => p.poner('pin', soloNumeros(e.target.value))}
        />
      </Etiquetado>
      <Etiquetado
        id={`pin-otra-vez-${p.id}`}
        titulo="El PIN otra vez"
        problema={p.problemas.pinOtraVez}
      >
        <input
          id={`pin-otra-vez-${p.id}`}
          className={estilos.entrada}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={p.b.pinOtraVez}
          onChange={(e) => p.poner('pinOtraVez', soloNumeros(e.target.value))}
        />
      </Etiquetado>
    </div>
  );
}
