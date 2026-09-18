import type { NextConfig } from 'next';

// El service worker de la PWA todavia no se configura: va cuando existan
// tarjetas que valga la pena ver sin conexion.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
