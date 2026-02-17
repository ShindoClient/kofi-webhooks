# Ko-fi → Discord (Vercel)

Webhook do Ko-fi que envia notificações de doações para o Discord. Adaptado do [kofi-discord-notification](https://github.com/raidensakura/kofi-discord-notification) para **Vercel** e **TypeScript**.

## Por quê?

O Ko-fi tem integração com Discord, mas só para atribuição de roles — não envia mensagem em doações. Este projeto resolve isso com uma serverless function na Vercel.

## Setup

### 1. Deploy na Vercel

```bash
pnpm install
pnpm run deploy
```

Ou conecte o repositório no [Vercel Dashboard](https://vercel.com).

### 2. Variáveis de ambiente

No Vercel → Project → Settings → Environment Variables:

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `WEBHOOK_URL` | Sim | URL do webhook do Discord |
| `KOFI_TOKEN` | Sim | Token em [Ko-fi Webhooks](https://ko-fi.com/manage/webhooks) (Advanced) |
| `KOFI_USERNAME` | Não | Seu username (para link no embed) |
| `GIST_URL` | Não | URL raw do Gist para lista de apoiadores |
| `GIST_TOKEN` | Não | Token GitHub para editar o Gist |

### 3. Configurar no Ko-fi

1. Acesse [Ko-fi Webhooks](https://ko-fi.com/manage/webhooks)
2. Defina a URL do webhook: `https://seu-projeto.vercel.app/api/kofi`
3. Use o mesmo token em `KOFI_TOKEN`
4. Teste com o botão de teste no Ko-fi

### 4. Webhook do Discord

Canal → Editar canal → Integrações → Webhooks → Novo webhook → Copiar URL

## Desenvolvimento local

```bash
pnpm run dev
```

A função fica em `http://localhost:3000/api/kofi`.

## Licença

Baseado em [kofi-discord-notification](https://github.com/raidensakura/kofi-discord-notification) (MIT).
