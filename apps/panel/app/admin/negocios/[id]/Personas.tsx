'use client';

import { useRef, useState } from 'react';
import {
  type FichaDelNegocio,
  LIMITES_DE_PERSONA,
  type PersonaDelAdmin,
} from '@repunto/contratos';
import { Aviso, Boton, BotonDeDosToques } from '@repunto/ui';

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
  borradorDesdePersona,
  localesDe,
  localesParaElegir,
  revisarPersona,
  revisarPin,
  rolesPosibles,
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
  // Los dados de baja, plegados al final: no se borran, pero no molestan.
  const activas = p.ficha.personas.filter((x) => x.activo);
  const deBaja = p.ficha.personas.filter((x) => !x.activo);

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>Personas</h2>
      <p className={estilos.ayuda}>
        Quien atiende la caja aparece en la tablet de sus locales con su nombre, y abre
        turno con su PIN.
      </p>
      {activas.length > 0 && (
        <ul className={estilos.locales}>
          {activas.map((persona) => (
            <FilaDePersona key={claveDeFila(persona)} {...p} persona={persona} />
          ))}
        </ul>
      )}
      {deBaja.length > 0 && (
        <details className={estilos.historial}>
          <summary>Dados de baja ({deBaja.length})</summary>
          <ul className={estilos.locales}>
            {deBaja.map((persona) => (
              <FilaDePersona key={claveDeFila(persona)} {...p} persona={persona} />
            ))}
          </ul>
        </details>
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

/** Cambia cuando cambia lo que se ve: la fila vuelve a mostrarse, sin formularios abiertos. */
function claveDeFila(x: PersonaDelAdmin): string {
  return `${x.id}-${x.activo}-${x.nombre}-${x.rol}-${x.telefono ?? ''}-${x.locales.join()}`;
}

type Modo = 'viendo' | 'editando' | 'pin' | 'reactivando';

function FilaDePersona(p: Props & { persona: PersonaDelAdmin }) {
  const { persona } = p;
  const [modo, setModo] = useState<Modo>('viendo');
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const falta = avisoDePersona(persona);
  const detalle = [
    TITULOS_DE_ROL[persona.rol],
    ...(persona.telefono === null ? [] : [telefonoParaVer(persona.telefono)]),
    localesDe(persona, p.ficha),
  ].join(' · ');

  /** Lo comun a baja, reactivacion y borrado: un pedido y volver a la ficha. */
  const hacer = async (pedido: () => Promise<{ ok: true } | Fallo>) => {
    setTrabajando(true);
    setAviso(null);
    const r = await pedido();
    setTrabajando(false);
    if (r.ok) return p.alCambiar();
    setAviso(p.fallo(r));
  };
  const darDeBaja = () => void hacer(() => api.darDeBaja(p.ficha.id, persona.id));
  const borrar = () => void hacer(() => api.borrarPersona(p.ficha.id, persona.id));
  // Al dueño se le liberó el teléfono al darlo de baja: reactivarlo lo pide.
  const reactivar = () =>
    persona.rol === 'dueno'
      ? setModo('reactivando')
      : void hacer(() => api.reactivarPersona(p.ficha.id, persona.id, null));

  // Sin historia, cargado por error: se borra. Con historia, solo se da de
  // baja, para no dejar sin firma lo que hizo.
  const botonDeBorrar = (
    <BotonDeDosToques
      texto="Borrar"
      confirmar="Tocá de nuevo: se borra para siempre"
      trabajando={trabajando}
      textoTrabajando="Borrando…"
      disabled={trabajando}
      alConfirmar={borrar}
    />
  );

  if (modo === 'editando') {
    return (
      <li className={estilos.local}>
        <EditarPersona {...p} persona={persona} alTerminar={() => setModo('viendo')} />
      </li>
    );
  }

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
      {modo === 'viendo' && (
        <div className={estilos.acciones}>
          {persona.activo ? (
            <>
              <Boton
                variante="secundario"
                disabled={trabajando}
                onClick={() => setModo('editando')}
              >
                Editar
              </Boton>
              <Boton
                variante="secundario"
                disabled={trabajando}
                onClick={() => setModo('pin')}
              >
                {persona.tiene_pin ? 'Cambiar PIN' : 'Poner PIN'}
              </Boton>
              {persona.con_historia ? (
                <BotonDeDosToques
                  texto="Dar de baja"
                  confirmar="Tocá de nuevo: sale de la tablet al instante"
                  trabajando={trabajando}
                  textoTrabajando="Dando de baja…"
                  disabled={trabajando}
                  alConfirmar={darDeBaja}
                />
              ) : (
                botonDeBorrar
              )}
            </>
          ) : (
            <>
              <Boton variante="secundario" disabled={trabajando} onClick={reactivar}>
                {trabajando ? 'Reactivando…' : 'Reactivar'}
              </Boton>
              {!persona.con_historia && botonDeBorrar}
            </>
          )}
        </div>
      )}
      {modo === 'pin' && (
        <FormularioDePin {...p} persona={persona} alTerminar={() => setModo('viendo')} />
      )}
      {modo === 'reactivando' && (
        <ReactivarDueno {...p} persona={persona} alTerminar={() => setModo('viendo')} />
      )}
      {aviso !== null && <Aviso mensaje={aviso} />}
    </li>
  );
}

/** El dueño vuelve con su teléfono: se le liberó al darlo de baja. */
function ReactivarDueno(p: Props & { persona: PersonaDelAdmin; alTerminar: () => void }) {
  const [telefono, setTelefono] = useState('');
  const [problema, setProblema] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const id = `reactivar-telefono-${p.persona.id}`;

  const guardar = async () => {
    if (enviando) return;
    if (telefono.trim() === '') return setProblema('El dueño entra con su teléfono.');
    setEnviando(true);
    setAviso(null);
    const r = await api.reactivarPersona(p.ficha.id, p.persona.id, telefono.trim());
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
      <fieldset className={estilos.sinMarco} disabled={enviando}>
        <Etiquetado id={id} titulo="Su teléfono" problema={problema}>
          <input
            id={id}
            className={estilos.entrada}
            inputMode="tel"
            value={telefono}
            maxLength={LIMITES_DE_PERSONA.telefono}
            placeholder="7001 2345"
            autoComplete="off"
            onChange={(e) => {
              setTelefono(e.target.value);
              setProblema(undefined);
              setAviso(null);
            }}
          />
        </Etiquetado>
      </fieldset>
      <p className={estilos.ayuda}>
        Al darlo de baja se le liberó el teléfono, para que pudiera usarse en otro
        negocio.
      </p>
      {aviso !== null && <Aviso mensaje={aviso} />}
      <div className={estilos.acciones}>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Reactivando…' : 'Reactivar'}
        </Boton>
        <Boton variante="texto" disabled={enviando} onClick={p.alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
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

/** El estado de un formulario de persona: el alta y la edicion. */
function useBorrador(inicial: BorradorDePersona) {
  const [b, setB] = useState<BorradorDePersona>(inicial);
  const [problemas, setProblemas] = useState<Problemas>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const poner = <K extends CampoDePersona>(campo: K, valor: BorradorDePersona[K]) => {
    setB((actual) => ({ ...actual, [campo]: valor }));
    setProblemas((actuales) => {
      const resto = { ...actuales };
      delete resto[campo];
      return resto;
    });
    setAviso(null);
  };
  return { b, problemas, setProblemas, aviso, setAviso, poner };
}

/**
 * El alta, en dos pedidos: la persona (con clave, por si se toca dos veces) y
 * despues su PIN, que no puede ir en el primero. Si el segundo falla, la
 * persona queda cargada sin PIN y la fila lo dice.
 */
function PersonaNueva(p: Props & { alTerminar: (aviso: string | null) => void }) {
  const f = useBorrador(PERSONA_VACIA);
  const [enviando, setEnviando] = useState(false);
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const guardar = async () => {
    if (enviando) return;
    const revision = revisarPersona(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setEnviando(true);
    f.setAviso(null);

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
      if (mensaje === null || creada.tipo === 'rechazo') return f.setAviso(mensaje);
      return f.setAviso(`${mensaje} Si volvés a tocar "Agregar", no se carga dos veces.`);
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
          <CamposDePersona
            id="nueva"
            ficha={p.ficha}
            persona={null}
            b={f.b}
            problemas={f.problemas}
            poner={f.poner}
          />
          {f.b.rol !== '' && (
            <>
              <p className={estilos.ayuda}>
                {f.b.rol === 'dueno'
                  ? 'El PIN solo hace falta si el dueño también atiende la caja.'
                  : 'Pasale la pantalla: que escriba su PIN sin que nadie mire. No se muestra nunca más.'}
              </p>
              <CamposDePin id="nueva" b={f.b} problemas={f.problemas} poner={f.poner} />
            </>
          )}
        </fieldset>

        {f.aviso !== null && <Aviso mensaje={f.aviso} />}
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

/** Nombre, rol, telefono y locales, al instante. El PIN, con su boton. */
function EditarPersona(p: Props & { persona: PersonaDelAdmin; alTerminar: () => void }) {
  const f = useBorrador(borradorDesdePersona(p.persona));
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    if (enviando) return;
    const revision = revisarPersona(f.b, { conPin: false });
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setEnviando(true);
    f.setAviso(null);
    const r = await api.guardarPersona(p.ficha.id, p.persona.id, revision.peticion);
    setEnviando(false);
    if (r.ok) {
      p.alTerminar();
      return p.alCambiar();
    }
    f.setAviso(p.fallo(r));
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
        <CamposDePersona
          id={p.persona.id}
          ficha={p.ficha}
          persona={p.persona}
          b={f.b}
          problemas={f.problemas}
          poner={f.poner}
        />
      </fieldset>
      <p className={estilos.ayuda}>
        Se aplica al instante: si le sacás un local, la tablet de ese local deja de
        aceptarlo. Lo que ya hizo no cambia.
      </p>
      {f.aviso !== null && <Aviso mensaje={f.aviso} />}
      <div className={estilos.acciones}>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Boton>
        <Boton variante="texto" disabled={enviando} onClick={p.alTerminar}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}

/** `persona`: null en el alta; al editar, quien se esta editando. */
function CamposDePersona(p: {
  id: string;
  ficha: FichaDelNegocio;
  persona: PersonaDelAdmin | null;
  b: BorradorDePersona;
  problemas: Problemas;
  poner: <K extends CampoDePersona>(campo: K, valor: BorradorDePersona[K]) => void;
}) {
  const { b, problemas, poner } = p;
  const esDueno = b.rol === 'dueno';
  const roles = rolesPosibles(p.persona);
  const locales = localesParaElegir(p.ficha, p.persona?.locales ?? []);

  return (
    <>
      <Etiquetado
        id={`persona-nombre-${p.id}`}
        titulo="Nombre"
        problema={problemas.nombre}
      >
        <input
          id={`persona-nombre-${p.id}`}
          className={estilos.entrada}
          value={b.nombre}
          maxLength={LIMITES_DE_PERSONA.nombre}
          placeholder="Ana Pérez"
          autoComplete="off"
          onChange={(e) => poner('nombre', e.target.value)}
        />
      </Etiquetado>

      {roles.length > 1 && (
        <div className={estilos.etiquetado}>
          <span className={css.etiqueta}>Qué hace</span>
          <div className={estilos.opciones} role="radiogroup" aria-label="Rol">
            {roles.map((rol) => (
              <label key={rol} className={estilos.opcion}>
                <input
                  type="radio"
                  name={`rol-${p.id}`}
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
      )}

      {esDueno && (
        <Etiquetado
          id={`persona-telefono-${p.id}`}
          titulo="Teléfono"
          problema={problemas.telefono}
        >
          <input
            id={`persona-telefono-${p.id}`}
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
          {esDueno ? 'Locales donde atiende la caja (opcional)' : 'Locales donde trabaja'}
        </span>
        {locales.length === 0 ? (
          <p className={estilos.ayuda}>
            No hay locales abiertos: agregá uno arriba para poder asignarlo.
          </p>
        ) : (
          <div className={estilos.opciones}>
            {locales.map((l) => (
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
                {l.activo ? l.nombre : `${l.nombre} (cerrado)`}
              </label>
            ))}
          </div>
        )}
        {problemas.locales !== undefined && (
          <p className={estilos.error}>{problemas.locales}</p>
        )}
      </div>
    </>
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
