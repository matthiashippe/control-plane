/**
 * The hosts of the service and the zones of the payment are listed in six files (goals/umzug/01, point 10, and
 * goals/umzug/04). These cases hold every copy against the two lists in code, one case per file, so a host added in one
 * place only fails here with the name of the file that was missed instead of reaching a customer or a revert.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PAYMENT_ZONES } from "../ops/sandbox/sandboxd.mjs";
import { passablePublicUrl } from "../src/sandbox/service.js";
import { SERVICE_HOSTS } from "../src/public/site.js";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sorted = (xs: readonly string[]) => [...xs].sort();

describe("host and payment zone lists stay in step", () => {
  it("ops/live.sh: HOSTS names exactly SERVICE_HOSTS in the same order", () => {
    const m = read("ops/live.sh").match(/^HOSTS="([^"]*)"$/m);
    expect(m, "no HOSTS= line in ops/live.sh").not.toBeNull();
    expect(m![1].split(/\s+/).filter(Boolean)).toEqual([...SERVICE_HOSTS]);
  });

  it("ops/before-the-answers.py: KNOWN_HOSTS is the same set as SERVICE_HOSTS", () => {
    const m = read("ops/before-the-answers.py").match(/^KNOWN_HOSTS = \((.*)\)$/m);
    expect(m, "no KNOWN_HOSTS line in ops/before-the-answers.py").not.toBeNull();
    const hosts = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(sorted(hosts)).toEqual(sorted(SERVICE_HOSTS));
  });

  it("ops/sandbox/cloudflare.py: PAYMENT_ZONES is the same set as in sandboxd", () => {
    const m = read("ops/sandbox/cloudflare.py").match(/^PAYMENT_ZONES = \((.*)\)$/m);
    expect(m, "no PAYMENT_ZONES line in ops/sandbox/cloudflare.py").not.toBeNull();
    const zones = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(sorted(zones)).toEqual(sorted(PAYMENT_ZONES));
  });

  it("ops/sandbox/setup.sh: the case pattern refuses every zone and every name under it", () => {
    const line = read("ops/sandbox/setup.sh")
      .split("\n")
      .find((l) => /^\s*""\|/.test(l) && l.includes("SANDBOXD_DOMAIN"));
    expect(line, "no case pattern for SANDBOXD_DOMAIN in ops/sandbox/setup.sh").toBeDefined();
    const alternatives = line!.trim().split(")")[0].split("|");
    for (const zone of PAYMENT_ZONES) {
      expect(alternatives).toContain(zone);
      expect(alternatives).toContain(`*.${zone}`);
    }
  });

  it("src/sandbox/service.ts: passablePublicUrl refuses every zone and every name under it", () => {
    for (const zone of PAYMENT_ZONES) {
      expect(passablePublicUrl(`https://${zone}/`)).toBeNull();
      expect(passablePublicUrl(`https://x.${zone}/`)).toBeNull();
    }
    expect(passablePublicUrl("https://x.sandboxhost.de/")).toBe("https://x.sandboxhost.de/");
  });

  it("ops/sandbox/sandboxd.mjs: PAYMENT_ZONES is SERVICE_HOSTS without cp.hippe.eu", () => {
    expect(sorted(PAYMENT_ZONES)).toEqual(sorted(SERVICE_HOSTS.filter((h) => h !== "cp.hippe.eu")));
  });
});
