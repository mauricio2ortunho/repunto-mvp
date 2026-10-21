'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Aviso, Boton } from '@repunto/ui';
import * as api from '../../lib/api/caja';
import { mensajeIncierto } from '../../lib/api/mensajes';
import { credencialDeLaTablet } from '../../lib/credencial';
import css from './Vincular.module.css';

/**
 * Se hace una vez por tablet, al instalarla: el codigo que genero el admin o
 * el dueño se canjea por la sesion de esta tablet, que queda guardada aca y no
 * vence hasta que la revoquen. Que el codigo sirva lo decide la api.
 */
export function Vincular() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = async () => {
    if (enviando || codigo.trim() === '') return;
    setEnviando(true);
    setAviso(null);
    const r = await api.vincular({ codigo });
    if (r.ok) {
      // El token se entrega una sola vez: se guarda antes de cambiar de
      // pantalla, o se pierde con ella.
      credencialDeLaTablet().guardar(r.datos.token);
      router.replace('/caja');
      return;
    }
    setEnviando(false);
    setAviso(r.tipo === 'rechazo' ? r.mensaje : mensajeIncierto(r.causa, 'vincular'));
  };

  return (
    <main className={css.pantalla}>
      <form
        className={css.tarjeta}
        aria-labelledby="titulo-vincular"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <h1 id="titulo-vincular" className={css.titulo}>
          Vincular esta tablet
        </h1>
        <p className={css.texto}>
          Escribí el código que te dieron para esta caja. Son ocho letras y números, sirve
          una sola vez y vence a los 15 minutos.
        </p>
        {aviso !== null && <Aviso mensaje={aviso} />}
        <label className={css.etiqueta} htmlFor="codigo-vinculacion">
          Código
        </label>
        <input
          id="codigo-vinculacion"
          className={css.campo}
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value.toUpperCase());
            setAviso(null);
          }}
          placeholder="K7QM-4R8T"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          disabled={enviando}
          autoFocus
        />
        <Boton type="submit" tamano="grande" disabled={enviando || codigo.trim() === ''}>
          {enviando ? 'Vinculando…' : 'Vincular esta tablet'}
        </Boton>
      </form>
    </main>
  );
}
