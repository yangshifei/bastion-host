/// <reference types="vite/client" />

declare module 'qrcode';
declare module 'guacamole-common-js';

interface Window {
  Guacamole: any;
}
