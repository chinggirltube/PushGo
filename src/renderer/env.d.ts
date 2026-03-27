/// <reference types="vite/client" />

import type { PushGoApi } from "../shared/bridge";

declare global {
  interface Window {
    pushgo: PushGoApi;
  }
}

export {};
