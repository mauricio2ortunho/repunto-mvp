import { type Caja, revisarCaja } from './caja';
import { partirCodigoTipeado, verificarCodigo } from './codigo';
import { type Rechazo, rechazo } from './errores';
import {
  estaCompleta,
  estaVencida,
  faltanPara,
  progresoDe,
  vencimientoDesde,
} from './tarjeta';
import type { Cliente, Condicion, Programa, Sello, TarjetaEnCurso } from './tipos';

const MS_POR_HORA = 3_600_000;

export interface EntradaDeSellado extends Caja {
  ahora: Date;
  cliente: Cliente;
  /** Lo que el cajero tipeo, tal cual: `K7Q4M-418329`, `k7q4m 418329`, etc. */
  codigo: string;
  /** Lo responde la base: el insert en codigo_usado choco con el unico (INV-9). */
  codigoYaUsado: boolean;
  /** Version vigente del programa. Nula si el negocio no tiene ninguna. */
  programaVigente: Programa | null;
  /** Condicion vigente, la que se adjunta al sello. Nula si no hay ninguna. */
  condicionVigente: Condicion | null;
  /** La tarjeta activa del cliente en este negocio, o null si no tiene. */
  enCurso: TarjetaEnCurso | null;
  /**
   * Ultimo sello no anulado del cliente en ESTE negocio, sin importar de que
   * tarjeta sea. El intervalo minimo se mide contra el: si se midiera por
   * tarjeta, alguien canjearia y sellaria de nuevo al instante.
   */
  ultimoSelloDelCliente: Sello | null;
}

export interface EfectoDeSellado {
  /** La tarjeta sobre la que se sella, o null si hay que abrir una. */
  tarjeta_id: string | null;
  /** Que tarjeta abrir antes de sellar, o null si ya habia una en curso. */
  abrirTarjeta: { programa_id: string; negocio_id: string; local_alta_id: string } | null;
  sello: { negocio_id: string; local_id: string; turno_id: string; condicion_id: string };
  /** Solo con el primer sello de la tarjeta (INV-12, INV-13). */
  arrancarReloj: { reloj_desde: Date; vence_el: Date | null } | null;
  /** Lo que el cajero le dice al cliente en voz alta. */
  aviso: { nombre: string; progreso: number; faltan: number; completa: boolean };
}

export type DecisionDeSellado = Rechazo | { tipo: 'sellar'; efecto: EfectoDeSellado };

/**
 * Las ocho validaciones de la seccion 5 de la especificacion, en su orden.
 *
 * La cuarta —registrar el consumo del codigo— escribe, asi que no vive aca:
 * `apps/api` inserta en codigo_usado antes de llamar y pasa el resultado en
 * `codigoYaUsado`. El orden de los efectos se mantiene: el consumo se registra
 * antes de crear el sello, en la misma transaccion (INV-9, INV-19).
 *
 * No lee ni escribe nada. Devuelve que hacer.
 */
export function decidirSello(entrada: EntradaDeSellado): DecisionDeSellado {
  // 1 y 2. Equipo, local, turno, persona y negocio.
  const problemaDeCaja = revisarCaja(entrada);
  if (problemaDeCaja !== null) return rechazo(problemaDeCaja);

  // 3. El codigo resuelve al cliente, con la ventana actual o la anterior.
  // Prefijo que no coincide y TOTP equivocado dan el MISMO error: distinguirlos
  // permitiria averiguar que codigos publicos existen.
  const tipeado = partirCodigoTipeado(entrada.codigo);
  if (tipeado === null) return rechazo('CODIGO_INVALIDO');
  if (tipeado.codigo_publico !== entrada.cliente.codigo_publico) {
    return rechazo('CODIGO_INVALIDO');
  }
  const verificacion = verificarCodigo({
    semilla: entrada.cliente.semilla_totp,
    totp: tipeado.totp,
    ahora: entrada.ahora,
  });
  if (!verificacion.valido) return rechazo('CODIGO_INVALIDO');

  // 4. El consumo ya quedo registrado, o ya estaba.
  if (entrada.codigoYaUsado) return rechazo('CODIGO_YA_USADO');

  // 5. La tarjeta activa, o la que habria que abrir. La promo tiene que estar
  // configurada: sin condicion no hay sello que insertar, y sin programa
  // vigente no hay tarjeta que abrir.
  if (entrada.condicionVigente === null) return rechazo('PROMO_NO_CONFIGURADA');
  if (entrada.enCurso === null && entrada.programaVigente === null) {
    return rechazo('PROMO_NO_CONFIGURADA');
  }

  // La tarjeta en curso termina con la regla con la que empezo (INV-6); una
  // nueva nace con la vigente.
  const programa = entrada.enCurso?.programa ?? entrada.programaVigente;
  if (programa === null) return rechazo('PROMO_NO_CONFIGURADA');

  // 6. Intervalo minimo entre sellos.
  if (entrada.ultimoSelloDelCliente !== null) {
    const transcurrido =
      entrada.ahora.getTime() - entrada.ultimoSelloDelCliente.creado_el.getTime();
    if (transcurrido < programa.horas_entre_sellos * MS_POR_HORA) {
      return rechazo('DEMASIADO_PRONTO');
    }
  }

  // 7. Ni vencida ni completa.
  const progresoActual =
    entrada.enCurso === null ? 0 : progresoDe(entrada.enCurso.sellos);
  if (entrada.enCurso !== null) {
    if (estaVencida(entrada.enCurso.tarjeta, entrada.ahora))
      return rechazo('TARJETA_VENCIDA');
    if (estaCompleta(progresoActual, programa)) return rechazo('TARJETA_COMPLETA');
  }

  // 8. El sello, con la condicion vigente adjunta. Si es el primero de la
  // tarjeta, arranca el reloj.
  const esPrimerSello =
    entrada.enCurso === null || entrada.enCurso.tarjeta.reloj_desde === null;
  const progreso = progresoActual + 1;

  return {
    tipo: 'sellar',
    efecto: {
      tarjeta_id: entrada.enCurso?.tarjeta.id ?? null,
      abrirTarjeta:
        entrada.enCurso === null
          ? {
              programa_id: programa.id,
              negocio_id: entrada.negocio.id,
              local_alta_id: entrada.local.id,
            }
          : null,
      sello: {
        negocio_id: entrada.negocio.id,
        local_id: entrada.local.id,
        turno_id: entrada.turno.id,
        condicion_id: entrada.condicionVigente.id,
      },
      arrancarReloj: esPrimerSello
        ? {
            reloj_desde: entrada.ahora,
            vence_el: vencimientoDesde(entrada.ahora, programa.vigencia_meses),
          }
        : null,
      aviso: {
        nombre: entrada.cliente.nombre,
        progreso,
        faltan: faltanPara(progreso, programa),
        completa: estaCompleta(progreso, programa),
      },
    },
  };
}
