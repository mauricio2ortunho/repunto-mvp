import { iniciarSentry } from './lib/sentry';

// Next corre este archivo en el navegador antes que la aplicacion: asi un
// error del primer dibujo tambien llega.
iniciarSentry();
