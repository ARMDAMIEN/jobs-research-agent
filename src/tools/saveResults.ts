import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { LEADS_CSV_PATH, LEADS_JSON_PATH } from "../config.js";

export interface LeadRecord {
  company: string;
  job_title: string;
  location: string;
  employee_count: number | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_title: string | null;
  email: string | null;
  status: "sent" | "failed" | "skipped";
  sent_at: string;
  message_id: string | null;
  source_url: string;
  error: string | null;
}

const CSV_HEADERS = [
  "company",
  "job_title",
  "location",
  "employee_count",
  "contact_first_name",
  "contact_last_name",
  "contact_title",
  "email",
  "status",
  "sent_at",
  "message_id",
  "source_url",
  "error",
];

async function readJson(): Promise<LeadRecord[]> {
  try {
    const raw = await readFile(LEADS_JSON_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: LeadRecord[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(CSV_HEADERS.map((h) => csvEscape((r as any)[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

export async function saveLead(lead: LeadRecord): Promise<{ total: number }> {
  await mkdir(dirname(LEADS_JSON_PATH), { recursive: true });
  const existing = await readJson();
  existing.push(lead);
  await writeFile(LEADS_JSON_PATH, JSON.stringify(existing, null, 2), "utf8");
  await writeFile(LEADS_CSV_PATH, toCsv(existing), "utf8");
  return { total: existing.length };
}

export async function getExistingLeads(): Promise<{
  companies: string[];
  emails: string[];
  count: number;
}> {
  const existing = await readJson();
  const companies = Array.from(
    new Set(existing.map((l) => l.company.toLowerCase().trim()).filter(Boolean))
  );
  const emails = Array.from(
    new Set(
      existing
        .map((l) => (l.email ?? "").toLowerCase().trim())
        .filter((e) => e.length > 0)
    )
  );
  return { companies, emails, count: existing.length };
}
