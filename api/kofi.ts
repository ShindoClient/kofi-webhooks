/**
 * Ko-fi Webhook → Discord (Components V2)
 * Adaptado de https://github.com/raidensakura/kofi-discord-notification
 * Usa Discord Components V2: https://docs.discord.com/developers/components/reference
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ============ TIPOS ============

interface KoFiPayload {
  message_id: string;
  from_name: string;
  message: string;
  amount: string;
  currency: string;
  type: string;
  tier_name?: string;
  verification_token: string;
  email?: string;
  kofi_transaction_id?: string;
  shipping?: unknown;
  /** Ko-fi envia para pagamentos de subscription */
  is_subscription_payment?: boolean;
  is_first_subscription_payment?: boolean;
  /** Timestamp no formato ISO ou similar */
  timestamp?: string;
}

/** Estado persistido no Gist */
interface KoFiData {
  /** Subs ativas: from_name → { tier, starts_at, ends_at, message_id } */
  subscriptions: Record<string, SubscriptionEntry>;
  /** Doações one-time (tip, coffee) - não subscription */
  donors: DonorEntry[];
  /** Cancelamentos de subscription */
  cancellations: CancellationEntry[];
  /** Pedidos de reembolso */
  refunds: RefundEntry[];
  /** Estatísticas por tier */
  tierCounts: Record<string, number>;
}

interface SubscriptionEntry {
  tier: string;
  tier_name?: string;
  amount: string;
  currency: string;
  starts_at: string;
  ends_at: string;
  message_id: string;
  from_name: string;
}

interface DonorEntry {
  from_name: string;
  amount: string;
  currency: string;
  message?: string;
  message_id: string;
  timestamp: string;
}

interface CancellationEntry {
  from_name: string;
  tier: string;
  message_id: string;
  timestamp: string;
}

interface RefundEntry {
  from_name: string;
  amount: string;
  currency: string;
  message_id: string;
  timestamp: string;
  reason?: string;
}

type EventKind =
  | "donation"
  | "subscription_start"
  | "subscription_renewal"
  | "cancellation"
  | "refund";

// ============ CONSTANTES ============

const CENSOR = "*****";
const KOFI_IMG = "https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png";
const IS_COMPONENTS_V2 = 32768;
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

// ============ HELPERS ============

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function tierColor(tier?: string): number {
  switch (tier) {
    case "Silver":
      return 0x797979;
    case "Gold":
      return 0xffc530;
    case "Platinum":
      return 0x2ed5ff;
    default:
      return 0x9b59b6;
  }
}

/** Garante URL do webhook com suporte a Components V2 */
function webhookUrlWithComponents(url: string): string {
  const u = new URL(url);
  u.searchParams.set("wait", "true");
  if (!u.searchParams.has("with_components")) {
    u.searchParams.set("with_components", "true");
  }
  return u.toString();
}

/** Detecta o tipo de evento do payload */
function getEventKind(payload: KoFiPayload): EventKind {
  const type = (payload.type || "").toLowerCase();
  if (type.includes("cancel") || type.includes("cancelled")) return "cancellation";
  if (type.includes("refund")) return "refund";

  const isSub = payload.is_subscription_payment === true;
  const isFirst = payload.is_first_subscription_payment === true;

  if (isSub && isFirst) return "subscription_start";
  if (isSub && !isFirst) return "subscription_renewal";
  return "donation";
}

/** Formata tempo restante até ends_at */
function formatTimeUntil(endsAt: string): string {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const ms = end - now;
  if (ms <= 0) return "Expirada";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(ms / 60000);
  return `${mins}min`;
}

// ============ DISCORD COMPONENTS V2 ============

type TextDisplay = { type: 10; content: string };
type Thumbnail = { type: 11; media: { url: string }; description?: null; spoiler?: boolean };
type Section = {
  type: 9;
  components: TextDisplay[];
  accessory: Thumbnail;
};
type Separator = { type: 14; divider: true; spacing: number };
type Container = {
  type: 17;
  accent_color: number | null;
  spoiler: boolean;
  components: (TextDisplay | Section | Separator)[];
};

/** Monta mensagem Discord usando Components V2 (template do usuário) */
function buildComponentsV2Message(
  payload: KoFiPayload,
  kind: EventKind,
  kofiUsername?: string
): { flags: number; components: Container[] } {
  const accentColor = null;
  const kofiLink = kofiUsername
    ? `https://ko-fi.com/${kofiUsername}`
    : "https://ko-fi.com";

  let title: string;
  let subtitle: string;
  switch (kind) {
    case "donation":
      title = "### ☕ Nova doação no Ko-fi!";
      subtitle = "Buy me a coffee ou tip recebido";
      break;
    case "subscription_start":
      title = "### ✨ Nova subscription!";
      subtitle = "Alguém começou a te apoiar mensalmente";
      break;
    case "subscription_renewal":
      title = "### 🔄 Renovação de subscription";
      subtitle = "Pagamento mensal renovado";
      break;
    case "cancellation":
      title = "### ❌ Subscription cancelada";
      subtitle = "Um apoiador cancelou a assinatura";
      break;
    case "refund":
      title = "### 💰 Pedido de reembolso";
      subtitle = "Requer atenção";
      break;
    default:
      title = "### 📬 Nova notificação Ko-fi";
      subtitle = payload.type || "Evento";
  }

  const containerComponents: (TextDisplay | Section | Separator)[] = [
    {
      type: 9,
      accessory: {
        type: 11,
        media: { url: KOFI_IMG },
        description: null,
        spoiler: false,
      },
      components: [
        { type: 10, content: title },
        { type: 10, content: subtitle },
      ],
    },
    { type: 14, divider: true, spacing: 2 },
    { type: 10, content: `**De:** ${payload.from_name}` },
    { type: 10, content: `**Tipo:** ${payload.type}` },
    { type: 10, content: `**Valor:** ${payload.amount} ${payload.currency}` },
  ];

  if (payload.tier_name) {
    containerComponents.push({ type: 10, content: `**Tier:** ${payload.tier_name}` });
  }
  if (payload.message && payload.message !== "null") {
    containerComponents.push({ type: 10, content: `**Mensagem:** ${payload.message}` });
  }

  containerComponents.push({
    type: 10,
    content: `[Ver no Ko-fi](<${kofiLink}>)`,
  });

  return {
    flags: IS_COMPONENTS_V2,
    components: [
      {
        type: 17,
        accent_color: accentColor,
        spoiler: false,
        components: containerComponents,
      },
    ],
  };
}

/** Embed legado (fallback quando Components V2 falha) */
function buildLegacyEmbed(
  payload: KoFiPayload,
  kind: EventKind,
  kofiUsername?: string
): { embeds: unknown[] } {
  const color = tierColor(payload.tier_name);
  const kofiLink = kofiUsername
    ? `https://ko-fi.com/${kofiUsername}`
    : "https://ko-fi.com";

  let title: string;
  switch (kind) {
    case "donation":
      title = "☕ Nova doação no Ko-fi!";
      break;
    case "subscription_start":
      title = "✨ Nova subscription!";
      break;
    case "subscription_renewal":
      title = "🔄 Renovação de subscription";
      break;
    case "cancellation":
      title = "❌ Subscription cancelada";
      break;
    case "refund":
      title = "💰 Pedido de reembolso";
      break;
    default:
      title = "📬 Nova notificação Ko-fi";
  }

  const fields = [
    { name: "De", value: payload.from_name, inline: true },
    { name: "Tipo", value: payload.type, inline: true },
    { name: "Valor", value: `${payload.amount} ${payload.currency}`, inline: true },
  ];
  if (payload.tier_name) {
    fields.push({ name: "Tier", value: payload.tier_name, inline: false });
  }
  if (payload.message && payload.message !== "null") {
    fields.push({ name: "Mensagem", value: payload.message, inline: false });
  }

  return {
    embeds: [
      {
        author: { name: "Ko-fi", icon_url: KOFI_IMG },
        title,
        url: kofiLink,
        color,
        fields,
        thumbnail: { url: KOFI_IMG },
        footer: { text: "Thank you for supporting!", icon_url: KOFI_IMG },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// ============ ENVIO DISCORD ============

async function sendToDiscord(
  webhookUrl: string,
  payload: KoFiPayload,
  kind: EventKind,
  kofiUsername?: string
): Promise<void> {
  const cv2Body = buildComponentsV2Message(payload, kind, kofiUsername);
  const legacyBody = buildLegacyEmbed(payload, kind, kofiUsername);

  const urlWithComponents = webhookUrlWithComponents(webhookUrl);
  const urlNormal = webhookUrl.replace(/\?.*$/, "");

  const res = await fetch(urlWithComponents, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cv2Body),
  });

  if (res.ok) return;

  if (res.status === 400) {
    const fallbackRes = await fetch(urlNormal, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(legacyBody),
    });
    if (fallbackRes.ok) return;
    const text = await fallbackRes.text();
    throw new Error(`Discord webhook failed (fallback): ${fallbackRes.status} ${text}`);
  }

  const text = await res.text();
  throw new Error(`Discord webhook failed: ${res.status} ${text}`);
}

/** Escolhe webhook com base no evento. Fallback para WEBHOOK_URL. */
function getWebhookForEvent(
  kind: EventKind,
  env: {
    WEBHOOK_URL: string;
    WEBHOOK_SUBSCRIPTIONS?: string;
    WEBHOOK_DONATIONS?: string;
    WEBHOOK_ALERTS?: string;
  }
): string {
  if (kind === "subscription_start" || kind === "subscription_renewal") {
    return env.WEBHOOK_SUBSCRIPTIONS || env.WEBHOOK_URL;
  }
  if (kind === "donation") {
    return env.WEBHOOK_DONATIONS || env.WEBHOOK_URL;
  }
  if (kind === "cancellation" || kind === "refund") {
    return env.WEBHOOK_ALERTS || env.WEBHOOK_URL;
  }
  return env.WEBHOOK_URL;
}

// ============ GIST (suporta privado via API) ============

const EMPTY_DATA: KoFiData = {
  subscriptions: {},
  donors: [],
  cancellations: [],
  refunds: [],
  tierCounts: {},
};

/** Extrai o ID do Gist de GIST_URL ou usa GIST_ID direto */
function getGistId(gistUrl?: string, gistId?: string): string {
  if (gistId && /^[a-f0-9]+$/i.test(gistId)) return gistId;
  if (gistUrl) {
    const rawMatch = gistUrl.match(/gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)\/raw/i);
    if (rawMatch) return rawMatch[1];
    const shortMatch = gistUrl.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
    if (shortMatch) return shortMatch[1];
  }
  throw new Error("GIST_ID ou GIST_URL inválido. Para Gist privado, use GIST_ID.");
}

/** Carrega dados do Gist via GitHub API (funciona com público e privado) */
async function loadGistData(
  gistId: string,
  gistToken: string
): Promise<KoFiData> {
  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: gistToken });
  try {
    const res = await octokit.request(`GET /gists/${gistId}`, {
      gist_id: gistId,
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    const files = (res.data as { files?: Record<string, { content?: string }> })
      .files;
    const file = files?.["kofi.json"];
    if (!file?.content) return { ...EMPTY_DATA };
    const raw = JSON.parse(file.content);
    if (Array.isArray(raw)) return { ...EMPTY_DATA };
    return {
      subscriptions: raw.subscriptions || {},
      donors: raw.donors || [],
      cancellations: raw.cancellations || [],
      refunds: raw.refunds || [],
      tierCounts: raw.tierCounts || {},
    };
  } catch {
    return { ...EMPTY_DATA };
  }
}

async function saveGistData(
  gistId: string,
  gistToken: string,
  data: KoFiData
): Promise<void> {
  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: gistToken });
  const res = await octokit.request(`PATCH /gists/${gistId}`, {
    gist_id: gistId,
    description: `Ko-fi data - Last updated ${new Date().toISOString()}`,
    files: {
      "kofi.json": { content: JSON.stringify(data, null, 2) },
    },
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (res.status !== 200) {
    throw new Error(`Update gist failed: ${res.status}`);
  }
}

function applyPayloadToData(
  data: KoFiData,
  payload: KoFiPayload,
  kind: EventKind
): KoFiData {
  const next = JSON.parse(JSON.stringify(data)) as KoFiData;
  const tier = payload.tier_name || payload.type || "Default";
  const now = payload.timestamp || new Date().toISOString();

  const addOrUpdateSubscription = (isNew: boolean) => {
    const endsAt = new Date(Date.now() + MS_PER_MONTH).toISOString();
    next.subscriptions[payload.from_name] = {
      tier,
      tier_name: payload.tier_name,
      amount: payload.amount,
      currency: payload.currency,
      starts_at: now,
      ends_at: endsAt,
      message_id: payload.message_id,
      from_name: payload.from_name,
    };
    if (isNew) {
      next.tierCounts[tier] = (next.tierCounts[tier] || 0) + 1;
    }
  };

  const removeSubscription = () => {
    delete next.subscriptions[payload.from_name];
    if (next.tierCounts[tier] != null) {
      next.tierCounts[tier] = Math.max(0, next.tierCounts[tier] - 1);
    }
    next.cancellations.push({
      from_name: payload.from_name,
      tier,
      message_id: payload.message_id,
      timestamp: now,
    });
  };

  switch (kind) {
    case "donation":
      next.donors.push({
        from_name: payload.from_name,
        amount: payload.amount,
        currency: payload.currency,
        message: payload.message,
        message_id: payload.message_id,
        timestamp: now,
      });
      break;
    case "subscription_start":
      addOrUpdateSubscription(true);
      break;
    case "subscription_renewal":
      addOrUpdateSubscription(false);
      break;
    case "cancellation":
      removeSubscription();
      break;
    case "refund":
      next.refunds.push({
        from_name: payload.from_name,
        amount: payload.amount,
        currency: payload.currency,
        message_id: payload.message_id,
        timestamp: now,
      });
      break;
    default:
      break;
  }

  return next;
}

// ============ HANDLER ============

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl || !isValidUrl(webhookUrl)) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid Webhook URL." });
  }

  const kofiToken = process.env.KOFI_TOKEN;
  if (!kofiToken) {
    return res
      .status(400)
      .json({ success: false, error: "Ko-fi token required." });
  }

  const kofiUsername = process.env.KOFI_USERNAME;
  const gistUrl = process.env.GIST_URL;
  const gistIdEnv = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  const data = req.body?.data;
  if (!data) {
    return res.status(200).json("Hello world.");
  }

  let payload: KoFiPayload;
  try {
    payload = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return res.status(400).json({ success: false, error: "Invalid payload." });
  }

  if (payload.verification_token !== kofiToken) {
    return res
      .status(403)
      .json({ success: false, error: "Ko-fi token does not match." });
  }

  // Strip sensitive info
  payload.verification_token = CENSOR;
  payload.email = CENSOR;
  payload.kofi_transaction_id = CENSOR;
  payload.shipping = null;

  const kind = getEventKind(payload);
  const targetWebhook = getWebhookForEvent(kind, {
    WEBHOOK_URL: webhookUrl,
    WEBHOOK_SUBSCRIPTIONS: process.env.WEBHOOK_SUBSCRIPTIONS,
    WEBHOOK_DONATIONS: process.env.WEBHOOK_DONATIONS,
    WEBHOOK_ALERTS: process.env.WEBHOOK_ALERTS,
  });

  try {
    await sendToDiscord(targetWebhook, payload, kind, kofiUsername);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Discord webhook failed",
    });
  }

  console.log(`Processed ${kind} payload ${payload.message_id}.`);

  // Atualizar Gist se configurado
  if (gistToken && (gistUrl || gistIdEnv)) {
    try {
      const id = getGistId(gistUrl, gistIdEnv);
      const gistData = await loadGistData(id, gistToken);
      const updated = applyPayloadToData(gistData, payload, kind);
      await saveGistData(id, gistToken, updated);
    } catch (err) {
      console.error("Gist update failed:", err);
      // Não falha a requisição, só loga
    }
  }

  return res.status(200).json({ success: true });
}
