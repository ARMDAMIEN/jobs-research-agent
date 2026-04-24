import { APOLLO_API_KEY } from "../config.js";

export interface CompanyPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  has_email: boolean;
  linkedin_url: string | null;
}

export interface ListCompanyPeopleResult {
  people: CompanyPerson[];
}

export async function listCompanyPeople(params: {
  apollo_org_id: string;
}): Promise<ListCompanyPeopleResult> {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: JSON.stringify({
      organization_ids: [params.apollo_org_id],
      page: 1,
      per_page: 25,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Apollo api_search ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw: any[] = data.people ?? [];

  const people: CompanyPerson[] = raw.map((p) => ({
    id: p.id ?? "",
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    title: p.title ?? null,
    seniority: p.seniority ?? null,
    has_email: p.has_email !== false,
    linkedin_url: p.linkedin_url ?? null,
  })).filter((p) => p.id);

  return { people };
}
