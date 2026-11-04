'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../../lib/api/admin';
import { sesionDeAdmin } from '../../../lib/sesion-de-admin';
import css from '../Admin.module.css';

/**
 * El admin escribe el codigo que le dio `pnpm admin entrar` y este equipo
 * queda con la sesion. Que el codigo sirva lo decide la api.
 */
export function Entrar() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = async () => {
    if (enviando || codigo.trim() === '') return;
    setEnviando(true);
    setAviso(null);
    const r = await api.entrar({ codigo });
    if (r.ok) {
      // El token se entrega una sola vez: se guarda antes de cambiar de
      // pantalla, o se pierde con ella.
      sesionDeAdmin().guardar(r.datos.token);
      router.replace('/admin');
      return;
    }
    setEnviando(false);
    setAviso(api.mensajeParaElAdmin(r));
  };

  return (
    <main className={css.centrada}>
      <form
        className={css.tarjeta}
        aria-labelledby="titulo-entrar"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <p className={css.marca}>Repunto · Administración</p>
        <h1 id="titulo-entrar" className={css.titulo}>
          Entrar
        </h1>
        <p className={css.texto}>
          Escribí el código que te dio <code>pnpm admin entrar</code>. Son ocho letras y
          números, sirve una sola vez y vence a los 15 minutos. No lo compartas con nadie.
        </p>
        {aviso !== null && <Aviso mensaje={aviso} />}
        <label className={css.etiqueta} htmlFor="codigo-entrada">
          Código
        </label>
        <input
          id="codigo-entrada"
          className={css.campo}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.toUpperCase());
            setAviso(null);
          }}
          placeholder="K7QM-4R8T"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          disabled={enviando}
          autoFocus
        />
        <Boton type="submit" tamano="grande" disabled={enviando || codigo.trim() === ''}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>
    </main>
  );
}
