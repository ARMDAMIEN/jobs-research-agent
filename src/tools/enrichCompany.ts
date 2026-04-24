import { APOLLO_API_KEY } from "../config.js";

export interface EnrichedCompany {
  found: boolean;
  apollo_org_id: string | null;
  name: string;
  domain: string | null;
  website: string | null;
  employee_count: number | null;
  industry: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export async function enrichCompany(params: {
  company_name: string;
  location?: string;
}): Promise<EnrichedCompany> {
  const body: Record<string, any> = {
    q_organization_name: params.company_name,
    page: 1,
    per_page: 5,
  };
  if (params.location) {
    body.organization_locations = [params.location];
  }

  const res = await fetch("https://api.apollo.io/api/v1/organizations/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Apollo companies search ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const orgs: any[] = data.organizations ?? data.accounts ?? [];
  if (orgs.length === 0) {
    return {
      found: false,
      apollo_org_id: null,
      name: params.company_name,
      domain: null,
      website: null,
      employee_count: null,
      industry: null,
      linkedin_url: null,
      city: null,
      state: null,
      country: null,
    };
  }

  const target = (params.company_name || "").toLowerCase().trim();
  const scored = orgs
    .map((o) => ({
      org: o,
      score:
        (o.name ?? "").toLowerCase().trim() === target
          ? 100
          : (o.name ?? "").toLowerCase().includes(target)
          ? 50
          : 0,
    }))
    .sort((a, b) => b.score - a.score);
  const org = scored[0].org;

  return {
    found: true,
    apollo_org_id: org.id ?? null,
    name: org.name ?? params.company_name,
    domain: org.primary_domain ?? org.website_url ?? null,
    website: org.website_url ?? null,
    employee_count: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    industry: org.industry ?? null,
    linkedin_url: org.linkedin_url ?? null,
    city: org.city ?? null,
    state: org.state ?? null,
    country: org.country ?? null,
  };
}
