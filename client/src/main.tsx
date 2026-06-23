import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'tdesign-react';
import Guacamole from 'guacamole-common-js';
import App from './App';
import './styles/globals.css';

// Expose Guacamole globally for RDP client components
(window as any).Guacamole = Guacamole;

// TDesign dark mode configuration
const darkThemeConfig = {
  classPrefix: 't',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider globalConfig={darkThemeConfig}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
