'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { esquemaMisTarjetas } from '@repunto/contratos';
import { Aviso, Boton, DefinicionesDeTinta } from '@repunto/ui';

import { misTarjetas } from '../lib/api/cliente';
import { cerrarSesionDelTelefono } from '../lib/salir';
import { type RegistroEnEspera, sesionDelTelefono } from '../lib/sesion';
import { BotonDeCodigo } from './componentes/BotonDeCodigo';
import { NombreDeLaApp, Pantalla } from './componentes/Pantalla';
import { TarjetaEnLista } from './componentes/TarjetaEnLista';
import { useConsulta } from './componentes/usar-consulta';
import css from './Inicio.module.css';

/**
 * La pantalla de entrada. Sin sesion, explica como sumarse; con sesion, la
 * lista de tarjetas, ya ordenada por la api.
 */
export function Inicio() {
  // undefined mientras no se leyo el telefono: en el servidor no hay sesion.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [registro, setRegistro] = useState<RegistroEnEspera | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const sesion = sesionDelTelefono();
    setToken(sesion.token());
    setRegistro(sesion.registro());
  }, []);

  if (token === undefined) {
    return (
      <Pantalla>
        <NombreDeLaApp />
      </Pantalla>
    );
  }
  if (token === null) return <SinTarjetas registro={registro} aviso={aviso} />;
  return (
    <MisTarjetas
      token={token}
      alPerderLaSesion={(mensaje) => {
        cerrarSesionDelTelefono();
        setAviso(mensaje);
        setToken(null);
      }}
    />
  );
}

function MisTarjetas(p: { token: string; alPerderLaSesion: (mensaje: string) => void }) {
  const consulta = useConsulta('tarjetas', esquemaMisTarjetas, (senal) =>
    misTarjetas(p.token, senal),
  );
  const { alPerderLaSesion } = p;

  const sinSesion =
    consulta.tipo === 'error' &&
    consulta.fallo.tipo === 'rechazo' &&
    consulta.fallo.codigo === 'TOKEN_INVALIDO';
  useEffect(() => {
    if (sinSesion && consulta.tipo === 'error') alPerderLaSesion(consulta.fallo.mensaje);
  }, [sinSesion, consulta, alPerderLaSesion]);

  return (
    <Pantalla>
      <DefinicionesDeTinta />
      <NombreDeLaApp />
      <h1 className={css.titulo}>Mis tarjetas</h1>

      {consulta.tipo === 'cargando' && <p className={css.nota}>Buscando tus tarjetas…</p>}
      {consulta.tipo === 'error' && !sinSesion && (
        <Aviso mensaje={consulta.fallo.mensaje} />
      )}

      {consulta.tipo === 'listo' && (
        <>
          {consulta.guardado && (
            <p className={css.sinConexion}>Sin conexión: esto es lo último que vimos.</p>
          )}
          {consulta.datos.tarjetas.length === 0 ? (
            <p className={css.nota}>
              Todavía no tenés tarjetas. Escaneá el QR del mostrador de un local adherido
              para sumarte.
            </p>
          ) : (
            <ul className={css.lista}>
              {consulta.datos.tarjetas.map((tarjeta) => (
                <li key={tarjeta.id}>
                  <TarjetaEnLista tarjeta={tarjeta} ahora={Date.now()} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <BotonDeCodigo />
    </Pantalla>
  );
}

function SinTarjetas(p: { registro: RegistroEnEspera | null; aviso: string | null }) {
  const router = useRouter();
  return (
    <Pantalla>
      <NombreDeLaApp />
      <section className={css.bienvenida}>
        <h1>Tu tarjeta de sellos, en el teléfono</h1>
        <p>
          Escaneá el QR que está en el mostrador de un local adherido. Dejás tu número, el
          cajero te confirma y la tarjeta queda acá.
        </p>
      </section>
      {p.aviso !== null && <Aviso mensaje={p.aviso} />}
      {p.registro !== null && (
        <Boton
          tamano="grande"
          ancho
          onClick={() => router.push(`/r/${encodeURIComponent(p.registro?.qr ?? '')}`)}
        >
          Volver a mi registro
        </Boton>
      )}
    </Pantalla>
  );
}
