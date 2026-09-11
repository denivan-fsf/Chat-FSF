[README_PASSO_A_PASSO.md](https://github.com/user-attachments/files/32125863/README_PASSO_A_PASSO.md)
# Correção estrutural do Chat-FSF / Fazenda São Francisco

## Diagnóstico encontrado

### 1. O frontend tinha VITE_API_URL configurada, mas o código não usava essa variável
As chamadas geradas usavam `/api/...` relativo ao domínio do frontend.
Resultado: o frontend Render tentava acessar o próprio serviço estático, não o backend.

Correção:
- `src/main.tsx` agora chama `setBaseUrl(import.meta.env.VITE_API_URL)`.
- O token de acesso é restaurado do `localStorage`.

### 2. O login visual existia, mas o backend não implementava login
O OpenAPI declarava `/auth/login`, `/auth/session` e `/auth/logout`, porém o backend real
não possuía essas rotas. O login sempre dependia de uma API inexistente.

Correção:
- Login real contra Supabase Auth.
- Verificação de token no backend.
- Criação/migração automática do perfil para `workspace_users`.

### 3. O banco da aplicação estava estruturalmente vazio
`lib/db/src/schema/index.ts` não declarava tabelas.
O backend também não implementava CRUD para conversas, mensagens, usuários, contatos e números.

Correção:
- SQL de migração incluído.
- Backend com tabelas e endpoints para a operação principal.

### 4. O código ainda apontava para Z-API
Havia uma rota `/webhook/zapi` que apenas fazia log e não persistia nada.

Correção:
- Integração preparada para UZAPI.
- Webhook `/api/webhook/uzapi`.
- Persistência de mensagens recebidas.
- Envio de texto pela UZAPI quando as credenciais e `phone_number_id` estiverem configurados.

### 5. Casa Norte e credenciais de demonstração estavam hardcoded
Correção:
- Trocar marca para Fazenda São Francisco.
- Remover e-mails/senhas de demonstração.
- Login começa com campos vazios.

## Passo a passo de implantação

1. No GitHub, faça backup da branch `main`.
2. Aplique os arquivos deste pacote nos caminhos indicados.
3. Execute `supabase-migration.sql` no Supabase SQL Editor.
4. Atualize `lib/db/src/index.ts`.
5. Atualize `artifacts/api-server/src/app.ts`.
6. Substitua `artifacts/api-server/src/routes/shared-inbox.ts`.
7. Atualize `artifacts/whatsapp-shared-inbox/src/main.tsx`.
8. Aplique `App.patch.txt` em `App.tsx`.
9. Acrescente `index.css.append.css` ao final de `src/index.css`.
10. Configure as variáveis do Render.
11. Faça deploy do backend primeiro.
12. Teste:
    - GET /api/healthz
    - login com um usuário existente no Supabase Auth
    - GET /api/auth/session com Bearer token
13. Faça deploy do frontend.
14. Teste login pelo navegador.
15. Configure a UZAPI com o webhook do backend.
16. Cadastre um número com `phone_number_id` correto.
17. Envie uma mensagem de teste para o WhatsApp e verifique:
    - webhook 200
    - contato criado/atualizado
    - conversa criada/atualizada
    - mensagem salva
18. Envie resposta pelo painel e confirme a chamada à UZAPI.

## n8n é obrigatório?

Não. Para login, banco, inbox, UZAPI e mensagens, n8n não é necessário.

Use n8n apenas se quiser automações como:
- IA responder ou classificar mensagens;
- CRM;
- alertas;
- distribuição avançada;
- campanhas;
- workflows empresariais.

Arquitetura recomendada:
Frontend -> Backend Render -> Supabase + UZAPI
                                 |
                                 +-> n8n (opcional)

## Observação importante sobre UZAPI

A documentação pública da UZAPI apresenta endpoints por `username`, `version` e
`phone_number_id`, com autenticação por access-token e webhooks de mensagens/status.
Antes de ativar em produção, confirme no painel da sua conta UZAPI se sua instância usa
exatamente a versão e o formato de endpoint configurados nas variáveis de ambiente.
