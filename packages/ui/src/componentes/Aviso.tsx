import css from './Aviso.module.css';

/** Algo salio mal y el texto dice que hacer. Se anuncia a lectores de pantalla. */
export function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className={css.aviso}>
      <svg
        viewBox="0 0 24 24"
        width="32"
        height="32"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path d="M12 7v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="16.8" r="1.4" fill="currentColor" />
      </svg>
      <p>{mensaje}</p>
    </div>
  );
}
