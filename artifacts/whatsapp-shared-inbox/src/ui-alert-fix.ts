const originalAlert = window.alert.bind(window);

export function installUiAlertFix() {
  if ((window as any).__fsfAlertFixInstalled) return;
  (window as any).__fsfAlertFixInstalled = true;

  window.alert = (message?: any) => {
    const text = typeof message === 'string' ? message : '';
    if (text === '[object Object]' || text === '[object Object]\\n') {
      console.error('Erro de interface suprimido:', message);
      return;
    }
    originalAlert(text);
  };
}
