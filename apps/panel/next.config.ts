import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // El sistema de diseno compartido se publica como codigo fuente, con sus
  // modulos CSS: lo compila esta app, no un build propio.
  transpilePackages: ['@repunto/ui'],
};

export default nextConfig;
