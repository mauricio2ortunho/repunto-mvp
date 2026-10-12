/**
 * El sistema de diseno del panel. Importa solo React y @repunto/contratos -lo
 * unico que las dos apps comparten-, nada de la caja ni de la API. Asi se
 * puede mover entero a un paquete compartido con la app del cliente.
 *
 * El contraste, los iconos de sello y las plantillas NO estan aca: viven en
 * contratos para que el panel y la PWA elijan exactamente igual.
 *
 * Los estilos globales (tokens.css y base.css) se cargan una vez, en el
 * layout raiz.
 */
export { AparienciaDeTarjeta, useApariencia, type Apariencia } from './apariencia';
export { Aviso } from './componentes/Aviso';
export { Boton, type TamanoDeBoton, type VarianteDeBoton } from './componentes/Boton';
export { BotonDeDosToques } from './componentes/BotonDeDosToques';
export { DIBUJO_DE_SELLO } from './componentes/IconosDeSello';
export { DefinicionesDeTinta, Sellos } from './componentes/Sellos';
export { variablesDeMarca } from './marca';
