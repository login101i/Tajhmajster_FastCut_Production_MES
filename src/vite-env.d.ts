/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONITOR_TOKEN?: string;
  readonly VITE_REQUIRE_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
