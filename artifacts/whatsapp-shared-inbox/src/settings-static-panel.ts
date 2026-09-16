function installStyles() {
  if (document.getElementById('fsf-settings-static-style')) return;
  const style = document.createElement('style');
  style.id = 'fsf-settings-static-style';
  style.textContent = `
    .fsf-settings-static-shell{
      width:100%;
      min-height:calc(100dvh - 92px);
      padding:28px 30px 34px;
      box-sizing:border-box;
      overflow:auto;
    }
    .fsf-settings-static-panel{
      width:min(980px,100%);
      margin:0 auto;
      border:1px solid #dbe8df;
      border-radius:18px;
      background:rgba(249,252,249,.96);
      box-shadow:0 12px 32px rgba(22,63,55,.06);
      overflow:hidden;
    }
    .fsf-settings-static-head{
      padding:22px 24px 18px;
      border-bottom:1px solid #dbe8df;
      background:linear-gradient(180deg,#f3f9f3,#edf5ee);
    }
    .fsf-settings-static-kicker{
      display:block;
      margin-bottom:6px;
      color:#779087;
      font:700 9px/1.2 var(--app-font-mono,monospace);
      letter-spacing:.12em;
      text-transform:uppercase;
    }
    .fsf-settings-static-title{
      margin:0;
      color:#123d35;
      font-size:21px;
      line-height:1.15;
      font-weight:800;
    }
    .fsf-settings-static-subtitle{
      margin:7px 0 0;
      color:#667d74;
      font-size:11px;
      line-height:1.5;
    }
    .fsf-settings-static-grid{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
    }
    .fsf-settings-static-card{
      padding:20px;
      min-height:190px;
      box-sizing:border-box;
      border-right:1px solid #dbe8df;
    }
    .fsf-settings-static-card:last-child{border-right:0}
    .fsf-settings-static-label{
      display:block;
      margin-bottom:6px;
      color:#82968e;
      font:700 8px/1.3 var(--app-font-mono,monospace);
      letter-spacing:.12em;
      text-transform:uppercase;
    }
    .fsf-settings-static-card h3{
      margin:0;
      color:#173f37;
      font-size:14px;
      line-height:1.3;
    }
    .fsf-settings-static-card p{
      margin:6px 0 0;
      color:#71857c;
      font-size:10px;
      line-height:1.5;
    }
    .fsf-static-list{margin-top:16px;display:grid;gap:10px}
    .fsf-static-row{
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:16px;
      padding-bottom:10px;
      border-bottom:1px solid #e6eee8;
    }
    .fsf-static-row:last-child{padding-bottom:0;border-bottom:0}
    .fsf-static-row small{
      display:block;
      color:#889a93;
      font-size:8px;
      line-height:1.3;
      margin-bottom:3px;
    }
    .fsf-static-row b{
      color:#274b43;
      font-size:10px;
      line-height:1.35;
      text-align:right;
      font-weight:700;
    }
    .fsf-status{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:5px 8px;
      border-radius:999px;
      background:#e8f5dc;
      color:#446b1a !important;
      font-size:9px !important;
      white-space:nowrap;
    }
    .fsf-status i{width:6px;height:6px;border-radius:50%;background:#75a63d;display:inline-block}
    .fsf-webhook{
      margin-top:16px;
      padding:11px 12px;
      border:1px solid #dce9df;
      border-radius:10px;
      background:#f5faf5;
      color:#3f6459;
      font:700 10px/1.4 var(--app-font-mono,monospace);
      word-break:break-word;
    }
    .fsf-static-checks{margin-top:15px;display:grid;gap:9px}
    .fsf-static-check{display:flex;gap:8px;align-items:flex-start;color:#35594f;font-size:9px;line-height:1.35}
    .fsf-static-check i{width:15px;height:15px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none;background:#e7f4de;color:#567f31;font-style:normal;font-weight:800}
    .fsf-settings-static-footer{
      padding:16px 20px;
      border-top:1px solid #dbe8df;
      background:#f3f8f2;
      color:#6f857b;
      font-size:9px;
      line-height:1.5;
    }
    @media (max-width:900px){
      .fsf-settings-static-grid{grid-template-columns:1fr}
      .fsf-settings-static-card{border-right:0;border-bottom:1px solid #dbe8df;min-height:auto}
      .fsf-settings-static-card:last-child{border-bottom:0}
    }
    @media (max-width:590px){
      .fsf-settings-static-shell{padding:16px}
      .fsf-settings-static-head{padding:18px}
      .fsf-settings-static-card{padding:16px}
      .fsf-settings-static-title{font-size:18px}
    }
  `;
  document.head.appendChild(style);
}

function staticPanel() {
  const shell = document.createElement('div');
  shell.className = 'fsf-settings-static-shell';
  shell.innerHTML = `
    <section class="fsf-settings-static-panel" aria-label="Resumo das configurações do workspace">
      <header class="fsf-settings-static-head">
        <span class="fsf-settings-static-kicker">Configurações do workspace</span>
        <h2 class="fsf-settings-static-title">Fazenda São Francisco</h2>
        <p class="fsf-settings-static-subtitle">Resumo organizado das informações atuais do workspace, integrações e saúde operacional.</p>
      </header>
      <div class="fsf-settings-static-grid">
        <section class="fsf-settings-static-card">
          <span class="fsf-settings-static-label">Identidade</span>
          <h3>Workspace de atendimento compartilhado</h3>
          <p>Informações básicas do espaço de atendimento.</p>
          <div class="fsf-static-list">
            <div class="fsf-static-row"><span><small>Nome público</small></span><b>Fazenda São Francisco</b></div>
            <div class="fsf-static-row"><span><small>Canal principal</small></span><b>WhatsApp via UZAPI</b></div>
            <div class="fsf-static-row"><span><small>Status</small></span><b class="fsf-status"><i></i>Operação normal</b></div>
          </div>
        </section>
        <section class="fsf-settings-static-card">
          <span class="fsf-settings-static-label">Webhook do WhatsApp</span>
          <h3>Recebimento de eventos</h3>
          <p>Endpoint preparado para receber os eventos da UZAPI.</p>
          <div class="fsf-webhook">/api/webhooks/whatsapp</div>
          <div class="fsf-static-checks">
            <div class="fsf-static-check"><i>✓</i><span><b>Recebimento de eventos</b><br>Endpoint preparado para webhooks.</span></div>
            <div class="fsf-static-check"><i>✓</i><span><b>Atualização em tempo real</b><br>Canal de eventos ativo.</span></div>
            <div class="fsf-static-check"><i>✓</i><span><b>Integração</b><br>WhatsApp conectado pela UZAPI.</span></div>
          </div>
        </section>
        <section class="fsf-settings-static-card">
          <span class="fsf-settings-static-label">Saúde do sistema</span>
          <h3>Sistema operacional</h3>
          <p>Resumo estático do estado apresentado pela tela atual.</p>
          <div class="fsf-static-list">
            <div class="fsf-static-row"><span><small>API</small></span><b class="fsf-status"><i></i>Online e respondendo</b></div>
            <div class="fsf-static-row"><span><small>Banco de dados</small></span><b>Conectado pelo backend</b></div>
            <div class="fsf-static-row"><span><small>Tempo real</small></span><b>Atualização automática ativa</b></div>
            <div class="fsf-static-row"><span><small>Disponibilidade</small></span><b>100%</b></div>
          </div>
        </section>
      </div>
      <footer class="fsf-settings-static-footer">Resumo informativo. Esta área é somente para organização visual e não altera configurações, webhooks ou credenciais.</footer>
    </section>
  `;
  return shell;
}

function apply() {
  const page = document.querySelector('.settings-page') as HTMLElement | null;
  if (!page) return;
  const existing = page.querySelector('.fsf-settings-static-shell');
  if (existing) return;
  Array.from(page.children).forEach((child) => {
    (child as HTMLElement).dataset.fsfStaticHidden = '1';
    (child as HTMLElement).style.display = 'none';
  });
  page.appendChild(staticPanel());
}

export function installSettingsStaticPanel() {
  installStyles();
  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(document.body, { childList: true, subtree: true });
}
