import { esquemaSalud } from '@repunto/contratos';

// Sin diseno y sin rutas de producto: esta pagina existe para confirmar que el
// contrato compartido se importa, compila y valida dentro de Next.
const salud = esquemaSalud.parse({ estado: 'ok', version: '0.1.0-dev', base: 'ok' });

export default function Pagina() {
  return (
    <main>
      <h1>Repunto — panel del negocio</h1>
      <p>
        Contrato compartido leido desde <code>@repunto/contratos</code>: estado{' '}
        {salud.estado}, version {salud.version}.
      </p>
    </main>
  );
}
