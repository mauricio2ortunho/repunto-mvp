'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Aviso, Boton } from '@repunto/ui';

import { miRegistro, registrar } from '../../../lib/api/cliente';
import { type RegistroEnEspera, sesionDelTelefono } from '../../../lib/sesion';
import { NombreDeLaApp, Pantalla } from '../../componentes/Pantalla';
import css from './Registro.module.css';
import { type MotivoDeFin, queSigue, ultimosCuatroDe } from './siguiente';

/**
 * El alta desde el QR del mostrador (especificacion, seccion 3): el cliente
 * deja su numero y su nombre, el cajero lo ve aparecer en su lista y lo
 * confirma, y la tarjeta queda en el telefono.
 */

/** Cada cuanto se pregunta si ya confirmaron. El cliente esta en la fila. */
const CADA_MS = 3_000;

type Paso =
  | { paso: 'formulario' }
  | { paso: 'esperando'; registro: RegistroEnEspera }
  | { paso: 'terminado'; motivo: MotivoDeFin };

export function Registro({ qr }: { qr: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>({ paso: 'formulario' });

  // Si la pagina se recargo mientras esperaba, retoma la espera: el ticket
  // quedo guardado en el telefono.
  useEffect(() => {
    const guardado = sesionDelTelefono().registro();
    if (guardado?.qr === qr) setPaso({ paso: 'esperando', registro: guardado });
  }, [qr]);

  function esperar(registro: RegistroEnEspera) {
    sesionDelTelefono().guardarRegistro(registro);
    setPaso({ paso: 'esperando', registro });
  }

  function entrar(token: string | null) {
    const sesion = sesionDelTelefono();
    // Lo primero: la sesion llega una sola vez.
    if (token !== null) sesion.guardarToken(token);
    sesion.olvidarRegistro();
    router.replace('/');
  }

  function terminar(motivo: MotivoDeFin) {
    sesionDelTelefono().olvidarRegistro();
    setPaso({ paso: 'terminado', motivo });
  }

  function volverAlFormulario() {
    sesionDelTelefono().olvidarRegistro();
    setPaso({ paso: 'formulario' });
  }

  return (
    <Pantalla>
      <NombreDeLaApp />
      {paso.paso === 'formulario' && <Formulario qr={qr} alRegistrar={esperar} />}
      {paso.paso === 'esperando' && (
        <Esperando
          registro={paso.registro}
          alEntrar={entrar}
          alTerminar={terminar}
          alCorregir={volverAlFormulario}
        />
      )}
      {paso.paso === 'terminado' && (
        <Terminado motivo={paso.motivo} alReintentar={volverAlFormulario} />
      )}
    </Pantalla>
  );
}

function Formulario(p: {
  qr: string;
  alRegistrar: (registro: RegistroEnEspera) => void;
}) {
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /**
   * La Idempotency-Key de este envio. Mientras el formulario no cambie, el
   * reintento repite la clave: si la respuesta anterior se perdio, recibe el
   * mismo ticket, porque el ticket se deriva de ella.
   */
  const intento = useRef<{ clave: string; firma: string } | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const cuerpo = { qr_slug: p.qr, telefono: telefono.trim(), nombre: nombre.trim() };
    const firma = JSON.stringify(cuerpo);
    if (intento.current?.firma !== firma) {
      intento.current = { clave: crypto.randomUUID(), firma };
    }
    const { clave } = intento.current;

    setEnviando(true);
    setMensaje(null);
    const respuesta = await registrar(cuerpo, clave);
    setEnviando(false);

    if (!respuesta.ok) {
      setMensaje(respuesta.mensaje);
      return;
    }
    p.alRegistrar({
      ticket: respuesta.datos.ticket,
      clave,
      qr: p.qr,
      nombre: cuerpo.nombre,
      telefono_final: ultimosCuatroDe(cuerpo.telefono),
    });
  }

  return (
    <form className={css.formulario} onSubmit={enviar} noValidate>
      <header className={css.cabeza}>
        <h1>Sumate a la tarjeta de sellos</h1>
        <p>
          Dejá tu número y tu nombre. El cajero te confirma y la tarjeta queda en tu
          teléfono.
        </p>
      </header>

      <label className={css.campo}>
        <span>Tu número de celular</span>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="70123456"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          required
          maxLength={30}
        />
      </label>

      <label className={css.campo}>
        <span>Tu nombre</span>
        <input
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          placeholder="Como te dicen"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={80}
        />
      </label>

      {mensaje !== null && <Aviso mensaje={mensaje} />}

      <Boton
        type="submit"
        tamano="grande"
        ancho
        disabled={enviando || telefono.trim() === '' || nombre.trim() === ''}
      >
        {enviando ? 'Enviando…' : 'Registrarme'}
      </Boton>
    </form>
  );
}

function Esperando(p: {
  registro: RegistroEnEspera;
  alEntrar: (token: string | null) => void;
  alTerminar: (motivo: MotivoDeFin) => void;
  alCorregir: () => void;
}) {
  const [sinConexion, setSinConexion] = useState(false);
  const { ticket } = p.registro;
  // Las ultimas funciones del padre, sin que cambiarlas reinicie la consulta.
  const avisar = useRef({ alEntrar: p.alEntrar, alTerminar: p.alTerminar });
  avisar.current = { alEntrar: p.alEntrar, alTerminar: p.alTerminar };

  useEffect(() => {
    let vivo = true;
    let enCurso = false;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const control = new AbortController();

    const programar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => void preguntar(), CADA_MS);
    };

    async function preguntar() {
      // Con la pestaña oculta no se pregunta: se retoma al volver.
      if (enCurso || document.visibilityState === 'hidden') return;
      enCurso = true;
      const respuesta = await miRegistro(ticket, control.signal);
      enCurso = false;
      if (!vivo) return;

      if (respuesta.ok) {
        setSinConexion(false);
        const siguiente = queSigue(respuesta.datos, sesionDelTelefono().token() !== null);
        if (siguiente.tipo === 'entrar') return avisar.current.alEntrar(siguiente.token);
        if (siguiente.tipo === 'terminar') {
          return avisar.current.alTerminar(siguiente.motivo);
        }
        return programar();
      }
      // El ticket ya no existe: el registro vencio y lo retomo otro envio.
      if (respuesta.tipo === 'rechazo' && respuesta.codigo === 'TOKEN_INVALIDO') {
        return avisar.current.alTerminar('vencido');
      }
      setSinConexion(respuesta.tipo === 'incierto');
      programar();
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') void preguntar();
    };

    void preguntar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      control.abort();
      clearTimeout(espera);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [ticket]);

  return (
    <section className={css.espera} aria-live="polite">
      <h1 className={css.instruccion}>Mostrale esta pantalla al cajero</h1>

      <div className={css.ficha}>
        <p className={css.nombre}>{p.registro.nombre}</p>
        <p className={css.digitos}>
          <span>terminado en</span>
          <strong>{p.registro.telefono_final}</strong>
        </p>
      </div>

      <p className={css.estado} data-sin-conexion={sinConexion || undefined}>
        <span className={css.latido} aria-hidden="true" />
        {sinConexion
          ? 'Sin conexión. Seguimos intentando…'
          : 'Esperando que te confirme…'}
      </p>

      <Boton variante="texto" onClick={p.alCorregir}>
        Me equivoqué en los datos
      </Boton>
    </section>
  );
}

const FINALES: Record<
  MotivoDeFin,
  { titulo: string; texto: string; reintentar: boolean }
> = {
  vencido: {
    titulo: 'Se venció el registro',
    texto:
      'Pasó media hora y nadie lo confirmó. Si seguís en el local, registrate de nuevo y avisale al cajero.',
    reintentar: true,
  },
  descartado: {
    titulo: 'El cajero descartó el registro',
    texto: 'Si fue un error, registrate de nuevo y mostrale la pantalla al cajero.',
    reintentar: true,
  },
  ya_tiene_cuenta: {
    titulo: 'Ese número ya tiene cuenta',
    texto:
      'El cajero ya te abrió la tarjeta de este local y tus sellos se guardan. Para verlos en este teléfono hay que verificar el número con un código, y eso todavía no está disponible.',
    reintentar: false,
  },
  sin_sesion: {
    titulo: 'Ya te confirmaron',
    texto: 'Pero no pudimos abrir tu sesión en este teléfono. Pedí ayuda en el local.',
    reintentar: false,
  },
};

function Terminado(p: { motivo: MotivoDeFin; alReintentar: () => void }) {
  const final = FINALES[p.motivo];
  return (
    <section className={css.fin}>
      <h1>{final.titulo}</h1>
      <p>{final.texto}</p>
      {final.reintentar && (
        <Boton tamano="grande" ancho onClick={p.alReintentar}>
          Registrarme de nuevo
        </Boton>
      )}
    </section>
  );
}
