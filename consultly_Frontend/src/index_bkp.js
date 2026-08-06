import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import '@shopify/polaris/build/esm/styles.css';
import { AppProvider as PolarisAppProvider } from '@shopify/polaris';
import en from "@shopify/polaris/locales/en.json";
import { Provider } from 'react-redux';
import { store } from './components/Redux/store/store';
import { AppBridgeProvider } from './components/createContext/AppBridgeContext';
import SocketProvider from './components/Sokect-io/sokectProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminMenu } from './pages/AdminMenu';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <AppBridgeProvider>
      {/* AdminMenu uses NavMenu component for embedded app navigation - render only once */}
      {/* NavMenu works directly with App Bridge initialized via AppBridgeProvider */}
      <AdminMenu />
      <PolarisAppProvider i18n={en}>
        <Provider store={store}>
          <SocketProvider>
            <App />
          </SocketProvider>
        </Provider>
      </PolarisAppProvider>
    </AppBridgeProvider>
  </ErrorBoundary>
);
