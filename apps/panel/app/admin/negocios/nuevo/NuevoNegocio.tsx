'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
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
import { VistaPrevia } from './VistaPrevia';

/**
 * El alta de un negocio: datos, apariencia, promo y condicion, todo junto, con
 * la tarjeta a la vista. Que se pueda dar de alta lo decide la api; aca solo
 * se avisa que corregir antes de mandar (`revisar`).
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
      router.push(`/admin/negocios/${r.datos.id}`);
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
            <CamposDeDatos f={f} logo={null} />
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

        <VistaPrevia borrador={f.b} />
      </div>
    </main>
  );
}
