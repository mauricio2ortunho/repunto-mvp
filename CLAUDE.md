# CLAUDE.md

Contexto permanente del proyecto. Leer completo antes de escribir código.
Complementos en `docs/`: `especificacion-funcional.md` y `modelo-datos-fidelizacion.pdf`.

---

## 1. Qué es esto

Plataforma de fidelización que reemplaza la tarjeta de cartón de sellos.
El administrador de plataforma da de alta cada negocio a mano; el negocio
configura su promo; sus cajeros otorgan sellos validados; el cliente ve su
progreso en el teléfono.

**Estado:** MVP para piloto con 15 negocios en Santa Cruz de la Sierra, Bolivia.

**Fuera de alcance del MVP.** No implementar, no sugerir, no dejar a medio hacer:

- Acumulación transversal entre negocios, moneda común, niveles o tiers.
- Varios programas activos por negocio a la vez.
- Tarjetas de reto (sello diario, ventana de 21 días).
- Puntos por monto gastado, referidos, pagos o facturación dentro de la app.
- Calendario de condiciones programadas por fecha.
- App nativa, i18n.
- Auto-registro de negocios: el alta es manual.

Si una tarea pide algo de esa lista, detenerse y preguntar antes de escribir código.

---

## 2. Stack

| Capa | Elección |
|---|---|
| Base de datos | PostgreSQL 16 |
| ORM / migraciones | Prisma |
| API | NestJS (TypeScript, `strict: true`) |
| PWA cliente | Next.js App Router, con service worker |
| Panel negocio | Next.js App Router, app separada |
| Validación | Zod, compartido vía `packages/contratos` |
| Tests | Vitest; integración contra Postgres real |
| Monorepo | pnpm workspaces + Turborepo |
| Hosting API, base y cron | Railway |
| Hosting frontends | Vercel |
| Imágenes (logo, portada) | Cloudflare R2, URLs en la base |
| Errores | Sentry, en las tres apps |
| Mensajería | WhatsApp Cloud API, SMS como respaldo |
| Zona horaria | `America/La_Paz` (UTC-4, sin DST) |

Nada de esto se cambia sin decirlo. Si una librería nueva parece necesaria,
explicar qué problema resuelve y qué alternativa estándar se descartó.

---

## 3. Estructura

```
apps/
  api/           NestJS. Controllers, guards, adaptadores de Prisma, cron.
  cliente/       PWA del cliente final.
  panel/         Panel de caja, de supervisor, de dueño y de administración.
packages/
  dominio/       Lógica de negocio pura. Sin HTTP, sin Prisma, sin reloj del sistema.
  contratos/     Tipos y esquemas Zod compartidos entre api y frontends.
docs/
prisma/
  schema.prisma
  migrations/
```

**Regla de dependencias, no negociable:**

```
cliente ─┐
panel  ──┼──> contratos <── api ──> dominio
         ┘                            │
                                  (no importa nada)
```

- `packages/dominio` no importa Prisma, Nest, Next ni nada de infraestructura.
  Recibe datos planos y devuelve decisiones. Se testea sin base de datos.
- `apps/api` traduce HTTP y Prisma hacia y desde `dominio`. Los controllers no
  contienen reglas de negocio: validan, llaman al caso de uso, mapean el error.
- Ningún frontend importa de `apps/api` ni de `packages/dominio`. Solo `contratos`.
- `dominio` nunca lee la hora del sistema. El reloj se pasa como parámetro. Es lo
  que hace testeables el vencimiento, el intervalo entre sellos y la ventana del
  código.

**La lista de códigos de error está repetida a propósito.** `CODIGOS_DE_ERROR`
vive en `packages/dominio`, que es quien la decide, y otra vez en
`packages/contratos` como `CODIGOS_DE_ERROR_DE_CAJA`, porque los frontends la
necesitan para mostrar el mensaje y `contratos` no puede importar `dominio` sin
romper el dibujo de arriba. No "arreglarlo" importando dominio desde contratos:
la copia es el precio correcto de la regla, y es barata. Un test en `apps/api`
—el único paquete que ve los dos— falla si las listas dejan de coincidir.

---

## 4. Invariantes del negocio

Reglas que no se rompen nunca. Cada una debe tener al menos un test que falle si
se viola. Si una tarea obliga a violar una, es la tarea la que está mal: parar y
preguntar.

**Alcance y permisos**

- **INV-1** — Ningún endpoint autenticado acepta `negocio_id`, `local_id` ni
  `cliente_id` desde el body o la query. El alcance sale siempre del token.
- **INV-2** — El `local_id` de un sello o canje sale del dispositivo de caja
  vinculado, nunca del request.
- **INV-3** — Un cajero o supervisor solo opera en los locales que tiene asignados.
- **INV-4** — La búsqueda de clientes en caja devuelve solo coincidencia exacta de
  teléfono, solo clientes con tarjeta en ese negocio, y con tope de intentos.

**Programa y condición**

- **INV-5** — Un `programa` nunca se edita. Cambiar premio, cantidad de sellos,
  vigencia o intervalo crea una versión nueva y marca la anterior como no vigente.
  Solo una versión vigente por negocio.
- **INV-6** — Una `tarjeta` nunca cambia de `programa_id`. Las tarjetas en curso
  terminan con la regla con la que empezaron.
- **INV-7** — Una `condicion_sello` nueva aplica solo hacia adelante. Nunca
  invalida un sello ya otorgado. La vigente es la de `vigente_desde` más reciente.
- **INV-8** — La condición vive a nivel negocio, no de local. Una marca no puede
  tener dos condiciones simultáneas en sucursales distintas.

**Sellos, tarjetas y canje**

- **INV-9** — Un código rotativo se consume una sola vez. Índice único en
  `codigo_usado(cliente_id, ventana)` — global, no por negocio — y el insert
  ocurre **antes** de crear el sello, en la misma transacción.
- **INV-10** — El progreso de una tarjeta es el conteo de sellos no anulados. No
  existe contador denormalizado como fuente de verdad. Si se agrega por
  rendimiento, es caché derivada y debe poder recalcularse.
- **INV-11** — Existe como máximo una tarjeta `activa` por `(cliente, negocio)`.
  Índice único parcial.
- **INV-12** — Una tarjeta sin sellos no vence: `reloj_desde` y `vence_el` son
  nulos hasta el primer sello.
- **INV-13** — Con el primer sello, `vence_el` = fin del día en `America/La_Paz`
  del mismo día del mes siguiente. Mes calendario, no 30 días.
- **INV-14** — Al canjear, la tarjeta nueva reinicia el reloj: `reloj_desde` es la
  fecha del canje, no la del sello sobrante más viejo. **INV-12 tiene
  precedencia:** si el canje no arrastra sobrantes, la tarjeta nueva nace vacía y
  el reloj no arranca. Leídos por separado los dos invariantes se contradicen;
  manda INV-12, porque una tarjeta sin sellos no vence.
- **INV-15** — Los sellos sobrantes de un canje se reasignan a la tarjeta nueva
  conservando su fecha y local originales. Nunca se borran.
- **INV-16** — Un canje solo procede sobre una tarjeta `activa` con progreso
  suficiente, mediante `UPDATE ... WHERE estado = 'activa'` verificando filas
  afectadas. Cero filas afectadas = alguien ya canjeó.
- **INV-17** — Anular un sello lo marca. Nunca hace DELETE. Ninguna entidad con
  historial se borra físicamente.
- **INV-18** — Un sello se otorga en un local del mismo negocio del programa de la
  tarjeta.
- **INV-19** — Todo el flujo de sellado ocurre en una sola transacción.

**Datos**

- **INV-20** — El teléfono se almacena en E.164 (`+591XXXXXXXX`), único a nivel
  global, normalizado en el borde de la API antes de cualquier consulta.
- **INV-21** — Todo timestamp se almacena en UTC. Todo corte de día, semana o mes
  se calcula en `America/La_Paz`.
- **INV-22** — Las imágenes viven en R2; en la base solo la URL. Nunca binarios en
  Postgres.

---

## 5. Roles

| Rol | Alcance | Cómo entra |
|---|---|---|
| `admin_plataforma` | Crea negocios, locales y usuarios. Suspende negocios, exporta, ve señales de fraude entre negocios. | Teléfono + código |
| `dueno` | Su negocio: programa, condición, locales, usuarios, dispositivos, métricas, clientes propios. | Teléfono + código |
| `supervisor` | Su local: canjear, anular sellos de cualquier cajero del local, gestionar PIN de su equipo, métricas de su sucursal, editar la condición. **No toca el programa.** | PIN sobre dispositivo vinculado |
| `cajero` | Sellar, canjear, anular su último sello, confirmar registros. Solo en sus locales. | PIN sobre dispositivo vinculado |
| `cliente` | Sus propias tarjetas. | Teléfono + código, o confirmación presencial |

Un cajero nunca ve la base de clientes, no cambia el programa y no envía
notificaciones. Los guards se testean por rol, no se revisan a ojo.

**Caja: se autentica el equipo, no la persona.** La tablet se vincula una vez con
un código de vinculación y su sesión no vence hasta que se revoque. Sobre ella,
cada cajero abre turno tocando su nombre en la lista del dispositivo y escribiendo
su PIN de cuatro dígitos. El nombre identifica, el PIN confirma y la autoridad la
tiene el dispositivo. Revocar un dispositivo lo invalida al instante.

**La confirmación presencial autentica a alguien nuevo.** El alta en el
mostrador reemplaza al código de verificación solo cuando la cuenta se crea en
ese acto. Si el teléfono ya tenía cuenta, el cajero confirma igual —se abre la
tarjeta y se otorga el sello, porque la persona está enfrente—, pero el equipo
que escribió ese teléfono no recibe la sesión: para entrar hay que verificar por
código. **La verificación por código gana siempre sobre la confirmación
presencial.** Sin esa distinción, cualquiera en la fila se lleva la cuenta de
otro escribiendo su teléfono y dejando que el cajero vea un nombre razonable.
Lo sostiene también la base: `registro_pendiente_sesion_solo_si_cuenta_nueva_chk`.

**Una tablet, un turno abierto.** El turno de un sello sale del dispositivo y no
del request (INV-2), así que "el turno abierto de esta tablet" tiene que resolver
a uno solo. Lo garantiza un índice único parcial sobre `turno_caja(dispositivo_id)`
entre los turnos sin cerrar, no el código.

**El PIN no es único, y no hay que hacerlo único.** Dos cajeros del mismo local
pueden tener el mismo PIN: como primero se elige el nombre, no hay ambigüedad. No
imponer unicidad en ningún alcance —local, negocio ni global— y no buscar al
cajero por PIN. Con hash con sal tampoco se podría verificar en la base.

---

## 6. Definiciones fijas

No reinterpretar en cada pantalla. Viven en `packages/dominio` como constantes o
funciones puras.

- **Vigencia de la tarjeta:** 1 mes calendario desde el primer sello, al fin del
  día en La Paz. Configurable por programa; nulo significa que no vence.
- **Ventana del código:** 30 segundos. Se acepta la actual y la anterior.
- **Código que el cliente muestra en caja:** `K7Q4M-418329`. Las cinco primeras
  posiciones son su `codigo_publico`, estable y único global, de un alfabeto sin
  caracteres ambiguos —sin 0, O, 1, I, L, 5 ni S—; las seis siguientes son un
  TOTP de su semilla. El prefijo identifica y el TOTP autentica. Se valida
  insensible a mayúsculas, espacios y guiones. Un prefijo que no existe y un
  TOTP equivocado devuelven el mismo `CODIGO_INVALIDO`: distinguirlos permitiría
  enumerar clientes.
- **Deshacer sello:** 5 minutos, solo el último sello del propio cajero. El
  supervisor puede anular cualquier sello de su local.
- **Cliente activo:** al menos un sello en los últimos 60 días.
- **Cliente enfriado:** 3 o más sellos en su historia y ninguno en los últimos 30 días.
- **Cliente nuevo del mes:** su primer sello en ese negocio cayó dentro del mes.
- **Frecuencia de retorno:** mediana de días entre sellos consecutivos del mismo
  cliente en el mismo negocio. Mediana, no promedio.
- **Tarjetas abiertas (métricas):** solo las que tienen al menos un sello. Las
  vacías no cuentan.
- **Tope de envío de códigos:** 3 por teléfono por hora, 10 por día; 20 por IP por
  hora.
- **Tope de notificaciones del negocio:** 2 por semana por negocio.
- **Retención de respaldos:** diario, 30 días.

---

## 7. Trabajos programados

Corren en Railway, en `apps/api`, con candado para que no se solapen. Cada uno es
idempotente: correr dos veces no cambia el resultado.

| Tarea | Frecuencia |
|---|---|
| Vencer tarjetas cuyo `vence_el` ya pasó | Diaria, 00:15 hora La Paz |
| Avisar al cliente con sellos en curso y pocos días restantes | Diaria |
| Purgar `codigo_usado` con más de 24 horas | Cada hora |
| Recalcular clientes enfriados por negocio | Diaria |
| Alerta de local sin sellos en 7 días | Diaria |

---

## 8. Observabilidad

El objetivo del proyecto es que nada se rompa en silencio. Tres cosas, no
negociables:

1. **Sentry** en api, cliente y panel, con alerta a WhatsApp o correo.
2. **Log estructurado** en JSON con `request_id`, y en el flujo de sellado también
   `cliente_id`, `local_id`, `turno_id`. Debe poder responder "qué pasó con el
   sello de Juan el martes" sin adivinar.
3. **Chequeo de salud por local:** última vez que cada dispositivo de caja selló.
   Un local en cero es un local donde el sistema se abandonó.

Nunca registrar en el log el código rotativo, la semilla TOTP ni el PIN.

---

## 9. Convenciones

**Idioma.** Los términos del dominio van en español, en código y en base de datos:
`negocio`, `local`, `programa`, `condicion`, `tarjeta`, `sello`, `canje`, `turno`,
`cajero`, `supervisor`. No traducirlos. Lo genérico de infraestructura
(`repository`, `service`, `guard`, `handler`) va en inglés. No mezclar dentro de un
mismo identificador.

**Base de datos.** Tablas y columnas en `snake_case` singular (`sello`,
`tarjeta_id`). Toda tabla con `creado_el`. Nunca borrado físico donde hay
historial. Montos en `decimal`, nunca en float.

**Errores.** Códigos tipados, no strings sueltos. El flujo de sellado distingue al
menos: `CODIGO_INVALIDO`, `CODIGO_YA_USADO`, `DEMASIADO_PRONTO`,
`TARJETA_COMPLETA`, `TARJETA_VENCIDA`, `LOCAL_NO_AUTORIZADO`,
`DISPOSITIVO_REVOCADO`, `NEGOCIO_SUSPENDIDO`. El mensaje que ve el cajero le dice
qué hacer, no qué falló internamente.

La lista vive en `packages/dominio` (`CODIGOS_DE_ERROR`) y agrega cuatro:
`TURNO_CERRADO`; `PROMO_NO_CONFIGURADA`, que es un error del dueño y cuyo mensaje
le dice al cajero que avise, no que reintente; y `TARJETA_INCOMPLETA` y
`CANJE_EN_OTRO_LOCAL`, del canje. Un local dado de baja es
`LOCAL_NO_AUTORIZADO`.

**Idempotencia.** Todo endpoint que crea algo (sello, canje, registro, envío de
código) acepta `Idempotency-Key` y devuelve el mismo resultado ante reintento. El
cajero va a tocar el botón dos veces.

La clave se guarda en `peticion_idempotente`, con el dispositivo y el endpoint
como parte de la clave primaria, y la fila se inserta **dentro de la misma
transacción** que resuelve el pedido. Eso hace innecesario cualquier estado "en
curso": el segundo intento queda bloqueado en el índice hasta que el primero
termina, y ahí lee su respuesta y la devuelve. Un rechazo no se guarda: si la
transacción se deshizo, el reintento vuelve a decidir con el estado del momento.
Misma clave con otro cuerpo se rechaza, porque no es un reintento.

**Migraciones.** Siempre por Prisma, versionadas, reversibles, nunca editar una ya
aplicada. Las restricciones de unicidad de los invariantes viven en la base, no
solo en el código.

**Contraste de color.** El color del negocio no define el color del texto encima:
se calcula por contraste y se elige blanco o negro. Nunca se deja elegir.

**Secretos.** `CLAVE_CIFRADO_SEMILLAS` son 32 bytes en base64 y cifra las
semillas TOTP de los clientes en reposo (AES-256-GCM). Es distinta en cada
entorno, y perderla en producción es perder todos los códigos de todos los
clientes. La semilla descifrada no sale del proceso de la API: ni en una
respuesta, ni en el log, ni en Sentry.

**Entornos.** `local` (Docker Compose), `staging` (Railway + Vercel preview) y
`produccion`. Ningún dato real en staging. `pnpm db:seed` crea un negocio de demo
con clientes ficticios, usable para mostrarle la app a un negocio que todavía no
tiene clientes.

**Postgres de Repunto en local: puerto 5434.** Ni 5432 ni 5433. En la máquina de
desarrollo el 5432 lo ocupa un PostgreSQL nativo de Windows (servicio
`postgresql-x64-16`) y el 5433 el contenedor de otro proyecto. Lo peligroso no es
el choque, es que no se nota: Windows dejó a Docker escuchar en el 5432 a la par
del servicio nativo, `docker compose up` arrancó sin error y Prisma se conectó en
silencio a la base equivocada. El único síntoma fue un `P1000 Authentication
failed` con credenciales correctas. Después de levantar la base, verificar con una
conexión real, no con que el contenedor haya arrancado.

---

## 10. Tests

Agregar una función no debe romper las existentes, y eso se sostiene con tests, no
con cuidado.

- **Dominio:** unitarios, sin base de datos. Toda regla de la sección 4 y toda
  definición de la sección 6 tiene su test.
- **Integración:** contra Postgres real, no mocks ni SQLite. Obligatorio para
  sellado, canje, vencimiento, registro asistido, vinculación de dispositivo y los
  guards por rol. Viven en `apps/api/test/`. Cada corrida borra y recrea
  `repunto_test` con `prisma migrate deploy` (nunca `db push`: omitiría el SQL
  crudo), cada test corre en su transacción y la deshace, y antes de cada test se
  exige que la base esté vacía. Si Postgres no responde, fallan: no se saltean.
- **Esquema:** `docs/garantias-de-la-base.md` lista todo lo que la base impide.
  Un test lo compara contra el catálogo y falla si algo falta, sobra, cambió de
  columnas o tiene un trigger deshabilitado; cada restricción violable tiene
  además su test de rechazo, que exige el nombre exacto de la restricción.
- **Concurrencia:** tres carreras con test propio — dos sellados simultáneos con el
  mismo código, dos canjes simultáneos sobre la misma tarjeta, y un sello que entra
  justo cuando el cron vence esa tarjeta. Todas deben terminar en un solo efecto
  coherente.
- **Bordes de fecha:** primer sello el 31 de enero, sello a las 23:59 hora La Paz,
  canje el día del vencimiento. Estos tres casos tienen test explícito.
- Un bug que llega a producción se reproduce primero con un test que falla.

---

## 11. Definición de terminado

1. Los tests pasan y los casos nuevos tienen test propio.
2. Los invariantes afectados siguen garantizados, y por restricción en base cuando
   corresponde.
3. Si cambió un contrato, se actualizó `packages/contratos` y los consumidores
   compilan.
4. Si cambió el esquema, hay migración versionada.
5. `typecheck` y `lint` limpios. Sin `any`, sin `@ts-ignore` sin justificación
   escrita al lado.
6. No quedó lógica de negocio dentro de un controller ni de un componente React.

---

## 12. Cómo trabajar

- Antes de escribir, decir en dos líneas qué archivos se van a tocar y por qué. Si
  el cambio toca más de cinco archivos, proponer el plan y esperar.
- Cambios chicos y completos. No dejar código a medio migrar entre dos enfoques.
- No refactorizar de paso. Si algo está mal pero funciona, anotarlo y seguir.
- Cuando la especificación no alcance para decidir, preguntar. No inventar reglas
  de negocio ni completar huecos con supuestos.

---

## 13. Comandos

```bash
pnpm install
pnpm dev                  # todas las apps
pnpm --filter api dev
pnpm test                 # unitarios
pnpm test:integration     # recrea repunto_test; requiere Postgres levantado
pnpm typecheck
pnpm lint
pnpm db:migrate           # prisma migrate dev + prisma generate
pnpm db:generate          # solo regenera el cliente de Prisma
pnpm db:seed              # negocio de demo con datos ficticios
```

---

## 14. Integridad por FK compuesta

Los invariantes de alcance entre negocios y locales (INV-2, INV-3, INV-8,
INV-11, INV-18) los garantiza Postgres, no el código. El patrón:

1. La tabla referenciada expone una clave única `(id, negocio_id)` —o
   `(id, local_id)`— que no es una regla de negocio: existe solo como destino de
   FK. En `schema.prisma` cada una lleva un comentario que lo dice.
2. La tabla que referencia lleva también la columna de alcance (`negocio_id` o
   `local_id`) y apunta a esa clave con una FK compuesta.
3. Como la columna de alcance es parte de la FK, no puede diferir de la del
   registro apuntado. No es una copia que alguien mantiene sincronizada: es
   imposible que se desincronice.
4. Cuando dos FK compuestas comparten la columna de alcance, obligan a que los
   dos registros apuntados sean del mismo negocio, o del mismo local. Ahí está
   la garantía.

**Las cinco columnas. No son redundancia a eliminar.** Quitar una, o cambiar una
FK compuesta por una simple "porque el dato ya está en otra tabla", reabre el
invariante que sostiene.

| Columna | FK compuestas | Sostiene |
|---|---|---|
| `tarjeta.negocio_id` | `(programa_id, negocio_id)` → `programa`; `(local_alta_id, negocio_id)` → `local` | INV-11: habilita el índice único parcial. La tarjeta y su local de alta son del negocio del programa. |
| `sello.negocio_id` | `(tarjeta_id, negocio_id)` → `tarjeta`; `(local_id, negocio_id)` → `local`; `(condicion_id, negocio_id)` → `condicion_sello` | INV-18 y INV-8 |
| `canje.negocio_id` | `(tarjeta_id, negocio_id)` → `tarjeta`; `(local_id, negocio_id)` → `local` | INV-18 para el canje |
| `turno_caja.local_id` | `(dispositivo_id, local_id)` → `dispositivo_caja`; `(usuario_id, local_id)` → `usuario_local` | INV-3, y vía `sello` y `canje`, INV-2 |
| `usuario_local.negocio_id` | `(usuario_id, negocio_id)` → `usuario_negocio`; `(local_id, negocio_id)` → `local` | Un usuario solo se asigna a locales de su propio negocio |

Sin columna nueva, el mismo patrón cierra cuatro cosas más:

- `sello` y `canje` apuntan con `(turno_id, local_id)` a `turno_caja`: el local
  sale del turno y el turno sale del dispositivo (INV-2).
- `sello` apunta con `(anulado_turno_id, local_id)` a `turno_caja`: nadie anula
  sellos de otra sucursal desde su tablet.
- `condicion_sello` apunta con `(usuario_id, negocio_id)` a `usuario_negocio`:
  nadie escribe la condición de otra marca.
- `vinculacion_pendiente` apunta con `(creado_por_usuario_id, local_id)` a
  `usuario_local`: el código de vinculación de una tablet lo genera alguien
  asignado a ESE local, no solo alguien del mismo negocio. Consecuencia: el
  dueño tiene que estar asignado al local para vincular una tablet.

  El `admin_plataforma` no pertenece a ningún negocio y por eso no puede entrar
  por esa FK, pero es quien vincula las tablets en la capacitación del primer
  día. Tiene su propio origen: `creado_por_admin_id`, con FK a
  `admin_plataforma`. Un CHECK exige **exactamente uno** de los dos, nunca los
  dos ni ninguno, así que cada tablet vinculada sabe quién la vinculó sin
  aflojar la garantía del caso normal.

**Al escribir código contra estas tablas**, la columna de alcance se toma del
registro padre —el `negocio_id` de la tarjeta, el `local_id` del turno—, nunca
del request (INV-1). Si un insert falla por una de estas FK, no es un error de
datos: es un bug de alcance o un intento de fraude, y se registra como tal.

**Límite de INV-3.** La FK garantiza que la asignación `usuario_local` exista,
no que siga activa. Una asignación dada de baja (`activo = false`) conserva la
fila porque los turnos viejos la referencian (INV-17). Que el usuario esté
asignado *hoy* lo verifica el código al abrir turno y al generar un código de
vinculación.

### Lo que Prisma no expresa

Los índices únicos parciales (INV-5, INV-11), los CHECK y los triggers viven como
SQL crudo al final de cada `migration.sql`. El inventario de todo lo que
garantiza la base, con el invariante de cada restricción, es
`docs/garantias-de-la-base.md`, y lo verifica `pnpm test:integration`.

Verificado con Prisma 7.10: `migrate dev` los ignora al calcular diferencias y
no intenta dropearlos, ni siquiera ante cambios sobre las mismas tablas, sobre el
enum que usa un `WHERE` o sobre el tipo de una columna. El reverso: Prisma
tampoco detecta si alguien los borra. Eso lo cubren los tests de integración.
Toda restricción nueva de este tipo se agrega a `docs/garantias-de-la-base.md`
en el mismo commit; si no, el test de inventario falla.

**Triggers de inmutabilidad.** `tarjeta_programa_id_inmutable` (INV-6),
`programa_inmutable` (INV-5) y `condicion_sello_solo_insercion` (INV-7) rechazan
con `ERRCODE 23000` y se reportan con `CONSTRAINT` igual a su nombre: el código
los reconoce por `error.constraint`, como a cualquier restricción, nunca por el
texto del mensaje. `programa_inmutable` compara la fila entera menos `vigente`,
así que una columna nueva queda protegida sola. Consecuencia: un backfill
(`UPDATE programa SET columna_nueva = …`, o lo mismo sobre `condicion_sello`)
queda bloqueado. Esa migración tiene que hacer `DISABLE TRIGGER`, el `UPDATE` y
`ENABLE TRIGGER` explícitamente, y el test de inventario falla si el trigger
queda deshabilitado.

**Borrado físico (INV-17).** Todas las FK son `ON DELETE RESTRICT`: nada con
historial colgando se puede borrar. Pero una fila hoja (`sello`, `canje`) no
tiene hijos y la base permite su `DELETE`. Cerrarlo requiere revocar `DELETE` al
rol de aplicación en Postgres; pendiente para cuando exista ese rol.
`codigo_usado` es la única tabla que se purga físicamente, por diseño (sección 7).

### Límite conocido: un teléfono, un negocio

`usuario_negocio.telefono` es único global entre los no nulos, y obligatorio
para el dueño (que entra por teléfono; supervisor y cajero entran por PIN).
Consecuencia: una persona no puede ser dueña de dos negocios con el mismo
teléfono.

Cuando aparezca el caso, la salida es separar identidad de membresía: una tabla
`persona` con el teléfono, y `usuario_negocio` pasa a ser la membresía de una
persona en un negocio. No implementarlo antes de que el caso exista.

---

## 15. Deuda anotada

Lo que está a medio hacer a propósito, con el motivo. No es una lista de ideas:
es lo que falta terminar, y está acá para que no se pierda.

- **Verificación del teléfono por código (WhatsApp, con SMS de respaldo).** Es
  lo que falta para cerrar el acceso del cliente: hoy, quien se registra con un
  teléfono que ya tenía cuenta recibe `verificacion_requerida` y no tiene cómo
  seguir. Necesita la cuenta de WhatsApp Business con plantillas aprobadas, que
  es trámite y no código (especificación, sección 14).

  Con ese flujo entra una regla que ya está decidida y todavía no implementada:
  **cuando el dueño real verifique ese teléfono por código, las sesiones creadas
  por confirmación presencial para esa cuenta se revocan. La verificación por
  código gana siempre.** El estado está preparado: `dispositivo_cliente.origen`
  distingue `presencial` de `codigo`, así que revocarlas es un `UPDATE` sobre
  las presenciales de ese cliente.

- **Fuga conocida y aceptada.** `GET /registros/mio` le revela a quien tiene el
  ticket que ese teléfono ya tenía cuenta: responde `verificacion_requerida` en
  lugar de entregar la sesión. Se acepta porque para llegar ahí hay que haber
  pasado por el mostrador —un cajero confirmó a una persona física— y porque el
  registro tiene tope por teléfono y por IP. No cerrarla es una decisión, no un
  descuido.

- **Los trabajos programados de la sección 7.** Ninguno corre. El más urgente es
  el de vencer tarjetas: mientras no exista, una tarjeta vencida solo se cierra
  cuando el cliente vuelve a sellar. A la purga diaria de `codigo_usado` se le
  suma ahora la de `peticion_idempotente`, con el mismo criterio de 24 horas.
  Los `registro_pendiente` no se purgan: uno que nadie confirmó es la señal de
  que en ese local no están ofreciendo la tarjeta (especificación, sección 11).
- **El tope del endpoint del código vive en memoria.** 120 peticiones por hora
  por cliente, contadas en el proceso. Con una sola instancia de la API alcanza;
  con dos, cada una cuenta la suya y el tope real se duplica. Cuando haya más de
  una instancia, se muda a la base o a Redis.
- **El log estructurado de la sección 8.** Todavía no hay `request_id` ni las
  líneas JSON con `cliente_id`, `local_id` y `turno_id` del flujo de sellado.
  Hoy, "qué pasó con el sello de Juan el martes" se responde con SQL.
