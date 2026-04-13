import { google } from "googleapis";
import {
  DRY_RUN,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
  GMAIL_SENDER,
  GMAIL_SENDER_NAME,
} from "../config.js";
import { renderEmailBody, renderEmailSubject } from "../prompt.js";

function buildRawMime(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const from = GMAIL_SENDER_NAME
    ? `${GMAIL_SENDER_NAME} <${GMAIL_SENDER}>`
    : GMAIL_SENDER;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(params.subject, "utf8").toString("base64")}?=`;
  const headers = [
    `From: ${from}`,
    `To: ${params.to}`,
    `Subject: ${subjectEncoded}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].join("\r\n");
  const message = `${headers}\r\n\r\n${params.body}`;
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function gmailClient() {
  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export async function sendEmail(params: {
  to: string;
  first_name: string;
  company_name: string;
  job_title: string;
}): Promise<{ message_id: string; sent_at: string; dry_run: boolean; preview: string }> {
  const subject = renderEmailSubject(params.job_title);
  const body = renderEmailBody(params);
  const preview = `Subject: ${subject}\nTo: ${params.to}\n\n${body}`;

  if (DRY_RUN) {
    return {
      message_id: "dry-run",
      sent_at: new Date().toISOString(),
      dry_run: true,
      preview,
    };
  }

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_SENDER) {
    throw new Error(
      "Gmail not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER (or enable DRY_RUN)"
    );
  }

  const raw = buildRawMime({ to: params.to, subject, body });
  const gmail = gmailClient();
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    message_id: res.data.id ?? "",
    sent_at: new Date().toISOString(),
    dry_run: false,
    preview,
  };
}
