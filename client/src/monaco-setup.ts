import { loader } from '@monaco-editor/react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

loader.config({
  paths: {
    vs: `${base}/monaco-editor/min/vs`,
  },
});
