import "dotenv/config";

export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY!;
export const APOLLO_API_KEY = process.env.APOLLO_API_KEY!;

export const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID ?? "";
export const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET ?? "";
export const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN ?? "";
export const GMAIL_SENDER = process.env.GMAIL_SENDER ?? "";
export const GMAIL_SENDER_NAME = process.env.GMAIL_SENDER_NAME ?? "";

export const SENDER_FIRST_NAME = process.env.SENDER_FIRST_NAME ?? "Damien A.";
export const SENDER_TITLE = process.env.SENDER_TITLE ?? "Admin & Ops Consultant";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5";
export const MAX_COMPANY_SIZE = Number(process.env.MAX_COMPANY_SIZE ?? 20);
export const MAX_LEADS_PER_RUN = Number(process.env.MAX_LEADS_PER_RUN ?? 5);
export const DRY_RUN = (process.env.DRY_RUN ?? "false").toLowerCase() === "true";

export const DATA_DIR = new URL("../data/", import.meta.url).pathname;
export const LEADS_JSON_PATH = `${DATA_DIR}leads.json`;
export const LEADS_CSV_PATH = `${DATA_DIR}leads.csv`;
