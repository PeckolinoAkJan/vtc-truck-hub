import { platformEnv } from "@/lib/platform";

type EmbedField = { name: string; value: string; inline?: boolean };
export type DiscordEmbed = { title?: string; description?: string; color?: number; image?: { url: string }; fields?: EmbedField[]; footer?: { text: string }; timestamp?: string };

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
export const discordInviteUrl = () => {
  const id = platformEnv().DISCORD_APPLICATION_ID || platformEnv().DISCORD_CLIENT_ID;
  return id ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&permissions=268521472&scope=bot%20applications.commands` : null;
};
export async function discordRequest<T = Record<string, unknown>>(path: string, init: RequestInit = {}) {
  const token = platformEnv().DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord-Bot-Token ist nicht konfiguriert");
  const response = await fetch(`https://discord.com/api/v10${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Discord ${response.status}: ${clip(await response.text(), 500)}`);
  return response.status === 204 ? null : await response.json() as T;
}
export function rulesMessage(config: Record<string, unknown>, rules: Array<{ title: string; body: string }>) {
  const description = rules.length ? rules.map((rule, index) => `**${index + 1}. ${clip(rule.title, 180)}**\n${clip(rule.body, 900)}`).join("\n\n") : clip(config.rulesDescription, 3900) || "Für diesen Server wurden noch keine Regeln hinterlegt.";
  const embed: DiscordEmbed = { title: clip(config.rulesTitle, 256) || "Regelwerk", description: clip(description, 4096), color: 0x22d3c5 };
  if (/^https:\/\//i.test(String(config.rulesImageUrl ?? ""))) embed.image = { url: String(config.rulesImageUrl) };
  return { embeds: [embed], components: [{ type: 1, components: [{ type: 2, style: 3, label: clip(config.rulesButtonLabel, 80) || "Regeln bestätigen", custom_id: `rules_accept:${clip(config.guildId, 40)}` }] }], allowed_mentions: { parse: [] } };
}
export function deliveryMessage(row: Record<string, unknown>) {
  const money = Number(row.income ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { embeds: [{ title: "✅ Auftrag abgegeben", color: 0x22d3c5, fields: [
    { name: "Fahrer", value: clip(row.driver, 100) || "Unbekannt", inline: true },
    { name: "Spiel", value: clip(row.game, 20) || "–", inline: true },
    { name: "Strecke", value: `${clip(row.sourceCity, 100) || "–"} → ${clip(row.destinationCity, 100) || "–"}` },
    { name: "Fracht", value: clip(row.cargo, 200) || "–", inline: true },
    { name: "Distanz", value: `${Number(row.distanceKm ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`, inline: true },
    { name: "Einnahmen", value: `${money} V€`, inline: true },
    { name: "Schaden", value: `${Number(row.damage ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`, inline: true },
    { name: "Abrechnung", value: "Wartet auf Fahrerbestätigung", inline: true },
  ], footer: { text: clip(row.vtcName, 200) || "VTC Truck Hub" }, timestamp: clip(row.completedAt, 40) || new Date().toISOString() }], allowed_mentions: { parse: [] } };
}
