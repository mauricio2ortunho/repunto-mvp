'use client';

import { useEffect, useRef, useState } from 'react';
import type { RegistroEnCaja } from '@repunto/contratos';
import { AparienciaDeTarjeta, DefinicionesDeTinta, variablesDeMarca } from '@repunto/ui';
import { useCaja } from '../usar-caja';
import { useEstadoDeCaja } from '../usar-estado';
import { useAhora, useRegistrosPendientes } from '../usar-registros';
import { AbrirTurno } from './AbrirTurno';
import { Banda } from './Banda';
import { Bloqueo } from './Bloqueo';
import { CampoDeCodigo } from './CampoDeCodigo';
import { Canje } from './Canje';
import { Condicion } from './Condicion';
import { Registros, type QueHaceLaFila } from './Registros';
import { Resultado } from './Resultado';
import css from './VistaDeCaja.module.css';

const REGISTROS_EN_CANJE =
  'Para confirmar registros, entregá el premio o volvé sin entregar.';
const REGISTROS_BLOQUEADOS = 'La caja no puede confirmar registros ahora.';

/**
 * La caja: una sola vista. Arriba el negocio y la condicion vigente; el campo
 * y el resultado a la izquierda; los registros pendientes al costado. Cuando
 * una tarjeta se completa, la izquierda entera pasa a ser la entrega del
 * premio. Cuando la caja no puede operar, la izquierda entera lo dice.
 *
 * El color del negocio se define una vez, aca arriba, para toda la caja:
 * cualquier componente de adentro puede usar --c-marca y --c-sobre-marca.
 */
export function VistaDeCaja() {
  const caja = useEstadoDeCaja();
  const { estado, escribir, sellar, canjear, confirmar, descartar, deshacer, volver } =
    useCaja({
      alRechazo: caja.revisar,
    });
  const pendientes = useRegistrosPendientes();
  const ahora = useAhora();
  const campo = useRef<HTMLInputElement>(null);
  const [filaOcupada, setFilaOcupada] = useState<{
    id: string;
    que: QueHaceLaFila;
  } | null>(null);

  // Despues de cada accion -sello, rechazo, registro confirmado- el foco
  // vuelve al campo. Tras un rechazo el codigo queda seleccionado.
  useEffect(() => {
    const el = campo.current;
    if (el === null) return;
    el.focus({ preventScroll: true });
    if (estado.seleccionar) el.select();
  }, [estado.vuelta, estado.modo, estado.seleccionar, caja.bloqueo?.codigo]);

  const enFila = async (
    r: RegistroEnCaja,
    que: QueHaceLaFila,
    hacer: () => Promise<boolean>,
  ) => {
    setFilaOcupada({ id: r.id, que });
    const resuelto = await hacer();
    setFilaOcupada(null);
    if (resuelto) pendientes.ocultar(r.id);
  };

  const ocupado = estado.ocupado !== null;
  const deshaciendo = estado.ocupado === 'anular';
  // Solo la alarma lleva fondo. Abrir turno es lo de todas las mananas.
  const superficie = caja.bloqueo?.tono === 'alarma' ? 'alerta' : undefined;

  return (
    <AparienciaDeTarjeta
      icono={caja.datos?.negocio.icono_sello}
      plantilla={caja.datos?.negocio.plantilla_tarjeta}
    >
      <div
        className={css.pantalla}
        style={variablesDeMarca(caja.datos?.negocio.color_principal)}
      >
        <DefinicionesDeTinta />

        <Banda
          datos={caja.datos}
          conexion={pendientes.conexion}
          cerrando={caja.cerrando}
          puedeCerrar={!ocupado}
          alCerrarTurno={() =>
            void caja.cerrarTurno().then((cerrado) => {
              if (cerrado) volver();
            })
          }
        />

        <main className={css.principal} data-superficie={superficie}>
          {caja.bloqueo?.codigo === 'TURNO_CERRADO' ? (
            <AbrirTurno
              alAbrir={(nuevo) => {
                caja.aplicar(nuevo);
                // Lo que quedo en pantalla era del turno anterior.
                volver();
              }}
            />
          ) : caja.bloqueo !== null ? (
            <Bloqueo
              bloqueo={caja.bloqueo}
              revisando={caja.revisando}
              alRevisar={caja.revisar}
            />
          ) : (
            <>
              {pendientes.problema !== null && (
                <p role="alert" className={css.problema}>
                  {pendientes.problema}
                </p>
              )}
              {estado.modo === 'sellar' ? (
                <>
                  <Condicion condicion={caja.datos?.condicion ?? null} />
                  <CampoDeCodigo
                    id="codigo-sello"
                    valor={estado.codigo}
                    alCambiar={escribir}
                    alEnviar={(c) => void sellar(c)}
                    boton="Sellar"
                    botonTrabajando="Sellando…"
                    trabajando={estado.ocupado === 'sellar'}
                    ocupado={ocupado}
                    refCampo={campo}
                  />
                  <div className={css.zonaResultado} aria-live="polite">
                    <Resultado
                      key={estado.ultimo.tipo === 'nada' ? 'nada' : estado.ultimo.n}
                      ultimo={estado.ultimo}
                      programa={caja.datos?.programa ?? null}
                      ocupado={ocupado}
                      deshaciendo={deshaciendo}
                      alDeshacer={(id) => void deshacer(id)}
                    />
                  </div>
                </>
              ) : (
                <Canje
                  tarjeta={estado.tarjeta}
                  contexto={estado.contexto}
                  aviso={estado.aviso}
                  codigo={estado.codigo}
                  trabajando={estado.ocupado === 'canjear'}
                  ocupado={ocupado}
                  refCampo={campo}
                  alCambiar={escribir}
                  alEntregar={(c) => void canjear(c)}
                  alVolver={volver}
                  deshaciendo={deshaciendo}
                  alDeshacer={(id) => void deshacer(id)}
                />
              )}
            </>
          )}
        </main>

        <aside className={css.costado}>
          <Registros
            registros={pendientes.registros}
            ahora={ahora}
            motivoDeBloqueo={
              caja.bloqueo !== null
                ? REGISTROS_BLOQUEADOS
                : estado.modo === 'canjear'
                  ? REGISTROS_EN_CANJE
                  : null
            }
            ocupado={ocupado}
            filaOcupada={filaOcupada}
            alConfirmar={(r, conSello) =>
              void enFila(r, conSello ? 'sellar' : 'solo', () => confirmar(r, conSello))
            }
            alDescartar={(r) => void enFila(r, 'descartar', () => descartar(r))}
          />
        </aside>
      </div>
    </AparienciaDeTarjeta>
  );
}
