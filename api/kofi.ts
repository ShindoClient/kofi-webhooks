/**
 * Ko-fi Webhook → Discord
 * Adaptado de https://github.com/raidensakura/kofi-discord-notification
 * Para Vercel Serverless Functions (TypeScript)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

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
}

const CENSOR = "*****";
const KOFI_IMG = "https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png";

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

async function sendDiscordEmbed(
  webhookUrl: string,
  payload: KoFiPayload,
  kofiUsername?: string,
) {
  const embed = {
    author: {
      name: "Ko-fi",
      icon_url: KOFI_IMG,
    },
    thumbnail: { url: KOFI_IMG },
    title: "New supporter on Ko-fi ☕",
    url: kofiUsername ? `https://ko-fi.com/${kofiUsername}` : undefined,
    color: tierColor(payload.tier_name),
    fields: [
      { name: "From", value: payload.from_name, inline: true },
      { name: "Type", value: payload.type, inline: true },
      {
        name: "Amount",
        value: `${payload.amount} ${payload.currency}`,
        inline: true,
      },
      ...(payload.message && payload.message !== "null"
        ? [{ name: "Message", value: payload.message, inline: false }]
        : []),
    ],
    footer: {
      text: "Thank you for supporting us!",
      icon_url: KOFI_IMG,
    },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
}

async function updateGist(
  gistUrl: string,
  gistToken: string,
  supporters: KoFiPayload[],
  messageId: string,
): Promise<void> {
  const match = gistUrl.match(/\/([\da-f]+)\/raw\//);
  if (!match) throw new Error("Could not get Gist ID from URL.");

  const gistId = match[1];
  const dateString = new Date().toLocaleString();

  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: gistToken });

  const gistRes = await octokit.request(`PATCH /gists/${gistId}`, {
    gist_id: gistId,
    description: `Last updated at ${dateString}`,
    files: {
      "kofi.json": {
        content: JSON.stringify(supporters),
      },
    },
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });

  if (gistRes.status !== 200) {
    throw new Error(`Update gist failed: ${gistRes.status}`);
  }

  console.log(`Updated gist for payload ${messageId}.`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  try {
    await sendDiscordEmbed(webhookUrl, payload, kofiUsername);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Discord webhook failed",
    });
  }

  console.log(`Processed payload ${payload.message_id}.`);

  if (!gistUrl || !gistToken) {
    return res.status(200).json({ success: true });
  }

  try {
    const gistRes = await fetch(gistUrl);
    if (gistRes.status === 404) {
      throw new Error("Gist not found.");
    }
    const supporters: KoFiPayload[] = gistRes.ok ? await gistRes.json() : [];
    supporters.push(payload);
    await updateGist(gistUrl, gistToken, supporters, payload.message_id);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Gist update failed",
    });
  }

  return res.status(200).json({ success: true });
}
