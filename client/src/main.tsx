import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'tdesign-react';
import Guacamole from 'guacamole-common-js';
import { useAppStore } from './stores/appStore';
import App from './App';
import './monaco-setup';
import './styles/globals.css';
import { applyGuacamolePatch } from './guacamole-patch';

(window as any).Guacamole = Guacamole;
applyGuacamolePatch();

// Apply theme attribute to <html> from the persisted store
const ThemeSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useAppStore((s) => s.theme);
  React.useEffect(() => {
    document.documentElement.setAttribute('theme-mode', theme);
  }, [theme]);
  return <>{children}</>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider globalConfig={{ classPrefix: 't' }}>
      <ThemeSync>
        <App />
      </ThemeSync>
    </ConfigProvider>
  </React.StrictMode>
);
