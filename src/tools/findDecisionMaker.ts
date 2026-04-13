import { APOLLO_API_KEY } from "../config.js";

export interface DecisionMaker {
  found: boolean;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  email_status: "verified" | "guessed" | "locked" | "unavailable" | "unknown";
  linkedin_url: string | null;
}

const DECISION_MAKER_TITLES = [
  "Founder",
  "Co-Founder",
  "Owner",
  "CEO",
  "Chief Executive Officer",
  "President",
  "Managing Director",
];

const TITLE_BLOCKLIST = [
  "founding engineer",
  "founding member",
  "founding partner",
  "vp",
  "vice president",
  "director of",
  "head of",
  "engineer",
  "developer",
  "designer",
  "manager",
];

function isRealDecisionMaker(title: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (TITLE_BLOCKLIST.some((bad) => t.includes(bad))) return false;
  return DECISION_MAKER_TITLES.some((good) => {
    const g = good.toLowerCase();
    const re = new RegExp(`(^|[^a-z])${g.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z]|$)`);
    return re.test(t);
  });
}

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
  "X-Api-Key": APOLLO_API_KEY,
};

async function searchPeopleIds(orgId: string): Promise<string[]> {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      organization_ids: [orgId],
      person_titles: DECISION_MAKER_TITLES,
      page: 1,
      per_page: 5,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Apollo api_search ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const people: any[] = data.people ?? [];
  if (people.length === 0) return [];

  const order = DECISION_MAKER_TITLES.map((t) => t.toLowerCase());
  const sorted = [...people]
    .filter((p) => p.has_email !== false)
    .sort((a, b) => {
      const ai = order.findIndex((t) => (a.title ?? "").toLowerCase().includes(t));
      const bi = order.findIndex((t) => (b.title ?? "").toLowerCase().includes(t));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  return sorted.map((p) => p.id).filter(Boolean);
}

async function bulkMatch(id: string): Promise<any | null> {
  const res = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ details: [{ id }], reveal_personal_emails: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Apollo bulk_match ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.matches?.[0] ?? null;
}

export async function findDecisionMaker(params: {
  apollo_org_id: string;
}): Promise<DecisionMaker> {
  const empty: DecisionMaker = {
    found: false,
    first_name: null,
    last_name: null,
    title: null,
    email: null,
    email_status: "unavailable",
    linkedin_url: null,
  };

  const ids = await searchPeopleIds(params.apollo_org_id);
  if (ids.length === 0) return empty;

  for (const id of ids) {
    const m = await bulkMatch(id);
    if (!m) continue;
    const email: string | null = m.email ?? null;
    const statusRaw: string = (m.email_status ?? "").toLowerCase();
    let email_status: DecisionMaker["email_status"] = "unknown";
    if (!email || email === "email_not_unlocked@domain.com") {
      email_status = "locked";
    } else if (statusRaw === "verified") {
      email_status = "verified";
    } else if (statusRaw === "guessed" || statusRaw === "unverified") {
      email_status = "guessed";
    }
    if (email && email_status !== "locked" && isRealDecisionMaker(m.title)) {
      return {
        found: true,
        first_name: m.first_name ?? null,
        last_name: m.last_name ?? null,
        title: m.title ?? null,
        email,
        email_status,
        linkedin_url: m.linkedin_url ?? null,
      };
    }
  }

  return { ...empty, found: true, email_status: "locked" };
}
