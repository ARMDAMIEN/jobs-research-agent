import "dotenv/config";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { CLAUDE_MODEL, DRY_RUN, MAX_COMPANY_SIZE, MAX_LEADS_PER_RUN } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { searchJobs } from "./tools/searchJobs.js";
import { enrichCompany } from "./tools/enrichCompany.js";
import { findDecisionMaker } from "./tools/findDecisionMaker.js";
import { sendEmail } from "./tools/sendEmail.js";
import { saveLead, getExistingLeads, type LeadRecord } from "./tools/saveResults.js";

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

const findDecisionMakerTool = tool(
  "find_decision_maker",
  "Find a founder/owner/CEO contact for an Apollo organization. Returns first_name, email, email_status. Skip leads where email is null or email_status is 'locked'.",
  {
    apollo_org_id: z.string(),
  },
  async (args) => {
    console.log(`  👤 find_decision_maker: ${args.apollo_org_id}`);
    try {
      const result = await findDecisionMaker(args);
      console.log(`    → ${result.first_name ?? "-"} ${result.last_name ?? ""} | ${result.title ?? "-"} | ${result.email_status}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `find_decision_maker failed: ${err}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

const sendEmailTool = tool(
  "send_email",
  "Send the personalized cold email via Gmail API. Renders the template with first_name/company_name/job_title. Respects DRY_RUN.",
  {
    to: z.string().email(),
    first_name: z.string(),
    company_name: z.string(),
    job_title: z.string().describe('"Executive Assistant" or "Office Manager"'),
  },
  async (args) => {
    console.log(`  ✉️  send_email → ${args.to} (${args.company_name})${DRY_RUN ? " [DRY_RUN]" : ""}`);
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
    findDecisionMakerTool,
    sendEmailTool,
    saveLeadTool,
    getExistingLeadsTool,
  ],
});

// ─── Task prompt ────────────────────────────────────────────────────────────

const taskPrompt = `Find up to ${MAX_LEADS_PER_RUN} US companies currently hiring an Executive Assistant or Office Manager, each with <= ${MAX_COMPANY_SIZE} employees, and send the personalized cold email to a founder/owner/CEO at each.

Follow the workflow in your system prompt exactly. Begin by calling get_existing_leads.

Mode: ${DRY_RUN ? "DRY_RUN (no real emails will be sent)" : "LIVE (emails will be sent via Gmail)"}`;

console.log(`\n🚀 jobs-research-agent | max_leads=${MAX_LEADS_PER_RUN} | max_size=${MAX_COMPANY_SIZE} | dry_run=${DRY_RUN}\n`);

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
      maxTurns: 80,
    },
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
