'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { RUBROS_DE_NEGOCIO, TITULOS_DE_RUBRO } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import { pedirSumarNegocio } from '../../../lib/api/cliente';
import {
  type BorradorDeSolicitud,
  type CampoDeSolicitud,
  LIMITES_DE_SOLICITUD,
  SOLICITUD_VACIA,
  revisarSolicitud,
} from '../../../lib/solicitud';
import { NombreDeLaApp, Pantalla } from '../../componentes/Pantalla';
import css from './SumarNegocio.module.css';

/**
 * "Sumá tu negocio": el pedido de un negocio que quiere usar Repunto. Le
 * llega al administrador, que lo da de alta o le contesta: no crea nada solo
 * (especificación, sección 1).
 */
export function SumarNegocio() {
  const router = useRouter();
  const [b, setB] = useState<BorradorDeSolicitud>(SOLICITUD_VACIA);
  const [problemas, setProblemas] = useState<Partial<Record<CampoDeSolicitud, string>>>(
    {},
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  const poner = (campo: CampoDeSolicitud, valor: string) => {
    setB((actual) => ({ ...actual, [campo]: valor }));
    setProblemas((actuales) => ({ ...actuales, [campo]: undefined }));
    setAviso(null);
  };

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const revision = revisarSolicitud(b);
    if (!revision.ok) return setProblemas(revision.problemas);
    setEnviando(true);
    setAviso(null);
    const r = await pedirSumarNegocio(revision.cuerpo);
    setEnviando(false);
    if (!r.ok) return setAviso(r.mensaje);
    setListo(true);
  }

  if (listo) {
    return (
      <Pantalla>
        <NombreDeLaApp />
        <section className={css.listo} aria-live="polite">
          <h1>¡Listo, lo recibimos!</h1>
          <p>
            Te escribimos al {b.telefono.trim()} para contarte cómo sumar{' '}
            {b.nombre_negocio.trim()} a Repunto.
          </p>
          <Boton variante="secundario" onClick={() => router.push('/negocios')}>
            Volver a los negocios
          </Boton>
        </section>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Boton variante="texto" onClick={() => router.push('/negocios')}>
        ‹ Dónde juntar sellos
      </Boton>
      <NombreDeLaApp />
      <form className={css.formulario} onSubmit={enviar} noValidate>
        <header className={css.cabeza}>
          <h1>Sumá tu negocio</h1>
          <p>
            Tus clientes juntan sellos en el teléfono en lugar de la tarjeta de cartón.
            Dejanos tus datos y te escribimos.
          </p>
        </header>

        <Campo titulo="Nombre del negocio" problema={problemas.nombre_negocio}>
          <input
            type="text"
            autoCapitalize="words"
            placeholder="Pollos Ana"
            value={b.nombre_negocio}
            maxLength={LIMITES_DE_SOLICITUD.nombreNegocio}
            onChange={(e) => poner('nombre_negocio', e.target.value)}
          />
        </Campo>

        <Campo titulo="¿De qué es?" problema={problemas.categoria}>
          <select
            value={b.categoria}
            onChange={(e) => poner('categoria', e.target.value)}
          >
            <option value="" disabled>
              Elegí uno
            </option>
            {RUBROS_DE_NEGOCIO.map((r) => (
              <option key={r} value={r}>
                {TITULOS_DE_RUBRO[r]}
              </option>
            ))}
          </select>
        </Campo>

        <Campo titulo="Tu nombre" problema={problemas.contacto}>
          <input
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Ana Pérez"
            value={b.contacto}
            maxLength={LIMITES_DE_SOLICITUD.contacto}
            onChange={(e) => poner('contacto', e.target.value)}
          />
        </Campo>

        <Campo titulo="Tu número de celular" problema={problemas.telefono}>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="70123456"
            value={b.telefono}
            maxLength={LIMITES_DE_SOLICITUD.telefono}
            onChange={(e) => poner('telefono', e.target.value)}
          />
        </Campo>

        <Campo
          titulo="Algo que quieras contarnos (opcional)"
          problema={problemas.mensaje}
        >
          <textarea
            rows={3}
            placeholder="Cuántos locales tenés, dónde están…"
            value={b.mensaje}
            maxLength={LIMITES_DE_SOLICITUD.mensaje}
            onChange={(e) => poner('mensaje', e.target.value)}
          />
        </Campo>

        {aviso !== null && <Aviso mensaje={aviso} />}

        <Boton type="submit" tamano="grande" ancho disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </Boton>
      </form>
    </Pantalla>
  );
}

function Campo(p: { titulo: string; problema: string | undefined; children: ReactNode }) {
  return (
    <label
      className={css.campo}
      data-problema={p.problema === undefined ? undefined : true}
    >
      <span>{p.titulo}</span>
      {p.children}
      {p.problema !== undefined && <span className={css.problema}>{p.problema}</span>}
    </label>
  );
}
