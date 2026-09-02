# Deploy em servidor Linux

## Requisitos

- Docker Engine e Docker Compose plugin
- Domínio com HTTPS apontando para o servidor
- App da Meta com WhatsApp Cloud API configurado

## Primeira execução

```bash
cp .env.example .env
# edite JWT_SECRET, MYSQL_ROOT_PASSWORD e WHATSAPP_VERIFY_TOKEN
docker compose up -d --build
```

O serviço web ficará disponível na porta `3000`. Coloque Nginx, Caddy ou outro proxy reverso na frente dele para terminar TLS.

## Banco MySQL e Prisma

O schema oficial está em `prisma/schema.prisma`. Em uma imagem de backend Node com Prisma instalado, execute:

```bash
npx prisma generate
npx prisma migrate deploy
```

Para criar a primeira migration durante desenvolvimento:

```bash
npx prisma migrate dev --name init
```

O compose mantém os dados no volume `mysql_data`. Faça backup desse volume antes de qualquer operação destrutiva.

## Webhook Meta

Configure na Meta:

- Callback URL: `https://SEU_DOMINIO/api/webhooks/whatsapp`
- Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Assine os eventos `messages` e `message_template_quality_update`

O endpoint GET valida o desafio da Meta e o POST aceita o envelope de eventos para persistência/roteamento. Para produção, configure `META_ACCESS_TOKEN` e `META_APP_SECRET` e complete o adaptador de envio em `artifacts/api-server/src/routes/shared-inbox.ts`.

## Variáveis sensíveis

Nunca faça commit do `.env`. Use secrets do servidor, do CI ou do provedor de hospedagem para `JWT_SECRET`, `MYSQL_ROOT_PASSWORD`, tokens da Meta e credenciais de banco.