import { TELEGRAM_BOT_API_KEY, TELEGRAM_CHAT_ID } from "../config.js";

export interface TelegramReportInput {
  sent: number;
  skipped_size: number;
  skipped_no_contact: number;
  skipped_dupe: number;
  failed: number;
  leads: Array<{
    company: string;
    employee_count: number | null;
    industry: string | null;
    contact_name: string;
    contact_title: string;
    email: string;
    status: "sent" | "failed";
  }>;
  notes?: string;
}

function escapeMarkdownV2(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function formatReport(input: TelegramReportInput): string {
  const e = escapeMarkdownV2;
  const lines: string[] = [];
  lines.push(`*jobs\\-research\\-agent run complete*`);
  lines.push("");
  lines.push(
    `📬 sent: *${input.sent}*  \\|  ❌ failed: *${input.failed}*  \\|  ⏭ dupe: *${input.skipped_dupe}*  \\|  🏢 too big: *${input.skipped_size}*  \\|  👻 no contact: *${input.skipped_no_contact}*`
  );

  if (input.leads.length > 0) {
    lines.push("");
    lines.push("*Leads:*");
    for (const l of input.leads) {
      const icon = l.status === "sent" ? "✅" : "⚠️";
      const size = l.employee_count != null ? ` \\(${l.employee_count} emp\\)` : "";
      const industry = l.industry ? ` · _${e(l.industry)}_` : "";
      lines.push(
        `${icon} *${e(l.company)}*${e(size)}${industry}\n    ${e(l.contact_name)} — ${e(l.contact_title)}\n    \`${e(l.email)}\``
      );
    }
  }

  if (input.notes) {
    lines.push("");
    lines.push(`_${e(input.notes)}_`);
  }
  return lines.join("\n");
}

export async function sendTelegramReport(
  input: TelegramReportInput
): Promise<{ ok: boolean; message_id: number | null; error?: string }> {
  if (!TELEGRAM_BOT_API_KEY || !TELEGRAM_CHAT_ID) {
    return {
      ok: false,
      message_id: null,
      error: "TELEGRAM_BOT_API_KEY or TELEGRAM_CHAT_ID not set",
    };
  }
  const text = formatReport(input);
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_API_KEY}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      message_id: null,
      error: `Telegram API ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
    };
  }
  return { ok: true, message_id: data.result?.message_id ?? null };
}
