/**
 * POST /api/summary - Envia resumo de subscriptions/donors para o Discord
 * Chamável via cron (Vercel) ou manualmente
 * Requer SUMMARY_TOKEN para autorização
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

interface KoFiData {
  subscriptions: Record<string, { tier: string; tier_name?: string; ends_at: string }>;
  donors: { from_name: string; amount: string; currency: string }[];
  cancellations: { from_name: string; tier: string }[];
  refunds: { from_name: string; amount: string; currency: string }[];
  tierCounts: Record<string, number>;
}

const KOFI_IMG = "https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png";
const IS_COMPONENTS_V2 = 32768;

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function formatTimeUntil(endsAt: string): string {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const ms = end - now;
  if (ms <= 0) return "Expirada";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(ms / 60000)}min`;
}

function buildSummaryMessage(data: KoFiData): { flags: number; components: unknown[] } {
  const lines: string[] = ["## 📊 Resumo Ko-fi", "---"];
  const tierEntries = Object.entries(data.tierCounts || {}).filter(
    ([_, c]) => c > 0
  );
  const totalSubs = tierEntries.reduce((s, [, c]) => s + c, 0);

  lines.push(`**Subscriptions ativas:** ${totalSubs}`);
  tierEntries.forEach(([tier, count]) => {
    lines.push(`  • ${tier}: ${count}`);
  });

  const subList = Object.entries(data.subscriptions || {});
  if (subList.length > 0) {
    lines.push("");
    lines.push("**Por usuário (tempo restante):**");
    subList.slice(0, 15).forEach(([name, entry]) => {
      const time = formatTimeUntil(entry.ends_at);
      lines.push(`  • ${name} (${entry.tier_name || entry.tier}) → ${time}`);
    });
    if (subList.length > 15) {
      lines.push(`  ... e mais ${subList.length - 15}`);
    }
  }

  const donors = (data.donors || []).slice(-10).reverse();
  if (donors.length > 0) {
    lines.push("");
    lines.push("**Últimas doações (one-time):**");
    donors.forEach((d) => {
      lines.push(`  • ${d.from_name}: ${d.amount} ${d.currency}`);
    });
  }

  if ((data.cancellations || []).length > 0) {
    lines.push("");
    lines.push("**Cancelamentos recentes:**");
    data.cancellations.slice(-5).reverse().forEach((c) => {
      lines.push(`  • ${c.from_name} (${c.tier})`);
    });
  }

  if ((data.refunds || []).length > 0) {
    lines.push("");
    lines.push("**⚠️ Reembolsos pendentes:**");
    data.refunds.forEach((r) => {
      lines.push(`  • ${r.from_name}: ${r.amount} ${r.currency}`);
    });
  }

  const content = lines.join("\n");
  return {
    flags: IS_COMPONENTS_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: "Resumo de apoiadores" }],
            accessory: { type: 11, media: { url: KOFI_IMG } },
          },
          { type: 10, content },
        ],
      },
    ],
  };
}

function buildLegacyEmbedSummary(data: KoFiData): { embeds: unknown[] } {
  const lines: string[] = [];
  const tierEntries = Object.entries(data.tierCounts || {}).filter(
    ([_, c]) => c > 0
  );
  const totalSubs = tierEntries.reduce((s, [, c]) => s + c, 0);

  lines.push(`**Subscriptions ativas:** ${totalSubs}`);
  tierEntries.forEach(([tier, count]) => {
    lines.push(`• ${tier}: ${count}`);
  });

  const subList = Object.entries(data.subscriptions || {});
  if (subList.length > 0) {
    lines.push("\n**Por usuário:**");
    subList.slice(0, 10).forEach(([name, entry]) => {
      lines.push(`• ${name} (${entry.tier_name || entry.tier}) → ${formatTimeUntil(entry.ends_at)}`);
    });
  }

  const donors = (data.donors || []).slice(-5).reverse();
  if (donors.length > 0) {
    lines.push("\n**Últimas doações:**");
    donors.forEach((d) => lines.push(`• ${d.from_name}: ${d.amount} ${d.currency}`));
  }

  return {
    embeds: [
      {
        title: "📊 Resumo Ko-fi",
        description: lines.join("\n") || "Nenhum dado ainda.",
        color: 0x9b59b6,
        thumbnail: { url: KOFI_IMG },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function webhookUrlWithComponents(url: string): string {
  const u = new URL(url);
  u.searchParams.set("wait", "true");
  u.searchParams.set("with_components", "true");
  return u.toString();
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const summaryToken = process.env.SUMMARY_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  const webhookSummary = process.env.WEBHOOK_SUMMARY || process.env.WEBHOOK_URL;

  if (!summaryToken && !cronSecret) {
    return res
      .status(400)
      .json({ error: "SUMMARY_TOKEN ou CRON_SECRET não configurado" });
  }

  // Auth: token (manual) OU Bearer CRON_SECRET (Vercel Cron)
  const token =
    req.method === "GET"
      ? req.query.token
      : (req.body?.token ?? req.headers["x-summary-token"]);
  const authHeader = req.headers.authorization;
  const isCronAuth =
    cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isTokenAuth = summaryToken && token === summaryToken;

  if (!isCronAuth && !isTokenAuth) {
    return res.status(401).json({ error: "Token inválido" });
  }

  const gistUrl = process.env.GIST_URL;
  const gistIdEnv = process.env.GIST_ID;
  const gistToken = process.env.GIST_TOKEN;

  if (!gistToken || (!gistUrl && !gistIdEnv)) {
    return res
      .status(400)
      .json({ error: "GIST_TOKEN e (GIST_URL ou GIST_ID) obrigatórios para resumo" });
  }

  if (!webhookSummary || !isValidUrl(webhookSummary)) {
    return res
      .status(400)
      .json({ error: "WEBHOOK_SUMMARY ou WEBHOOK_URL inválido" });
  }

  function getGistId(url?: string, id?: string): string {
    if (id && /^[a-f0-9]+$/i.test(id)) return id;
    if (url) {
      const m = url.match(/gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)\/raw/i);
      if (m) return m[1];
      const m2 = url.match(/gist\.github\.com\/[^/]+\/([a-f0-9]+)/i);
      if (m2) return m2[1];
    }
    throw new Error("GIST_ID ou GIST_URL inválido");
  }

  try {
    const gistId = getGistId(gistUrl, gistIdEnv);
    const { Octokit } = await import("@octokit/core");
    const octokit = new Octokit({ auth: gistToken });
    const res2 = await octokit.request(`GET /gists/${gistId}`, {
      gist_id: gistId,
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    const files = (res2.data as { files?: Record<string, { content?: string }> }).files;
    const file = files?.["kofi.json"];
    if (!file?.content) {
      throw new Error("Gist sem arquivo kofi.json");
    }
    const parsed = JSON.parse(file.content);
    const data: KoFiData = Array.isArray(parsed)
      ? { subscriptions: {}, donors: [], cancellations: [], refunds: [], tierCounts: {} }
      : {
          subscriptions: parsed.subscriptions || {},
          donors: parsed.donors || [],
          cancellations: parsed.cancellations || [],
          refunds: parsed.refunds || [],
          tierCounts: parsed.tierCounts || {},
        };

    const body = buildSummaryMessage(data);
    const legacyBody = buildLegacyEmbedSummary(data);
    const urlWithComponents = webhookUrlWithComponents(webhookSummary);
    const urlNormal = webhookSummary.replace(/\?.*$/, "");

    let discordRes = await fetch(urlWithComponents, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (discordRes.status === 400) {
      discordRes = await fetch(urlNormal, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacyBody),
      });
    }

    if (!discordRes.ok) {
      const text = await discordRes.text();
      throw new Error(`Discord failed: ${discordRes.status} ${text}`);
    }

    return res.status(200).json({ success: true, message: "Resumo enviado" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Erro ao enviar resumo",
    });
  }
}
