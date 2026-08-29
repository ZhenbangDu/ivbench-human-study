/// <reference types="vite/client" />

declare module '*.css';
declare module '*.gs?raw' {
  const source: string;
  export default source;
}
