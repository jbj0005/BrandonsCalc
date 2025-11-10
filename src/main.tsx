import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/components/Toast';
import ComponentDemo from './examples/ComponentDemo';

// Mount React component to #react-root
const rootElement = document.getElementById('react-root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ToastProvider>
        <ComponentDemo />
      </ToastProvider>
    </React.StrictMode>
  );
} else {
  console.error('React root element not found. Add <div id="react-root"></div> to your HTML.');
}
