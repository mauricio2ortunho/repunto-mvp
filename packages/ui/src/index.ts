/**
 * El sistema de diseno de Repunto, compartido por el panel y la app del
 * cliente: la tarjeta con sus sellos se dibuja igual en la caja y en el
 * telefono, y cambiar un color o un icono es cambiarlo aca.
 *
 * Importa solo React y @repunto/contratos. Nunca Next —asi no queda atado a
 * una app—, nunca la api ni el dominio (CLAUDE.md, seccion 3).
 *
 * El contraste, los iconos de sello y las plantillas NO estan aca: son reglas,
 * y viven en contratos. Este paquete los dibuja.
 *
 * Los estilos globales —fuentes, tokens y base— se cargan una vez, en el
 * layout raiz de cada app: `import '@repunto/ui/estilos'`.
 */
export { AparienciaDeTarjeta, useApariencia, type Apariencia } from './apariencia';
export { Aviso } from './componentes/Aviso';
export { Boton, type TamanoDeBoton, type VarianteDeBoton } from './componentes/Boton';
export { BotonDeDosToques } from './componentes/BotonDeDosToques';
export { TecladoDePin } from './componentes/TecladoDePin';
export { DIBUJO_DE_SELLO } from './componentes/IconosDeSello';
export { DefinicionesDeTinta, Sellos } from './componentes/Sellos';
export { LogoDelNegocio } from './componentes/LogoDelNegocio';
export { variablesDeMarca } from './marca';
export { esMontoCero, formatearBolivianos } from './montos';
