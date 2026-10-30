/// <reference types="vite/client" />

// For tools that read .vue imports without the Vue language service (typescript-eslint).
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
