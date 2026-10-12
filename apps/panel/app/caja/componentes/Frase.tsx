import css from './Frase.module.css';

/** Lo que el cajero dice en voz alta. Es lo mas grande de la tarjeta. */
export function Frase({ texto }: { texto: string }) {
  return (
    <blockquote className={css.frase}>
      <span className={css.decile}>Decile</span>
      {texto}
    </blockquote>
  );
}
