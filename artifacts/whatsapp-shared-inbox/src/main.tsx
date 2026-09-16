import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { installInboxEnhancements } from './inbox-enhancements';
import { installAudioDurationEnhancement } from './audio-duration-enhancement';
import { installAudioDirectEnhancement } from './audio-direct-enhancement';
import { installUnreadCountEnhancement } from './inbox-unread-count';
import { installSettingsStaticPanel } from './settings-static-panel';
import { installMediaViewerEnhancement } from './media-viewer-enhancement';
import { installMediaUiFinal } from './media-ui-final';
import { installUiAlertFix } from './ui-alert-fix';
import './index.css';
import './ui-fixes.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento root não encontrado');
}

setBaseUrl(import.meta.env.VITE_API_URL || null);
setAuthTokenGetter(() => localStorage.getItem('fsf_access_token'));

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

installUiAlertFix();
installInboxEnhancements();
installAudioDurationEnhancement();
installAudioDirectEnhancement();
installUnreadCountEnhancement();
installSettingsStaticPanel();
installMediaViewerEnhancement();
installMediaUiFinal();
