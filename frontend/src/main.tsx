import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import App from './App';
import 'antd/dist/reset.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#7c5cff',
          colorInfo: '#7c5cff',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#ff4d4f',
          borderRadius: 8,
          fontSize: 14,
        },
        components: {
          Button: {
            primaryShadow: '0 2px 8px rgba(124, 92, 255, 0.3)',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
