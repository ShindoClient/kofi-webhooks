# Ko-fi → Discord (Vercel)

Webhook do Ko-fi que envia notificações para o Discord usando **Discord Components V2** ([discord.builders](https://github.com/StartITBot/discord.builders)). Tracking de subscriptions, doações one-time, cancelamentos e reembolsos.

## Funcionalidades

- **Discord Components V2**: Mensagens com novo formato (Text Display, Container, Section)
- **Tracking no Gist**: Subscriptions por tier, doadores one-time, cancelamentos, reembolsos
- **Webhooks separados**: Canais dedicados para subscriptions, doações e alertas
- **Resumo**: Endpoint `/api/summary` para enviar resumo ao Discord (cron ou manual)

## Setup

### 1. Deploy na Vercel

```bash
pnpm install
pnpm run deploy
```

Ou conecte o repositório no [Vercel Dashboard](https://vercel.com).

### 2. Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `WEBHOOK_URL` | Sim | URL do webhook do Discord (principal) |
| `KOFI_TOKEN` | Sim | Token em [Ko-fi Webhooks](https://ko-fi.com/manage/webhooks) (Advanced) |
| `KOFI_USERNAME` | Não | Seu username (para links nos componentes) |
| `GIST_TOKEN` | Com Gist | Token GitHub (scope `gist`) – obrigatório para Gist privado |
| `GIST_ID` | Com Gist | ID do Gist (ex: `abc123def456`) – ver URL em gist.github.com |
| `GIST_URL` | Alternativa | URL do Gist – ID é extraído automaticamente |

#### Webhooks opcionais (crie quantos precisar)

| Variável | Descrição |
|----------|-----------|
| `WEBHOOK_SUBSCRIPTIONS` | Canal para novas subscriptions e renovações |
| `WEBHOOK_DONATIONS` | Canal para doações one-time (tip, buy me a coffee) |
| `WEBHOOK_ALERTS` | Canal para cancelamentos e reembolsos |
| `WEBHOOK_SUMMARY` | Canal para resumos (padrão: WEBHOOK_URL) |

#### Resumo

| Variável | Descrição |
|----------|-----------|
| `SUMMARY_TOKEN` | Token para autorizar `POST /api/summary` |

### 3. Gist privado

Crie um **secret gist** no [gist.github.com](https://gist.github.com) com arquivo `kofi.json` e este conteúdo:

```json
{
  "subscriptions": {},
  "donors": [],
  "cancellations": [],
  "refunds": [],
  "tierCounts": {}
}
```

Configure `GIST_TOKEN` (token GitHub com scope `gist`) e `GIST_ID` (o ID está na URL do Gist).  
Veja [CONFIG.md](./CONFIG.md) para o passo a passo completo.

### 4. Configurar no Ko-fi

1. Acesse [Ko-fi Webhooks](https://ko-fi.com/manage/webhooks)
2. URL: `https://seu-projeto.vercel.app/api/kofi`
3. Use o mesmo token em `KOFI_TOKEN`
4. Teste com o botão de teste no Ko-fi

### 5. Resumo (opcional)

Para enviar o resumo ao Discord:

```bash
# POST com token no body
curl -X POST https://seu-projeto.vercel.app/api/summary \
  -H "Content-Type: application/json" \
  -d '{"token": "seu_SUMMARY_TOKEN"}'

# Ou GET
curl "https://seu-projeto.vercel.app/api/summary?token=seu_SUMMARY_TOKEN"
```

Configure um cron (ex: [cron-job.org](https://cron-job.org)) para rodar diariamente.

## Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/kofi` | POST | Recebe webhooks do Ko-fi |
| `/api/summary` | GET/POST | Envia resumo de supporters ao Discord (requer `token`) |

## Tipos de evento

- **Donation**: Tip ou "Buy me a coffee" (não mensal)
- **Subscription Start**: Primeira subscription
- **Subscription Renewal**: Renovação mensal
- **Cancellation**: Subscription cancelada (Ko-fi deve enviar `type` com "cancel")
- **Refund**: Pedido de reembolso (Ko-fi deve enviar `type` com "refund")

> Se o Ko-fi usar outros formatos para cancelamento/reembolso, o código pode ser ajustado.

## Licença

GPL-3.0
