import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './ui/components/Toast';
import CalculatorApp from './CalculatorApp';
import './index.css';

// Mount React component to #react-root
const rootElement = document.getElementById('react-root');

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ToastProvider>
        <CalculatorApp />
      </ToastProvider>
    </React.StrictMode>
  );
}
