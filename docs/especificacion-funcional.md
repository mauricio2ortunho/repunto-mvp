# Especificación funcional — MVP

Referencia de comportamiento. `CLAUDE.md` manda sobre arquitectura e invariantes;
este documento describe qué hace el producto y por qué.

---

## 1. Actores

- **Administrador de plataforma.** Da de alta los negocios, sus locales y sus
  usuarios, todo a mano. Supervisa el piloto.
- **Dueño.** Configura la promo, administra locales, usuarios y dispositivos, mira
  métricas de todas sus sucursales.
- **Supervisor.** Encargado de un local. Canjea, anula sellos de su equipo,
  gestiona los PIN de sus cajeros, edita la condición vigente y ve las métricas de
  su sucursal. No toca el programa.
- **Cajero.** Sella, canjea y confirma registros en su local.
- **Cliente final.** Junta sellos, ve su progreso, canjea premios.

No hay auto-registro de negocios. El alta manual es deliberada: con quince
negocios revisar cada logo y cada portada antes de que salgan en vivo toma un
minuto y evita sorpresas.

---

## 2. Acceso al panel

El dueño entra con teléfono y código, desde su propio celular, una o dos veces por
semana.

En el mostrador es distinto. La tablet del local se vincula una sola vez con un
código de vinculación, y esa sesión no vence hasta que alguien la revoque. Sobre
ella, cada cajero abre su turno con un PIN de cuatro dígitos.

Eso da tres cosas: cero mensajes en caja, el local sale del dispositivo en lugar de
viajar en el request, y cada sello queda firmado con el cajero correcto. Si la
tablet se pierde, el dueño revoca el dispositivo desde su panel y deja de servir al
instante. Cuando un cajero se va, se le da de baja el PIN.

---

## 3. Alta del cliente

El registro ocurre en el mostrador. Flujo principal:

1. El cliente escanea el QR impreso del local y escribe su teléfono y nombre en su
   propio equipo.
2. Queda como registro pendiente y aparece al instante en el panel del local.
3. El cajero confirma. Esa confirmación presencial reemplaza al código de
   verificación y ahorra el costo del mensaje.
4. El panel ofrece dos botones: **confirmar y sellar**, cuando la compra califica,
   y **solo confirmar**, para quien se registra sin comprar. Lo decide el cajero,
   no el sistema.

Flujo alterno, cuando el panel del local no está disponible: código de verificación
por WhatsApp, con SMS como respaldo.

Las cuentas creadas por la vía presencial quedan con teléfono no verificado. Se
pide verificación recién cuando el cliente intenta entrar desde un equipo que no
conoce.

**La confirmación presencial autentica a alguien nuevo, no a alguien que ya
existe.** Si el teléfono que se escribió ya tiene cuenta, el cajero confirma
igual —la tarjeta se abre y el sello se otorga, porque la persona está ahí—,
pero el equipo desde el que se escribió NO recibe la sesión de esa cuenta: para
entrar hay que verificar el teléfono por código. Sin esta distinción, cualquiera
en la fila podría escribir el teléfono de otro, dejar que el cajero confirme un
nombre razonable y llevarse la cuenta ajena entera, con sus tarjetas y con su
código para sellar y canjear. La verificación por código gana siempre sobre la
confirmación presencial.

**Tope de pendientes por local.** El registro es el único paso sin credencial
—el QR está impreso y se puede fotografiar—, así que la lista del cajero tiene
un máximo. Pasado ese número, el registro nuevo recibe la misma respuesta de
siempre y no entra: el que la está llenando no tiene por qué enterarse.

El correo es opcional y no se pide en el registro. Se ofrece más adelante, cuando
el cliente ya tiene sellos que le importa no perder.

**Cliente que ya existe.** Con quince negocios, lo habitual va a ser alguien con
cuenta que escanea el QR de un negocio donde nunca compró. Eso no es un registro:
es abrir una tarjeta nueva. El flujo lo reconoce por el teléfono y salta directo a
la confirmación.

---

## 4. Qué habilita un sello

El premio es fijo y la condición varía. Esa asimetría es deliberada: el premio fijo
da confianza, la condición variable mantiene la cosa viva.

El dueño o el supervisor definen la condición vigente: un producto específico, un
monto mínimo de compra, o lo que decidan. La cambian cuando quieren, por ejemplo
cada tres días. Vive a nivel de la marca, no de la sucursal, para que un negocio no
termine con tres promociones distintas bajo el mismo nombre.

El sistema no puede verificar la condición. Sin integración con la caja del
negocio, no hay forma de saber si la persona gastó 50 bolivianos o compró el
producto correcto: lo decide el cajero mirando. El panel se la muestra encima del
botón como recordatorio, no como validación.

La condición vigente se ve también en la app del cliente, con una redacción que
deje claro que la define el negocio y puede cambiar. Cada cambio queda registrado
con su autor y su fecha: cuando alguien diga "ayer decía que valía el capuchino",
hay que poder mirarlo. De paso, ese historial responde qué producto movió más
sellos.

Un cambio aplica desde que se guarda. Nunca invalida un sello ya otorgado.

**Aviso al cliente.** La condición cambia sin notificar: eso es lo normal. Avisar
por push es una decisión aparte que el supervisor toma al guardar, con tope de dos
por semana por negocio. Si se notificara cada cambio, la base se quema en dos
semanas y los clientes desinstalan.

---

## 5. Sellado

El cliente genera un código rotativo de 6 dígitos en su app; el cajero lo tipea en
el panel. Esta dirección es deliberada: si el código lo mostrara el negocio,
cualquiera en la fila podría fotografiarlo y sellarse desde su casa.

Validaciones, en este orden y en una sola transacción:

1. El dispositivo está vinculado y no revocado; de él sale el local. El turno está
   abierto y el cajero tiene ese local asignado.
2. El negocio no está suspendido.
3. El código resuelve a un cliente, aceptando la ventana actual y la anterior.
4. Se registra el consumo del código. Si ya estaba registrado, se rechaza.
5. Se busca la tarjeta activa del cliente; si no existe, se crea con el programa
   vigente. **Si la que hay está vencida, se cierra y se abre una nueva**: el cron
   que vence tarjetas corre una vez por día, y trabar al cajero con el cliente
   enfrente y la compra hecha, hasta las 00:15 del día siguiente, es el peor
   momento posible para hacerlo esperar. Los sellos de la vencida no se arrastran:
   el progreso arranca de cero, que es lo que significa que haya vencido.
6. Se verifica el intervalo mínimo entre sellos configurado en el programa.
7. Se verifica que la tarjeta no esté completa. Si lo está, no se sella: se canjea.
   Una tarjeta vencida no llega hasta acá, porque ya se reemplazó en el paso 5.
8. Se inserta el sello, con la condición vigente adjunta. Si es el primero, se fija
   el vencimiento.

La respuesta debe traer nombre del cliente, progreso nuevo, cuántos faltan y si
acaba de completar la tarjeta. El cajero necesita poder decirlo en voz alta; ese
aviso verbal es la mitad del valor del sistema.

**Monto.** Si el programa lo pide, el panel ofrece cargar el monto **después** de
confirmar el sello, con la pantalla ya libre. Opcional y apagado por defecto. Si se
saltea, no se rompe nada. Cuando esté cargado en la mitad de los sellos da el
argumento de venta más fuerte que hay: cuánto gasta un cliente con tarjeta
comparado con uno sin tarjeta.

**Anulación.** El cajero puede deshacer su último sello durante 5 minutos; el
supervisor puede anular cualquiera de su local. Marca, no borra. Una frecuencia
alta de anulaciones en un local es una señal a vigilar.

**Sin conexión.** El panel no sella sin internet. Ofrece anotar el teléfono del
cliente en una lista de pendientes, y el dueño los confirma después desde su panel.
La fricción es visible y auditada; validar códigos sin poder verificarlos no es una
opción.

---

## 6. Vencimiento

El reloj arranca con el primer sello. Una tarjeta vacía no vence nunca, porque el
reloj no arrancó.

La vigencia del MVP es de un mes calendario: si el primer sello fue el 31 de enero,
vence el 28 de febrero, al final del día en hora de La Paz. Vencer a la hora exacta
del primer sello se siente arbitrario; el mes calendario es la regla que la gente
entiende sola.

Al canjear, el reloj se reinicia: la tarjeta nueva cuenta desde el canje, no desde
el sello sobrante más viejo. La intención es impulsar la próxima compra, no
castigar a alguien que acaba de comprar diez veces.

Un vencimiento invisible es la forma más rápida de que alguien sienta que le
robaron. La cuenta regresiva va visible en la tarjeta, no escondida, y hay aviso al
cliente cuando quedan pocos días con sellos en curso.

---

## 7. Canje

Lo confirma siempre el negocio, nunca el cliente desde su teléfono. Antes de
confirmar, el cajero ve el premio en texto para no entregar algo equivocado.

**Pide el código del cliente, igual que el sellado.** Lo confirma el negocio, pero
con el cliente presente: un cajero que pudiera canjear la tarjeta de alguien
ausente podría quedarse con el premio, y que quede auditado no lo devuelve. No es
fricción real, porque el cliente está ahí esperando su premio con la app abierta.
Consecuencia: el canje también consume una ventana del código rotativo.

Al canjear: se registra el canje, la tarjeta pasa a canjeada, se abre una tarjeta
nueva y los sellos sobrantes se reasignan a ella conservando su fecha y local
originales.

Dónde se puede canjear lo decide el negocio. El valor por defecto es en cualquier
sucursal. La comparación entre el local donde se acumuló y el local donde se canjeó
alimenta el reporte que las franquicias usan para arreglar cuentas entre ellas.

---

## 8. Programa

El dueño configura: cantidad de sellos, premio en texto, vigencia de la tarjeta,
horas mínimas entre sellos y si se pide el monto.

Cambiar cualquiera de esos valores crea una versión nueva. Las tarjetas en curso
mantienen la regla anterior. La pantalla debe advertirlo de forma explícita al
guardar, porque el dueño va a suponer que cambió todo.

El supervisor no toca el programa. Esa es plata de la marca, sobre todo si hay
franquicias.

---

## 9. Personalización

El negocio elige logo, foto de portada, un color principal, una plantilla de
tarjeta entre tres o cuatro, y el ícono del sello de una lista corta. Con eso la
tarjeta se ve suya, que es lo que hace que el cliente la sienta del negocio y no
nuestra.

No hay editor libre ni fondos propios. Un editor abierto trae dos problemas
garantizados: tarjetas ilegibles que después son nuestro soporte, y diseños que no
entran en pantallas chicas.

El color elegido no define el color del texto encima: se calcula por contraste y se
usa blanco o negro. Sin esto vas a tener texto amarillo sobre fondo celeste.

El diseño no se versiona. Es visual y no afecta lo que el cliente ya ganó, así que
un cambio aplica a todas las tarjetas al instante. Los assets se cachean en la PWA
o las tarjetas se ven rotas sin conexión.

---

## 10. Pantallas

**App del cliente.** Lista de tarjetas ordenada por cercanía a completarse; detalle
con la condición vigente, la cuenta regresiva y el historial de sellos por fecha y
local; pantalla del código con número grande, cuenta regresiva y brillo elevado;
estado de tarjeta completa como variante visible del detalle, no como pantalla
aparte.

Las tarjetas y el progreso deben verse sin conexión. El código no.

**Panel de caja, lista de registros.** Nombre y los últimos cuatro dígitos del
teléfono, en grande. Con tres personas registrándose a la vez, el cajero
pregunta "¿terminado en 4521?" antes de confirmar; sin eso confirma la fila
equivocada. El teléfono entero no se muestra.

**Panel de caja.** Una sola vista: la condición vigente arriba, campo de código,
botón grande, y el resultado con nombre, progreso y la frase que el cajero le dice
al cliente. El foco vuelve al campo después de cada sello. Tarjeta completa cambia
la vista entera, no un número pequeño.

**El canje pide el código otra vez.** El sello que completa la tarjeta consume el
código, así que la pantalla de canje tiene que pedirle al cliente el que muestra
ahora, treinta segundos después. Es correcto —son dos operaciones y cada una
consume su ventana— pero se ve como si el primero no hubiera servido. La pantalla
lo dice con todas las letras: "Pedile el código de nuevo para entregarle el
premio", nunca un campo vacío sin explicación. Si el cajero cree que algo falló,
va a reintentar el sello y va a llamar al dueño.

**Panel del dueño.** Resumen con clientes que volvieron, nuevos y enfriados;
configuración del programa; condición vigente; locales, usuarios y dispositivos. El
número de enfriados es el único que lleva acción al lado.

**Administración de plataforma.** Alta de negocios y usuarios, suspensión,
exportación, y las señales de fraude entre negocios: locales con anulaciones altas
o con sellos muy por encima del resto.

---

## 11. El cajero es el canal de adquisición

Ningún cliente descarga nada si nadie le dice nada. Esto es parte del producto, no
algo que va a pasar solo.

En concreto: una frase escrita para que el cajero la diga, que el panel se la
muestre cuando el cliente no tiene tarjeta, y el número de registros nuevos por
local en el tablero de administración. Si un local capta cero clientes nuevos en
una semana, no es que el sistema no funcione: es que ahí nadie lo está ofreciendo,
y eso se arregla yendo.

La capacitación del primer día en cada local la hace el administrador de
plataforma, presencialmente.

---

## 12. Casos límite a resolver

- **Cambio de número.** Va a pasar en el primer mes. Hace falta una herramienta de
  administración que migre las tarjetas de un teléfono a otro, con registro de
  quién lo hizo.
- **Negocio suspendido.** Las tarjetas de sus clientes se congelan y la app lo
  informa con texto claro. No desaparecen.
- **Local cerrado.** Deja de sellar y conserva su historial.

---

## 13. Métricas del piloto

Se definen antes de lanzar, no después:

- Porcentaje de clientes registrados que vuelven al menos una vez más.
- Tarjetas completadas sobre tarjetas abiertas, contando solo las que tienen al
  menos un sello.
- Sellos por semana y por local. Si un local cae a cero, hay que ir a ver por qué.
- Registros nuevos por local.

---

## 14. Costos y límites operativos

Los códigos se envían por WhatsApp Cloud API con plantillas aprobadas
previamente. El trámite de la cuenta de WhatsApp Business exige marca y dominio
verificados y tarda, así que se arranca antes de necesitarlo.

Topes definidos en `CLAUDE.md`, sección 6. Sin ellos, cualquiera puede consumir el
presupuesto de mensajería en una tarde.

En iPhone, las notificaciones push de una PWA solo funcionan si el usuario agregó
la app a la pantalla de inicio. Eso cambia la promesa que se le hace al negocio
sobre poder avisarle a los clientes enfriados: hay que probarlo en un equipo real
antes de prometerlo.

---

## 15. Datos y acuerdos

El negocio ve y exporta únicamente sus propios clientes. El aislamiento es
responsabilidad de cada consulta y se testea por rol.

Hacen falta términos de uso y política de privacidad antes del primer negocio real:
qué se guarda, para qué, quién lo ve y cómo se borra. En el acuerdo del piloto
conviene dejar escrito que el negocio puede exportar sus datos y que la relación
con el cliente es de la plataforma.

El piloto entra con fecha de fin y precio conocido desde el inicio, aunque el
precio se ajuste después. A cambio, el negocio da feedback quincenal y permite ser
usado como caso de referencia.

Respaldo automático diario, retención de 30 días. Los sellos son plata.

---

## 16. Decisiones abiertas

- **Modelo de cobro** al terminar el piloto. Mensualidad escalonada por clientes
  activos es la dirección; el número no está definido. La comisión por premio
  canjeado quedó descartada: le da al negocio un incentivo para no registrar
  canjes.
- **Nombre del proyecto y dominio.** Bloquea el trámite de WhatsApp Business.
- **Tarjetas de reto** (21 días, sello diario, premio por constancia). Es otro
  producto y tiene sentido para gimnasios y comida saludable, pero requiere definir
  qué pasa al vencer con progreso a medias. Para que funcione como hábito, el
  intervalo mínimo debe ser de un día.
- **Varios programas activos** por negocio. La estructura lo soporta, pero obliga
  al cliente a elegir tarjeta antes de mostrar el código. Se agrega cuando un
  negocio real lo pida.
- **Acumulación transversal** entre negocios afines. Preparada vía la categoría del
  negocio, pero la moneda común requiere manejar saldos entre comercios y eso es
  otro producto.
