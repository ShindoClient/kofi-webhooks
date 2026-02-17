# Configuração passo a passo

## 1. Discord – Webhook principal

1. Abra o servidor no Discord
2. ** Canal → Editar canal → Integrações → Webhooks**
3. **Novo webhook**
4. Copie a **URL do webhook**

→ Em `WEBHOOK_URL` na Vercel: coloque essa URL

---

## 2. Ko-fi – Webhook e token

1. Acesse [Ko-fi → Manage → Webhooks](https://ko-fi.com/manage/webhooks)
2. Em **Advanced**, gere ou copie o **Verification Token**
3. Em **Webhook URL**, use:  
   `https://seu-projeto.vercel.app/api/kofi`
4. Salve

→ Em `KOFI_TOKEN` na Vercel: coloque o mesmo Verification Token

---

## 3. GitHub – Gist privado

### 3.1 Criar o Gist

1. Acesse [gist.github.com](https://gist.github.com)
2. **New gist** (ou **+**)
3. Nome do arquivo: `kofi.json`
4. Conteúdo:

```json
{
  "subscriptions": {},
  "donors": [],
  "cancellations": [],
  "refunds": [],
  "tierCounts": {}
}
```

5. Selecione **Create secret gist** (privado)
6. Salve o Gist

### 3.2 Pegar o ID do Gist

Na URL do Gist, o último trecho é o ID:

```
https://gist.github.com/SEU_USUARIO/abc123def456789...
                              ↑
                         Este é o GIST_ID
```

### 3.3 Criar token do GitHub

1. [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. **Generate new token (classic)**
3. Nome: ex. `kofi-discord`
4. Marque só o scope **gist**
5. Gere e copie o token

→ Em `GIST_TOKEN` na Vercel: coloque esse token  
→ Em `GIST_ID` na Vercel: coloque o ID do Gist (ex: `abc123def456789`)

---

## 4. Vercel – Variáveis de ambiente

No projeto na Vercel: **Settings → Environment Variables**

| Variável     | Valor                                    |
|-------------|------------------------------------------|
| `WEBHOOK_URL` | `https://discord.com/api/webhooks/...`  |
| `KOFI_TOKEN`  | Token do Ko-fi                          |
| `GIST_TOKEN`  | Token do GitHub (scope gist)            |
| `GIST_ID`     | ID do Gist (ex: `abc123def456`)         |
| `KOFI_USERNAME` | Seu username no Ko-fi (opcional)      |

Re faça o deploy após salvar.

---

## 5. Testar o webhook

1. No Ko-fi, em Webhooks, use o botão **Send test webhook**
2. Confira se a mensagem chegou no Discord

---

## 6. Resumo (opcional)

Para enviar resumo ao Discord:

1. Em **Environment Variables** na Vercel:
   - `SUMMARY_TOKEN` = um token secreto (ex: `meu_token_123`)

2. Chamar o endpoint:

```bash
curl "https://seu-projeto.vercel.app/api/summary?token=meu_token_123"
```

3. Agendar via [cron-job.org](https://cron-job.org):
   - URL: `https://seu-projeto.vercel.app/api/summary?token=meu_token_123`
   - Schedule: diário (ex.: 12:00)

---

## Webhooks adicionais (opcional)

Se quiser canais separados:

1. Crie novos webhooks no Discord nos canais desejados
2. Use nas variáveis:
   - `WEBHOOK_SUBSCRIPTIONS` – novas subscriptions
   - `WEBHOOK_DONATIONS` – doações avulsas
   - `WEBHOOK_ALERTS` – cancelamentos e reembolsos

Se não definir, tudo vai para `WEBHOOK_URL`.
