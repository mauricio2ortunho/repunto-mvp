console.error(
  [
    '',
    '  No se puede correr "pnpm db:seed": el seed todavia no existe.',
    '',
    '  El esquema ya esta (prisma/schema.prisma). Falta prisma/seed.ts con el',
    '  negocio de demo y sus clientes ficticios (CLAUDE.md, seccion 9). Cuando',
    '  exista, reemplazar este script en package.json por:',
    '',
    '    db:seed -> prisma db seed',
    '',
  ].join('\n'),
);

process.exit(1);
