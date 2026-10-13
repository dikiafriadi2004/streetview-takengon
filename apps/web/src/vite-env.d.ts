/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TILE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Declare image module types
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
