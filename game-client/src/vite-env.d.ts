/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL: string;
  readonly VITE_STRAPI_URL: string;
  readonly VITE_STRAPI_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
