/**
 * The domain endpoints the unmodified runtime calls (docs/sandbox/vertrag.md, rows with `/v1/domains`).
 *
 * Until 2026-11-11 none of them had a route, and the fallback 404 cost a stranger's automaton four
 * attempts per search, because the runtime retries every 404 three times (`src/conway/client.ts:51`
 * at d8f8168). What this control plane can honestly answer without buying anything:
 *
 * - search: 501 for a valid query, with the names it covers. A 200 cannot say "not offered here":
 *   the runtime's tool `search_domains` turns every `available: false` into `<name>: taken`
 *   (`src/agent/tools.ts` at d8f8168), which would tell a customer's agent that a free name is held
 *   by someone. On an error status the runtime hands our body to the tool as it is, so the agent
 *   reads that no domain can be registered here and that availability was not checked. 501 is
 *   neither retried nor counted toward the breaker. A malformed query stays a 400.
 * - register: 501, the same answer as every other thing this service deliberately does not offer.
 *   Registering a domain is a purchase, and a purchase is a decision of the operator, not of an API
 *   call. 501 is neither retried nor counted toward the runtime's circuit breaker.
 * - DNS: 403 for a domain this account does not hold, which today is every domain, since none can be
 *   registered here. No record is invented and nothing is written.
 *
 * Nothing in here touches the ledger: no answer costs credits, so there is nothing to bill.
 */
import { DOC } from "./errors.js";

/** The TLDs searched when the caller names none. The contract's example (`com,io,ai`). */
export const DEFAULT_TLDS = ["com", "io", "ai"] as const;

/** At most this many TLDs per search, so one query cannot fan out into an unbounded answer. */
export const MAX_TLDS = 10;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A lower-cased domain name, or null if it is not one. At least two labels, at most 253 characters. */
export function normalizeDomain(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\.$/, "");
  if (name.length === 0 || name.length > 253) return null;
  const labels = name.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  return name;
}

export type DomainAnswer = { status: 200 | 400 | 403 | 501; body: Record<string, unknown> };

/** The tool text must not contain "taken" or "AVAILABLE" (test/domains.test.ts, "search_domains tool text"). */
function searchNotOffered(names: string[]): string {
  return (
    `No domain can be registered here, so availability was not checked for ${names.join(", ")}. ` +
    "This answer says nothing about whether a name is free elsewhere. Nothing was charged, and " +
    "retrying gives the same answer until this service offers domain registration."
  );
}

/** GET /v1/domains/search?query=<q>&tlds=<list> */
export function searchDomains(query: string | undefined, tlds: string | undefined): DomainAnswer {
  const q = (query ?? "").trim().toLowerCase();
  if (q.length === 0) {
    return {
      status: 400,
      body: {
        error: "invalid_query",
        message: "Pass the name to search as ?query=<name>, for example ?query=myagent&tlds=com,io.",
        docs: DOC.domains,
      },
    };
  }

  let names: string[];
  if (q.includes(".")) {
    const full = normalizeDomain(q);
    names = full ? [full] : [];
  } else if (LABEL.test(q)) {
    const list = tlds === undefined || tlds.trim() === "" ? [...DEFAULT_TLDS] : tlds.split(",").map((t) => t.trim().toLowerCase().replace(/^\./, ""));
    if (list.length > MAX_TLDS || !list.every((t) => LABEL.test(t))) {
      return {
        status: 400,
        body: {
          error: "invalid_tlds",
          message: `tlds is a comma-separated list of at most ${MAX_TLDS} TLDs without dots, for example com,io,ai.`,
          docs: DOC.domains,
        },
      };
    }
    names = [...new Set(list)].map((t) => `${q}.${t}`);
  } else {
    names = [];
  }
  if (names.length === 0) {
    return {
      status: 400,
      body: {
        error: "invalid_query",
        message: "query is either one label (letters, digits, hyphens) or a full domain name such as myagent.com.",
        docs: DOC.domains,
      },
    };
  }

  return {
    status: 501,
    body: {
      error: "not_implemented",
      reason: "domain search is not offered",
      names,
      message: searchNotOffered(names),
      docs: DOC.domains,
    },
  };
}

/** POST /v1/domains/register */
export function registerDomain(): DomainAnswer {
  return {
    status: 501,
    body: {
      error: "not_implemented",
      reason: "domain registration is not offered",
      message:
        "The domain was not registered and nothing was charged. Registering a domain is a purchase, " +
        "and this control plane does not buy domains on behalf of its callers. Nothing needs to be " +
        "retried: the answer stays the same until this service offers registration.",
      docs: DOC.domains,
    },
  };
}

/** GET, POST /v1/domains/{domain}/dns and DELETE /v1/domains/{domain}/dns/{record}, for a domain the caller does not hold. */
export function domainNotHeld(domain: string): DomainAnswer {
  return {
    status: 403,
    body: {
      error: "domain_not_held",
      domain,
      message:
        `This account holds no domain ${domain} here, so there are no DNS records to read, add or ` +
        "delete for it, and nothing was changed. No domain can be registered on this control plane, " +
        "so this is the answer for every domain until that changes.",
      docs: DOC.domains,
    },
  };
}

/** The two shapes under /v1/domains/ that the contract names besides search and register, or null. */
export function parseDnsPath(pathname: string): { domain: string | null; record: string | null } | null {
  const m = pathname.match(/^\/v1\/domains\/([^/]+)\/dns(?:\/([^/]+))?$/);
  if (!m) return null;
  let raw: string;
  let record: string | null;
  try {
    raw = decodeURIComponent(m[1]);
    record = m[2] === undefined ? null : decodeURIComponent(m[2]);
  } catch {
    return { domain: null, record: null };
  }
  return { domain: normalizeDomain(raw), record };
}

/** The 400 for a path segment that is not a domain name. */
export function invalidDomain(): DomainAnswer {
  return {
    status: 400,
    body: {
      error: "invalid_domain",
      message: "The path segment after /v1/domains/ is not a domain name; send it URL-encoded, for example myagent.com.",
      docs: DOC.domains,
    },
  };
}
