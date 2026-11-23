import { describe, expect, it } from "vitest";
import { sandbox } from "./answers-sandbox";

/**
 * Since 2026-11-17 the service is sold as automatonhost.com (move goal 02). A comment on a public issue is permanent and its
 * link is the only backlink from that thread, so ops/before-the-answers.py has to demand the new address in every new draft and
 * report a draft that still names postyourprice.com or cp.hippe.eu as stale. CP_PUBLIC_HOST is emptied in every run, so the
 * default of the script is what is under test.
 */
const draft = (host: string) =>
  [
    "<!-- Entwurf, intern -->",
    "The 401 is the retry, not the first answer. The first verify answers 500.",
    "",
    `Disclosure: I run ${host} (https://${host}), a control plane for this runtime.`,
    "",
  ].join("\n");

const NO_HOST = { CP_PUBLIC_HOST: "" };

describe("new answers carry https://automatonhost.com", () => {
  it("passes a draft that names https://automatonhost.com, without CP_PUBLIC_HOST set", () => {
    const s = sandbox({ "434.md": draft("automatonhost.com") });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"], NO_HOST);
    expect(r.out).toContain("spells out https://automatonhost.com");
    expect(r.out).not.toContain("FAILED");
    expect(r.out).toContain("READY");
    expect(r.status).toBe(0);
  }, 120_000);

  it("reports a draft that names postyourprice.com as stale and NOT READY", () => {
    const s = sandbox({ "434.md": draft("postyourprice.com") });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"], NO_HOST);
    expect(r.out).toContain("FAILED  spells out https://automatonhost.com");
    expect(r.out).toContain("this draft still names postyourprice.com");
    expect(r.out).toContain("NOT READY");
    expect(r.status).toBe(1);
  }, 120_000);

  it("reports a draft that names cp.hippe.eu as stale and NOT READY", () => {
    const s = sandbox({ "434.md": draft("cp.hippe.eu") });
    const r = s.run("before-the-answers.py", ["--folder", "goals/kanal/antworten"], NO_HOST);
    expect(r.out).toContain("this draft still names cp.hippe.eu");
    expect(r.out).toContain("NOT READY");
    expect(r.status).toBe(1);
  }, 120_000);
});
