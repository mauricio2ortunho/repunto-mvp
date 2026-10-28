# Qué garantiza la base de datos

Este documento lista todo lo que Postgres impide por sí mismo en Repunto,
aunque el código de la aplicación se equivoque. Cada fila es una restricción,
un índice único o un trigger que existe en la base, con el invariante de
`CLAUDE.md` (sección 4) que sostiene y lo que concretamente impide.

Lo que no está acá no lo garantiza la base: depende del código y de sus tests.

## Este documento se verifica solo

`pnpm test:integration` crea una base vacía, le aplica las migraciones y
compara su catálogo contra este archivo. El test falla si:

- una restricción de este documento no existe en la base;
- la base tiene una restricción que este documento no menciona;
- una restricción existe pero cubre otras columnas que las documentadas;
- un trigger documentado está deshabilitado.

Además, cada restricción que se puede violar tiene su propio test que intenta
violarla y exige que Postgres la rechace por ese nombre exacto. Esos tests
viven en `apps/api/test/integracion/esquema/`.

**Al agregar o cambiar una restricción**, se actualiza este archivo en el
mismo commit. Si no, el test de inventario falla y dice cuál falta.

### Formato que lee el test

Cada fila de tabla cuya primera celda es un nombre entre backticks es una
entrada. Las columnas son siempre: Restricción, Tabla, Tipo, Definición,
Invariante, Qué impide.

- **Tipo** es uno de `PK`, `UNIQUE`, `UNIQUE parcial`, `FK`, `CHECK` o
  `TRIGGER`.
- En `PK`, `UNIQUE`, `UNIQUE parcial` y `FK`, el primer bloque entre backticks
  de **Definición** se compara con el catálogo: las columnas del índice, o
  `(columnas) → tabla(columnas)` para una FK.
- En `CHECK` y `TRIGGER`, la definición es descriptiva. Lo que hacen lo
  prueban sus tests de comportamiento.

## Reglas generales

Valen para todo el esquema y tienen su propio test.

| Regla                                                                          | Invariante | Por qué                                                                                    |
| ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| Toda FK es `ON DELETE RESTRICT ON UPDATE RESTRICT`. Ninguna en cascada.        | INV-17     | Nada con historial colgando se puede borrar, y borrar un padre nunca arrastra a sus hijos. |
| Ninguna columna es `timestamp` sin zona horaria.                               | INV-21     | Todo instante se guarda en UTC. Los cortes de día en La Paz se calculan en el código.      |
| Ninguna columna es `real` ni `double precision`, y todo `monto*` es `numeric`. | Sección 9  | Los montos son plata: sin errores de redondeo binario.                                     |
| Ninguna columna es `bytea`.                                                    | INV-22     | Las imágenes viven en R2; en la base solo la URL.                                          |
| Toda tabla tiene `creado_el timestamptz NOT NULL` con valor por defecto.       | Sección 9  | Toda fila sabe cuándo nació, aunque quien la inserte se olvide.                            |

## Alcance entre negocios y locales

Lo sostiene el patrón de FK compuesta (`CLAUDE.md`, sección 14): la columna de
alcance forma parte de la FK, así que no puede diferir de la del registro al
que apunta.

| Restricción                                            | Tabla                   | Tipo | Definición                                                                | Invariante | Qué impide                                                                                                                                                             |
| ------------------------------------------------------ | ----------------------- | ---- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sello_turno_mismo_local_fkey`                         | `sello`                 | FK   | `(turno_id, local_id) → turno_caja(id, local_id)`                         | INV-2      | Un sello con un local distinto al del turno, y por lo tanto al del dispositivo. El local no puede venir del request.                                                   |
| `canje_turno_mismo_local_fkey`                         | `canje`                 | FK   | `(turno_id, local_id) → turno_caja(id, local_id)`                         | INV-2      | Lo mismo para el canje: el local sale del turno, el turno sale del dispositivo.                                                                                        |
| `sello_anulado_turno_mismo_local_fkey`                 | `sello`                 | FK   | `(anulado_turno_id, local_id) → turno_caja(id, local_id)`                 | INV-2      | Anular un sello desde la tablet de otra sucursal.                                                                                                                      |
| `turno_caja_usuario_asignado_al_local_fkey`            | `turno_caja`            | FK   | `(usuario_id, local_id) → usuario_local(usuario_id, local_id)`            | INV-3      | Abrir turno en un local al que el cajero nunca fue asignado. Que la asignación siga activa lo verifica el código.                                                      |
| `turno_caja_dispositivo_mismo_local_fkey`              | `turno_caja`            | FK   | `(dispositivo_id, local_id) → dispositivo_caja(id, local_id)`             | INV-3      | Un turno que declara un local distinto al de la tablet donde se abre.                                                                                                  |
| `usuario_local_usuario_mismo_negocio_fkey`             | `usuario_local`         | FK   | `(usuario_id, negocio_id) → usuario_negocio(id, negocio_id)`              | INV-3      | Asignar un usuario a un local de otro negocio.                                                                                                                         |
| `usuario_local_local_mismo_negocio_fkey`               | `usuario_local`         | FK   | `(local_id, negocio_id) → local(id, negocio_id)`                          | INV-3      | Lo mismo, declarando el negocio del usuario en lugar del del local.                                                                                                    |
| `vinculacion_pendiente_creador_asignado_al_local_fkey` | `vinculacion_pendiente` | FK   | `(creado_por_usuario_id, local_id) → usuario_local(usuario_id, local_id)` | INV-2      | Que alguien del negocio genere el código de vinculación de una tablet sin estar asignado a ESE local. El admin de plataforma no pasa por acá: tiene su propia columna. |
| `dispositivo_caja_vinculacion_mismo_local_fkey`        | `dispositivo_caja`      | FK   | `(vinculacion_id, local_id) → vinculacion_pendiente(id, local_id)`        | INV-2      | Que una tablet quede vinculada a otro local que el del código con que se vinculó. El local de cada sello sale de la tablet, así que tiene que salir del código.        |
| `registro_pendiente_turno_mismo_local_fkey`            | `registro_pendiente`    | FK   | `(resuelto_turno_id, local_id) → turno_caja(id, local_id)`                | INV-2      | Confirmar o descartar desde la tablet de una sucursal un registro que se hizo en otra.                                                                                 |
| `condicion_sello_autor_mismo_negocio_fkey`             | `condicion_sello`       | FK   | `(usuario_id, negocio_id) → usuario_negocio(id, negocio_id)`              | INV-8      | Que un usuario de otra marca escriba la condición de este negocio.                                                                                                     |
| `sello_condicion_mismo_negocio_fkey`                   | `sello`                 | FK   | `(condicion_id, negocio_id) → condicion_sello(id, negocio_id)`            | INV-8      | Adjuntarle a un sello la condición de otra marca.                                                                                                                      |
| `sello_tarjeta_mismo_negocio_fkey`                     | `sello`                 | FK   | `(tarjeta_id, negocio_id) → tarjeta(id, negocio_id)`                      | INV-18     | Un sello que declara un negocio distinto al de su tarjeta. Ancla las otras FK del sello al negocio correcto.                                                           |
| `sello_local_mismo_negocio_fkey`                       | `sello`                 | FK   | `(local_id, negocio_id) → local(id, negocio_id)`                          | INV-18     | Sellar una tarjeta en un local de otro negocio.                                                                                                                        |
| `canje_tarjeta_mismo_negocio_fkey`                     | `canje`                 | FK   | `(tarjeta_id, negocio_id) → tarjeta(id, negocio_id)`                      | INV-18     | Un canje que declara un negocio distinto al de su tarjeta.                                                                                                             |
| `canje_local_mismo_negocio_fkey`                       | `canje`                 | FK   | `(local_id, negocio_id) → local(id, negocio_id)`                          | INV-18     | Canjear una tarjeta en un local de otro negocio.                                                                                                                       |
| `tarjeta_local_alta_mismo_negocio_fkey`                | `tarjeta`               | FK   | `(local_alta_id, negocio_id) → local(id, negocio_id)`                     | INV-18     | Que una tarjeta figure abierta en un local de otro negocio.                                                                                                            |

## Programa y condición

| Restricción                        | Tabla             | Tipo           | Definición                                        | Invariante | Qué impide                                                                                                                          |
| ---------------------------------- | ----------------- | -------------- | ------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `programa_una_vigente_por_negocio` | `programa`        | UNIQUE parcial | `(negocio_id)` solo entre las filas con `vigente` | INV-5      | Dos versiones vigentes del programa a la vez.                                                                                       |
| `programa_negocio_id_version_key`  | `programa`        | UNIQUE         | `(negocio_id, version)`                           | INV-5      | Dos versiones con el mismo número.                                                                                                  |
| `programa_version_positiva_chk`    | `programa`        | CHECK          | `version > 0`                                     | INV-5      | Numerar versiones desde cero o en negativo.                                                                                         |
| `programa_inmutable`               | `programa`        | TRIGGER        | `BEFORE UPDATE OR DELETE`, compara la fila entera | INV-5      | Editar un programa. Lo único permitido es que `vigente` pase de true a false. Tampoco se borra: borrar y reinsertar sería editarlo. |
| `tarjeta_programa_id_inmutable`    | `tarjeta`         | TRIGGER        | `BEFORE UPDATE OF programa_id`                    | INV-6      | Cambiarle el programa a una tarjeta: le cambiaría las reglas a alguien que ya empezó a juntar.                                      |
| `condicion_sello_solo_insercion`   | `condicion_sello` | TRIGGER        | `BEFORE UPDATE OR DELETE`, rechaza siempre        | INV-7      | Editar o borrar una condición. Cambiarla es insertar una nueva, y así "ayer decía que valía el capuchino" siempre tiene respuesta.  |

## Tarjeta, sello y canje

| Restricción                              | Tabla          | Tipo           | Definición                                                  | Invariante | Qué impide                                                                                                                |
| ---------------------------------------- | -------------- | -------------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `codigo_usado_pkey`                      | `codigo_usado` | PK             | `(cliente_id, ventana)`                                     | INV-9      | Consumir dos veces el mismo código rotativo. Global: tampoco vale en otro negocio.                                        |
| `tarjeta_una_activa_por_cliente_negocio` | `tarjeta`      | UNIQUE parcial | `(cliente_id, negocio_id)` solo entre las `activa`          | INV-11     | Dos tarjetas activas del mismo cliente en el mismo negocio. Las canjeadas y vencidas no cuentan.                          |
| `tarjeta_programa_mismo_negocio_fkey`    | `tarjeta`      | FK             | `(programa_id, negocio_id) → programa(id, negocio_id)`      | INV-11     | Eludir INV-11 declarando un `negocio_id` distinto al del programa. Es lo que hace fiel al índice de arriba.               |
| `tarjeta_vence_solo_con_reloj_chk`       | `tarjeta`      | CHECK          | `vence_el` nulo, o `reloj_desde` no nulo y anterior         | INV-12     | Un vencimiento sin reloj arrancado, o anterior al arranque. Una tarjeta sin sellos no vence.                              |
| `canje_tarjeta_id_key`                   | `canje`        | UNIQUE         | `(tarjeta_id)`                                              | INV-16     | Dos canjes de la misma tarjeta. Respaldo en base del `UPDATE … WHERE estado = 'activa'`.                                  |
| `sello_anulacion_completa_chk`           | `sello`        | CHECK          | `anulado`, `anulado_el` y `anulado_turno_id`, juntos o nada | INV-17     | Un sello anulado sin fecha o sin turno, o con rastros de anulación sin estar anulado. Anular marca y deja quién y cuándo. |

## Teléfonos y acceso

| Restricción                              | Tabla              | Tipo   | Definición                                | Invariante | Qué impide                                                                                                               |
| ---------------------------------------- | ------------------ | ------ | ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `cliente_telefono_key`                   | `cliente`          | UNIQUE | `(telefono)`                              | INV-20     | Dos cuentas de cliente con el mismo teléfono, aunque sean de negocios distintos.                                         |
| `cliente_telefono_e164_chk`              | `cliente`          | CHECK  | `telefono ~ '^\+[1-9][0-9]{7,14}$'`       | INV-20     | Guardar un teléfono sin normalizar a E.164.                                                                              |
| `cliente_codigo_publico_key`             | `cliente`          | UNIQUE | `(codigo_publico)`                        | Sección 6  | Dos clientes con el mismo código público: el prefijo que el cliente muestra en caja tiene que resolver a uno solo.       |
| `cliente_codigo_publico_formato_chk`     | `cliente`          | CHECK  | cinco caracteres de `A-HJKMNP-RT-Z2-46-9` | Sección 6  | Un código con caracteres que se confunden a un metro del mostrador (0, O, 1, I, L, 5, S), en minúsculas o de otro largo. |
| `admin_plataforma_telefono_key`          | `admin_plataforma` | UNIQUE | `(telefono)`                              | INV-20     | Dos administradores con el mismo teléfono.                                                                               |
| `admin_plataforma_telefono_e164_chk`     | `admin_plataforma` | CHECK  | `telefono ~ '^\+[1-9][0-9]{7,14}$'`       | INV-20     | Teléfono de administrador sin normalizar.                                                                                |
| `usuario_negocio_telefono_key`           | `usuario_negocio`  | UNIQUE | `(telefono)`, los nulos no chocan         | INV-20     | Dos usuarios de panel con el mismo teléfono, en cualquier negocio. Cajeros sin teléfono, todos los que haya.             |
| `usuario_negocio_telefono_e164_chk`      | `usuario_negocio`  | CHECK  | nulo, o `~ '^\+[1-9][0-9]{7,14}$'`        | INV-20     | Teléfono de usuario sin normalizar.                                                                                      |
| `usuario_negocio_dueno_con_telefono_chk` | `usuario_negocio`  | CHECK  | `rol <> 'dueno'` o `telefono` no nulo     | Sección 5  | Un dueño sin teléfono: el dueño entra por teléfono y código. Supervisor y cajero entran por PIN.                         |

## Caja y vinculación de tablets

| Restricción                                      | Tabla                   | Tipo           | Definición                                                         | Invariante | Qué impide                                                                                                                                                     |
| ------------------------------------------------ | ----------------------- | -------------- | ------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vinculacion_pendiente_codigo_key`               | `vinculacion_pendiente` | UNIQUE         | `(codigo)`                                                         | Sección 5  | Dos vinculaciones con el mismo código: la tablet todavía no sabe de qué negocio es.                                                                            |
| `vinculacion_pendiente_expira_posterior_chk`     | `vinculacion_pendiente` | CHECK          | `expira_el > creado_el`                                            | Sección 5  | Un código que nace vencido.                                                                                                                                    |
| `vinculacion_pendiente_uso_antes_de_expirar_chk` | `vinculacion_pendiente` | CHECK          | `usado_el` nulo, o entre `creado_el` y `expira_el`                 | Sección 5  | Marcar un código como usado después de vencido.                                                                                                                |
| `vinculacion_pendiente_un_solo_origen_chk`       | `vinculacion_pendiente` | CHECK          | exactamente uno de `creado_por_usuario_id` y `creado_por_admin_id` | Sección 5  | Un código sin origen, o con los dos a la vez. Siempre queda auditado quién vinculó cada tablet.                                                                |
| `dispositivo_caja_token_hash_key`                | `dispositivo_caja`      | UNIQUE         | `(token_hash)`                                                     | Sección 5  | Dos tablets con la misma sesión.                                                                                                                               |
| `dispositivo_caja_vinculacion_id_key`            | `dispositivo_caja`      | UNIQUE         | `(vinculacion_id)`                                                 | Sección 5  | Un código de vinculación usado por dos tablets. Un solo uso, también en la base.                                                                               |
| `dispositivo_caja_revocado_posterior_chk`        | `dispositivo_caja`      | CHECK          | `revocado_el` nulo, o posterior a `vinculado_el`                   | Cordura    | Revocar una tablet antes de vincularla.                                                                                                                        |
| `turno_caja_cierre_posterior_chk`                | `turno_caja`            | CHECK          | `cerrado_el` nulo, o posterior a `abierto_el`                      | Cordura    | Cerrar un turno antes de abrirlo.                                                                                                                              |
| `turno_caja_uno_abierto_por_dispositivo`         | `turno_caja`            | UNIQUE parcial | `(dispositivo_id)` solo entre los turnos sin `cerrado_el`          | INV-2      | Dos turnos abiertos a la vez en la misma tablet. El turno de un sello sale del dispositivo, y "el turno abierto de esta tablet" solo tiene sentido si hay uno. |
| `dispositivo_cliente_token_hash_key`             | `dispositivo_cliente`   | UNIQUE         | `(token_hash)`                                                     | Sección 5  | Dos equipos de cliente con el mismo identificador de sesión.                                                                                                   |
| `local_qr_slug_key`                              | `local`                 | UNIQUE         | `(qr_slug)`                                                        | Modelo     | Dos locales con el mismo QR impreso.                                                                                                                           |

## Alta del cliente

El registro ocurre en el mostrador: el cliente escanea el QR y el cajero lo
confirma de cuerpo presente (especificación funcional, sección 3).

| Restricción                                          | Tabla                | Tipo           | Definición                                                      | Invariante | Qué impide                                                                                                                                                                               |
| ---------------------------------------------------- | -------------------- | -------------- | --------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registro_pendiente_uno_por_telefono_y_local`        | `registro_pendiente` | UNIQUE parcial | `(telefono, local_id)` solo entre los `pendiente`               | Sección 3  | Que el mismo teléfono llene la lista del cajero tocando "enviar" tres veces. Los ya resueltos no chocan: mañana puede volver a registrarse.                                              |
| `registro_pendiente_ticket_hash_key`                 | `registro_pendiente` | UNIQUE         | `(ticket_hash)`                                                 | Sección 3  | Dos registros con el mismo secreto. El ticket es lo que le permite al teléfono del cliente preguntar si ya lo confirmaron.                                                               |
| `registro_pendiente_telefono_e164_chk`               | `registro_pendiente` | CHECK          | `telefono ~ '^\+[1-9][0-9]{7,14}$'`                             | INV-20     | Guardar un teléfono sin normalizar, también antes de que sea cliente.                                                                                                                    |
| `registro_pendiente_expira_posterior_chk`            | `registro_pendiente` | CHECK          | `expira_el > creado_el`                                         | Sección 3  | Un registro que nace vencido.                                                                                                                                                            |
| `registro_pendiente_resolucion_coherente_chk`        | `registro_pendiente` | CHECK          | pendiente, descartado y confirmado, cada uno con sus columnas   | Sección 3  | Un confirmado sin cuenta asociada, un descartado que dice a qué cliente, o un pendiente con rastros de quién lo resolvió.                                                                |
| `registro_pendiente_sesion_solo_si_cuenta_nueva_chk` | `registro_pendiente` | CHECK          | `sesion_entregada_el` nulo, o confirmado y con `cliente_creado` | Sección 3  | Entregarle una sesión al que se registró con el teléfono de otro. La confirmación presencial autentica a alguien nuevo; sobre una cuenta que ya existía manda el código de verificación. |

## Diseño de la tarjeta

| Restricción                       | Tabla     | Tipo  | Definición                                                 | Invariante | Qué impide                                                                                                                                                                                            |
| --------------------------------- | --------- | ----- | ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `negocio_plantilla_tarjeta_chk`   | `negocio` | CHECK | `plantilla_tarjeta IN ('clasica', 'moderna', 'minima')`    | Diseño     | Una plantilla que no existe. **Valores provisionales**: se cambian con una línea acá y otra en `packages/contratos/src/diseno.ts`, que es de donde los leen las apps; un test compara las dos listas. |
| `negocio_icono_sello_chk`         | `negocio` | CHECK | `icono_sello IN ('cafe', 'estrella', 'corazon', 'huella')` | Diseño     | Un ícono que no existe. **Valores provisionales**, mismo criterio: la lista espejo está en `packages/contratos/src/diseno.ts`.                                                                        |
| `negocio_color_principal_hex_chk` | `negocio` | CHECK | `color_principal ~ '^#[0-9A-Fa-f]{6}$'`                    | Diseño     | Un color que no es hex. El color del texto encima se calcula por contraste, no se guarda.                                                                                                             |

## Cordura de valores

| Restricción                                    | Tabla                  | Tipo  | Definición                            | Invariante | Qué impide                                                                                              |
| ---------------------------------------------- | ---------------------- | ----- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `programa_sellos_requeridos_positivo_chk`      | `programa`             | CHECK | `sellos_requeridos > 0`               | Cordura    | Una tarjeta de cero casilleros.                                                                         |
| `programa_horas_entre_sellos_no_negativo_chk`  | `programa`             | CHECK | `horas_entre_sellos >= 0`             | Cordura    | Un intervalo mínimo negativo.                                                                           |
| `programa_vigencia_meses_positiva_chk`         | `programa`             | CHECK | nula, o `vigencia_meses > 0`          | Cordura    | Una vigencia de cero meses. Nula sí: la tarjeta no vence.                                               |
| `sello_monto_no_negativo_chk`                  | `sello`                | CHECK | nulo, o `monto >= 0`                  | Cordura    | Un monto de compra negativo.                                                                            |
| `condicion_sello_monto_minimo_no_negativo_chk` | `condicion_sello`      | CHECK | nulo, o `monto_minimo >= 0`           | Cordura    | Un monto mínimo negativo.                                                                               |
| `codigo_usado_ventana_no_negativa_chk`         | `codigo_usado`         | CHECK | `ventana >= 0`                        | INV-9      | Una ventana de código anterior a 1970.                                                                  |
| `peticion_idempotente_clave_razonable_chk`     | `peticion_idempotente` | CHECK | `char_length(clave)` entre 8 y 200    | Sección 9  | Una clave de idempotencia de un caracter, que le devolvería a un cajero la respuesta del sello de otro. |
| `tope_peticion_cuenta_positiva_chk`            | `tope_peticion`        | CHECK | `cuenta > 0`                          | Sección 6  | Una cuenta de tope en cero o negativa, que dejaría pasar más pedidos de los que dice el tope.           |
| `intento_caja_resultado_razonable_chk`         | `intento_caja`         | CHECK | `char_length(resultado)` entre 2 y 40 | Sección 8  | Un intento de caja sin resultado, o con un texto libre en lugar de `ok` o un código de error.           |

## Estructura

### Destinos de FK compuesta

No son reglas de negocio y no se pueden violar por sí solas (`id` ya es PK).
Existen solo para que las FK compuestas de arriba tengan a qué apuntar. No
borrar: sin ellas, esas FK no se pueden crear.

| Restricción                                    | Tabla                   | Tipo   | Definición                   | Invariante | Qué impide                                                                                                           |
| ---------------------------------------------- | ----------------------- | ------ | ---------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `local_id_negocio_id_key`                      | `local`                 | UNIQUE | `(id, negocio_id)`           | Sección 14 | Destino de las FK de `usuario_local`, `tarjeta`, `sello` y `canje`.                                                  |
| `usuario_negocio_id_negocio_id_key`            | `usuario_negocio`       | UNIQUE | `(id, negocio_id)`           | Sección 14 | Destino de las FK de `usuario_local` y `condicion_sello`.                                                            |
| `programa_id_negocio_id_key`                   | `programa`              | UNIQUE | `(id, negocio_id)`           | Sección 14 | Destino de la FK de `tarjeta`.                                                                                       |
| `condicion_sello_id_negocio_id_key`            | `condicion_sello`       | UNIQUE | `(id, negocio_id)`           | Sección 14 | Destino de la FK de `sello`.                                                                                         |
| `tarjeta_id_negocio_id_key`                    | `tarjeta`               | UNIQUE | `(id, negocio_id)`           | Sección 14 | Destino de las FK de `sello` y `canje`.                                                                              |
| `dispositivo_caja_id_local_id_key`             | `dispositivo_caja`      | UNIQUE | `(id, local_id)`             | Sección 14 | Destino de la FK de `turno_caja`.                                                                                    |
| `turno_caja_id_local_id_key`                   | `turno_caja`            | UNIQUE | `(id, local_id)`             | Sección 14 | Destino de las FK de `sello` (otorgado y anulado) y `canje`.                                                         |
| `canje_tarjeta_id_negocio_id_key`              | `canje`                 | UNIQUE | `(tarjeta_id, negocio_id)`   | Prisma     | Prisma lo exige para declarar 1:1 sobre una FK compuesta. La garantía real es `canje_tarjeta_id_key`.                |
| `vinculacion_pendiente_id_local_id_key`        | `vinculacion_pendiente` | UNIQUE | `(id, local_id)`             | Sección 14 | Destino de la FK de `dispositivo_caja`.                                                                              |
| `dispositivo_caja_vinculacion_id_local_id_key` | `dispositivo_caja`      | UNIQUE | `(vinculacion_id, local_id)` | Prisma     | Prisma lo exige para declarar 1:1 sobre una FK compuesta. La garantía real es `dispositivo_caja_vinculacion_id_key`. |

### Claves primarias

| Restricción                  | Tabla                   | Tipo | Definición                          | Invariante | Qué impide                                                                                                                                 |
| ---------------------------- | ----------------------- | ---- | ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin_plataforma_pkey`      | `admin_plataforma`      | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `negocio_pkey`               | `negocio`               | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `local_pkey`                 | `local`                 | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `usuario_negocio_pkey`       | `usuario_negocio`       | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `usuario_local_pkey`         | `usuario_local`         | PK   | `(usuario_id, local_id)`            | Modelo     | Asignar dos veces el mismo usuario al mismo local.                                                                                         |
| `dispositivo_caja_pkey`      | `dispositivo_caja`      | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `vinculacion_pendiente_pkey` | `vinculacion_pendiente` | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `turno_caja_pkey`            | `turno_caja`            | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `programa_pkey`              | `programa`              | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `condicion_sello_pkey`       | `condicion_sello`       | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `cliente_pkey`               | `cliente`               | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `dispositivo_cliente_pkey`   | `dispositivo_cliente`   | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `tarjeta_pkey`               | `tarjeta`               | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `sello_pkey`                 | `sello`                 | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `canje_pkey`                 | `canje`                 | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `peticion_idempotente_pkey`  | `peticion_idempotente`  | PK   | `(dispositivo_id, endpoint, clave)` | Sección 9  | Dos respuestas guardadas para el mismo reintento. La clave es por tablet y por endpoint: la misma clave en otro endpoint es otra petición. |
| `registro_pendiente_pkey`    | `registro_pendiente`    | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |
| `tope_peticion_pkey`         | `tope_peticion`         | PK   | `(clave, ventana)`                  | Sección 6  | Dos cuentas para lo mismo en la misma hora: cada instancia de la api sumaría en la suya y el tope dejaría de contar.                       |
| `intento_caja_pkey`          | `intento_caja`          | PK   | `(id)`                              | Modelo     | Filas sin identidad.                                                                                                                       |

### FK simples

Todas `RESTRICT`: no se puede borrar un padre con hijos (INV-17).

| Restricción                                      | Tabla                   | Tipo | Definición                                     | Invariante | Qué impide                                                                                                                                                         |
| ------------------------------------------------ | ----------------------- | ---- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `local_negocio_id_fkey`                          | `local`                 | FK   | `(negocio_id) → negocio(id)`                   | INV-17     | Un local huérfano, o borrar un negocio con locales.                                                                                                                |
| `usuario_negocio_negocio_id_fkey`                | `usuario_negocio`       | FK   | `(negocio_id) → negocio(id)`                   | INV-17     | Un usuario sin negocio.                                                                                                                                            |
| `vinculacion_pendiente_creado_por_admin_id_fkey` | `vinculacion_pendiente` | FK   | `(creado_por_admin_id) → admin_plataforma(id)` | Sección 5  | Atribuir una vinculación a un admin que no existe. Es el otro origen posible del código: el admin vincula las tablets en la capacitación del primer día.           |
| `dispositivo_caja_local_id_fkey`                 | `dispositivo_caja`      | FK   | `(local_id) → local(id)`                       | INV-17     | Una tablet de un local que no existe.                                                                                                                              |
| `programa_negocio_id_fkey`                       | `programa`              | FK   | `(negocio_id) → negocio(id)`                   | INV-17     | Un programa sin negocio.                                                                                                                                           |
| `condicion_sello_negocio_id_fkey`                | `condicion_sello`       | FK   | `(negocio_id) → negocio(id)`                   | INV-17     | Una condición sin negocio. No se puede violar sola: un negocio inexistente viola también `condicion_sello_autor_mismo_negocio_fkey`, así que no tiene test propio. |
| `dispositivo_cliente_cliente_id_fkey`            | `dispositivo_cliente`   | FK   | `(cliente_id) → cliente(id)`                   | INV-17     | Un equipo de cliente sin cliente.                                                                                                                                  |
| `tarjeta_cliente_id_fkey`                        | `tarjeta`               | FK   | `(cliente_id) → cliente(id)`                   | INV-17     | Una tarjeta sin cliente.                                                                                                                                           |
| `codigo_usado_cliente_id_fkey`                   | `codigo_usado`          | FK   | `(cliente_id) → cliente(id)`                   | INV-9      | Registrar el consumo de un código de nadie.                                                                                                                        |
| `codigo_usado_negocio_id_fkey`                   | `codigo_usado`          | FK   | `(negocio_id) → negocio(id)`                   | INV-9      | Auditar un consumo contra un negocio inexistente.                                                                                                                  |
| `peticion_idempotente_dispositivo_id_fkey`       | `peticion_idempotente`  | FK   | `(dispositivo_id) → dispositivo_caja(id)`      | Sección 9  | Guardar el reintento de una tablet que no existe. Cada tablet tiene su propio espacio de claves.                                                                   |
| `registro_pendiente_local_id_fkey`               | `registro_pendiente`    | FK   | `(local_id) → local(id)`                       | Sección 3  | Un registro de un local que no existe. El local sale del QR impreso del mostrador.                                                                                 |
| `registro_pendiente_cliente_id_fkey`             | `registro_pendiente`    | FK   | `(cliente_id) → cliente(id)`                   | Sección 3  | Confirmar un registro contra una cuenta inexistente.                                                                                                               |

## Lo que la base todavía no impide

- **Borrar un `sello` o un `canje`.** Son filas sin hijos: ninguna FK frena su
  `DELETE`. Cerrarlo requiere revocar `DELETE` al rol de aplicación en
  Postgres. Hay un test marcado como pendiente que lo recuerda y que empieza a
  fallar el día que se cierre, para que alguien lo pase a test normal.
- **Que una asignación `usuario_local` siga activa** al abrir turno o generar
  un código de vinculación. La FK exige que la asignación exista, no que
  `activo` sea verdadero.
- **Todo lo que depende del reloj o del orden de operaciones:** vencimiento
  (INV-13), reinicio del reloj al canjear (INV-14), reasignación de sobrantes
  (INV-15), el `UPDATE … WHERE estado = 'activa'` del canje (INV-16), la
  transacción única del sellado (INV-19). Son código y se testean con el flujo.
