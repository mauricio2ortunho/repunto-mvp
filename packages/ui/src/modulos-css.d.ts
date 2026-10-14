// Next declara estos tipos en cada app (next-env.d.ts). Este paquete no es una
// app de Next, asi que los declara el mismo para poder chequearse solo.
declare module '*.module.css' {
  const clases: Readonly<Record<string, string>>;
  export default clases;
}

declare module '*.css';
