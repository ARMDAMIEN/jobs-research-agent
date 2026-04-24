import "dotenv/config";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { CLAUDE_MODEL, MAX_COMPANY_SIZE, MAX_LEADS_PER_RUN } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { searchJobs } from "./tools/searchJobs.js";
import { enrichCompany } from "./tools/enrichCompany.js";
import { listCompanyPeople } from "./tools/listCompanyPeople.js";
import { unlockContactEmail } from "./tools/unlockContactEmail.js";
import { sendEmail } from "./tools/sendEmail.js";
import { saveLead, getExistingLeads, type LeadRecord } from "./tools/saveResults.js";
import { sendTelegramReport } from "./tools/sendTelegramReport.js";

// ─── Tool definitions ───────────────────────────────────────────────────────

const searchJobsTool = tool(
  "search_jobs",
  "Search Google Jobs (via SerpAPI) for US job postings matching a query. Returns jobs and a next_page_token for pagination.",
  {
    query: z.string().describe('Role to search, e.g. "executive assistant" or "office manager"'),
    next_page_token: z.string().optional().describe("Token from a previous call to fetch the next page"),
  },
  async (args) => {
    console.log(`  🔍 search_jobs: "${args.query}"${args.next_page_token ? " (next page)" : ""}`);
    try {
      const result = await searchJobs({ query: args.query, next_page_token: args.next_page_token });
      console.log(`    → ${result.jobs.length} jobs, next_page_token=${result.next_page_token ? "yes" : "no"}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `search_jobs failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const enrichCompanyTool = tool(
  "enrich_company",
  `Look up a company on Apollo.io. Returns org data including employee_count. Agent should discard companies with employee_count > ${MAX_COMPANY_SIZE} or found=false.`,
  {
    company_name: z.string(),
    location: z.string().optional(),
  },
  async (args) => {
    console.log(`  🏢 enrich_company: "${args.company_name}"`);
    try {
      const result = await enrichCompany(args);
      console.log(`    → found=${result.found} employees=${result.employee_count ?? "?"} industry="${result.industry ?? "-"}" id=${result.apollo_org_id ?? "-"}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `enrich_company failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const listCompanyPeopleTool = tool(
  "list_company_people",
  "List up to 25 people at an Apollo organization (no email unlock). Returns id, first_name, last_name, title, seniority, has_email, linkedin_url for each. Use this to pick the contact most likely to be the hiring decision-maker for the role being filled, then call unlock_contact_email with their id.",
  {
    apollo_org_id: z.string(),
  },
  async (args) => {
    console.log(`  👥 list_company_people: ${args.apollo_org_id}`);
    try {
      const result = await listCompanyPeople(args);
      console.log(`    → ${result.people.length} people`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `list_company_people failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const unlockContactEmailTool = tool(
  "unlock_contact_email",
  "Unlock the email for a single Apollo person_id. Returns email + email_status. Skip this contact if email is null or email_status is 'locked'.",
  {
    person_id: z.string(),
  },
  async (args) => {
    console.log(`  🔓 unlock_contact_email: ${args.person_id}`);
    try {
      const result = await unlockContactEmail(args);
      console.log(`    → ${result.first_name ?? "-"} ${result.last_name ?? ""} | ${result.title ?? "-"} | ${result.email_status}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `unlock_contact_email failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const sendEmailTool = tool(
  "send_email",
  "Send the personalized cold email via Gmail API. The `tasks` string is spliced into the body as 'I'm guessing you currently need help with {tasks}.' — keep it natural, lowercase, 2-4 items joined with commas and a final 'and'.",
  {
    to: z.string().email(),
    first_name: z.string(),
    company_name: z.string(),
    job_title: z.string().describe('One of "Executive Assistant", "Office Manager", "Chief of Staff", "Operations Manager", "Personal Assistant"'),
    tasks: z.string().describe(
      "Comma-separated list of 2-4 services to pitch, derived from the job description. " +
      "Example: 'lead generation, CRM updates, and outbound follow-ups'. " +
      "Lowercase, no trailing period, no em-dashes."
    ),
  },
  async (args) => {
    console.log(`  ✉️  send_email → ${args.to} (${args.company_name})`);
    try {
      const result = await sendEmail(args);
      console.log(`    → message_id=${result.message_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `send_email failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: true, openWorldHint: true } }
);

const saveLeadTool = tool(
  "save_lead",
  "Persist a lead record to data/leads.json and data/leads.csv. Call after send_email (success or failure).",
  {
    company: z.string(),
    job_title: z.string(),
    location: z.string(),
    employee_count: z.number().nullable(),
    contact_first_name: z.string().nullable(),
    contact_last_name: z.string().nullable(),
    contact_title: z.string().nullable(),
    email: z.string().nullable(),
    status: z.enum(["sent", "failed", "skipped"]),
    sent_at: z.string(),
    message_id: z.string().nullable(),
    source_url: z.string(),
    error: z.string().nullable(),
  },
  async (args) => {
    try {
      const result = await saveLead(args as LeadRecord);
      return { content: [{ type: "text" as const, text: `saved (total=${result.total})` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `save_lead failed: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false } }
);

const sendTelegramReportTool = tool(
  "send_telegram_report",
  "Send the final run summary to Telegram. Call this as the VERY LAST step, after all send_email and save_lead calls, with the complete tally and lead list.",
  {
    sent: z.number().int().nonnegative(),
    skipped_size: z.number().int().nonnegative(),
    skipped_no_contact: z.number().int().nonnegative(),
    skipped_dupe: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    leads: z.array(
      z.object({
        company: z.string(),
        employee_count: z.number().nullable(),
        industry: z.string().nullable(),
        contact_name: z.string(),
        contact_title: z.string(),
        email: z.string(),
        status: z.enum(["sent", "failed"]),
      })
    ),
    notes: z.string().optional(),
  },
  async (args) => {
    console.log(`  📡 send_telegram_report: ${args.sent} sent, ${args.failed} failed`);
    try {
      const result = await sendTelegramReport(args);
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `Telegram failed: ${result.error}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Telegram sent (message_id=${result.message_id})` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Telegram error: ${err}` }], isError: true };
    }
  },
  { annotations: { destructiveHint: false, openWorldHint: true } }
);

const getExistingLeadsTool = tool(
  "get_existing_leads",
  "Return the list of companies and emails already contacted in previous runs. Use this to dedupe before sending.",
  {},
  async () => {
    try {
      const result = await getExistingLeads();
      console.log(`  📋 get_existing_leads: ${result.count} prior leads`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `get_existing_leads failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true } }
);

// ─── MCP server ─────────────────────────────────────────────────────────────

const mcpServer = createSdkMcpServer({
  name: "jobs_research",
  version: "1.0.0",
  tools: [
    searchJobsTool,
    enrichCompanyTool,
    listCompanyPeopleTool,
    unlockContactEmailTool,
    sendEmailTool,
    saveLeadTool,
    getExistingLeadsTool,
    sendTelegramReportTool,
  ],
});

// ─── Task prompt ────────────────────────────────────────────────────────────

const taskPrompt = `Find up to ${MAX_LEADS_PER_RUN} US companies currently hiring an Executive Assistant, Office Manager, Chief of Staff, Operations Manager, or Personal Assistant, each with <= ${MAX_COMPANY_SIZE} employees. For each, pick the contact most likely to hire this role and send a personalized cold email that references tasks pulled directly from the job description.

Follow the workflow in your system prompt exactly. Begin by calling get_existing_leads.

Mode: LIVE (emails will be sent via Gmail)`;

console.log(`\n🚀 jobs-research-agent | max_leads=${MAX_LEADS_PER_RUN} | max_size=${MAX_COMPANY_SIZE}\n`);

async function main() {
  for await (const message of query({
    prompt: taskPrompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: CLAUDE_MODEL,
      mcpServers: { jobs_research: mcpServer },
      tools: [],
      allowedTools: ["mcp__jobs_research__*"],
      permissionMode: "bypassPermissions",
      maxTurns: 150,
      sandbox: { enabled: false, failIfUnavailable: false },
      stderr: (data: string) => process.stderr.write(`[cli-stderr] ${data}`),
    } as any,
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          console.log(`\n🤖 ${block.text.slice(0, 300)}`);
        }
        if (block.type === "tool_use") {
          console.log(`\n🔧 ${block.name}`);
        }
      }
    }
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`\n✅ Done. Cost: $${message.total_cost_usd?.toFixed(4) ?? "?"}`);
      } else {
        console.error(`\n❌ Agent failed:`, (message as any).errors);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
