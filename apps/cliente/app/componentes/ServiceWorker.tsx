'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que deja abrir la app sin conexion. Solo en el
 * build de produccion: en desarrollo guardaria archivos que cambian a cada
 * rato y la app mostraria una version vieja.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app anda igual; solo no abre sin conexion.
    });
  }, []);
  return null;
}
