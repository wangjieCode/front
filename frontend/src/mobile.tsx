import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import AppMobile from './AppMobile';
import 'antd/dist/reset.css';
import { appTheme } from './theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={appTheme}>
      <AppMobile />
    </ConfigProvider>
  </React.StrictMode>
);
