// Pure part of ops/soll.mjs: PNG decoding, the pixel comparison and the judgement over the measurements of one render.
// No browser and no file system here, so test/soll.test.ts runs it on the GitHub runners, which have no Chromium.
import { deflateSync, inflateSync } from "node:zlib";

/** Bottom of the first screen per width: a phone at 390x844, a laptop at 1440x900. */
export const FOLD = Object.freeze({ 390: 844, 1440: 900 });
export const WIDTHS = Object.freeze([390, 1440]);
/**
 * More differing pixels than this between the committed picture and a fresh render is a defect. Zero, because the
 * render is deterministic (repeated parallel runs under load were pixel-identical) and a changed price or word moves
 * only a few dozen pixels on a page of millions, which any share-based limit lets through.
 */
export const MAX_DIFF_PIXELS = 0;
/** A channel difference up to this is antialiasing noise, not a change. */
export const CHANNEL_TOLERANCE = 8;
const DASHES = /[\u2013\u2014]/;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decodes an 8-bit, non-interlaced PNG (grey, grey+alpha, RGB or RGBA) into RGBA rows. */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG: depth ${depth}, type ${type}, interlace ${interlace}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels, out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride), at = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[at++], line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      if (channels === 1 || channels === 2) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = channels === 2 ? line[s + 1] : 255; }
      else { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = channels === 4 ? line[s + 3] : 255; }
    }
    prev = line;
  }
  return { width, height, data: out };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(kind, body) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(kind, 4, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}
/** Encodes RGBA rows as an 8-bit RGBA PNG without filters; used by the tests to plant pictures. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Number of pixels that differ between two decoded pictures; a pixel outside the smaller one always differs. */
export function pixelDiffCount(a, b) {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  let differ = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= a.width || y >= a.height || x >= b.width || y >= b.height) { differ++; continue; }
    const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4;
    for (let k = 0; k < 4; k++) if (Math.abs(a.data[i + k] - b.data[j + k]) > CHANNEL_TOLERANCE) { differ++; break; }
  }
  return differ;
}

/**
 * Defects of one render. `m` holds what the browser measured:
 * width, pngWidth (width of the committed picture), diffPixels (null when there is nothing to compare with),
 * scrollWidth, text (visible text of the page), foreign (addresses requested that are not file: or data:),
 * umzugBottom (bottom edge of the block data-soll="umzug" in page pixels, null when it is missing).
 */
export function assess(m) {
  const out = [], fold = FOLD[m.width];
  if (!fold) out.push(`${m.width}: no first screen known for this width`);
  if (m.pngWidth !== undefined && m.pngWidth !== m.width) out.push(`${m.width}: picture is ${m.pngWidth} px wide`);
  if (m.diffPixels === null || m.diffPixels === undefined) out.push(`${m.width}: no committed picture to compare with`);
  else if (m.diffPixels > MAX_DIFF_PIXELS) out.push(`${m.width}: ${m.diffPixels} pixels differ from a fresh render`);
  if (m.scrollWidth > m.width) out.push(`${m.width}: horizontal overflow, scrollWidth ${m.scrollWidth}`);
  const dash = String(m.text ?? "").split("\n").find((l) => DASHES.test(l));
  if (dash !== undefined) out.push(`${m.width}: dash in the visible text: ${dash.trim().slice(0, 80)}`);
  for (const url of m.foreign ?? []) out.push(`${m.width}: request to a foreign address: ${url}`);
  if (m.umzugBottom === null || m.umzugBottom === undefined) out.push(`${m.width}: block data-soll="umzug" is missing`);
  else if (fold && m.umzugBottom > fold) out.push(`${m.width}: block umzug ends at ${m.umzugBottom} px, below the first screen at ${fold}`);
  return out;
}

/** True for a request the render may make: the source itself and inline data. */
export const isLocal = (url) => /^(file:|data:|about:blank$)/.test(url);

/** The last line of ops/soll.mjs. Wording fixed by goals/seite/01, Punkt 1. */
export function summary(results) {
  const y = results.map((r) => `${r.width}=${r.umzugBottom ?? "fehlt"}`).join(" ");
  const n = results.reduce((s, r) => s + r.defects.length, 0);
  return `soll: ${results.length} Bilder, umzug oben ${y}, ${n} Mängel`;
}

// ---- /h/{code} (goals/konto/02) -----------------------------------------------------------------------------------------
// The phone page has three states and the block that has to sit in the first screen is the one of the state approve. On top of
// the defects of the start page, a word the reader would first have to translate is a defect (TEAM.md "Klare Wörter").

/**
 * The states of /h/{code} as the code names them, each with the name its approved picture and source carry:
 * docs/soll/handoff-<file>-<width>.png and docs/soll/src/handoff-<file>.html. The pictures keep the names they were approved
 * under (goals/konto/04), and this is the only place that knows them; everything else asks handoffFile().
 */
export const HANDOFF_FILES = Object.freeze({ approve: "freigabe", approved: "erledigt", invalid: "ungueltig" });
/** The states of /h/{code}, each one source and two pictures. */
export const HANDOFF_STATES = Object.freeze(Object.keys(HANDOFF_FILES));
/** The part of the file names of a state's picture and source. */
export const handoffFile = (state) => HANDOFF_FILES[state];
/**
 * The marks of the block that has to sit in the first screen: the approved source carries the name of its file, the page the
 * name of its state. Both describe the same block.
 */
export const HANDOFF_BLOCK_MARKS = Object.freeze(["approve", handoffFile("approve")]);
/** Words that name how the page is built instead of what happens; the same list the goal's source check uses. */
export const HANDOFF_WORDS = /handoff|phishing|token|\bsse\b/i;

/**
 * Defects of one render of /h/{code}. `m` is what assess() takes, with `state` and `blockBottom` (bottom edge of the block of
 * the state approve in page pixels, null when missing) instead of umzugBottom. Only the state approve has to carry the block.
 */
export function assessHandoff(m) {
  // The checks shared with the start page; umzugBottom 0 switches off only its own block, which this page does not have.
  const base = assess({ ...m, umzugBottom: 0 }).map((d) => `${m.state} ${d}`);
  const out = [...base], fold = FOLD[m.width];
  if (!HANDOFF_STATES.includes(m.state)) out.push(`${m.state} ${m.width}: unknown state`);
  const word = String(m.text ?? "").split("\n").find((l) => HANDOFF_WORDS.test(l));
  if (word !== undefined) out.push(`${m.state} ${m.width}: word the reader has to translate in the visible text: ${word.trim().slice(0, 80)}`);
  if (m.state === "approve") {
    if (m.blockBottom === null || m.blockBottom === undefined) out.push(`${m.state} ${m.width}: block data-soll="approve" is missing`);
    else if (fold && m.blockBottom > fold) out.push(`${m.state} ${m.width}: block approve ends at ${m.blockBottom} px, below the first screen at ${fold}`);
  }
  return out;
}

/** The last line of ops/soll-handoff.mjs. Wording fixed by goals/konto/02, Punkt 1, with the name of the approved picture. */
export function summaryHandoff(results) {
  const y = WIDTHS.map((w) => {
    const r = results.find((x) => x.state === "approve" && x.width === w);
    return `${w}=${r?.blockBottom ?? "fehlt"}`;
  }).join(" ");
  const n = results.reduce((s, r) => s + r.defects.length, 0);
  return `soll handoff: ${results.length} Bilder, ${handoffFile("approve")} oben ${y}, ${n} Mängel`;
}

// ---- /h/{code}, account step (goals/konto/03) ----------------------------------------------------------------------------
// Two more states of the phone page: `passkey` (create the account and allow the daily charge) and `fehlgeschlagen` (no account
// was created). The block that has to sit in the first screen is data-soll="passkey". On top of the defects of the start page,
// a word the reader would first have to translate is a defect, with the list of goals/konto/03 ("passkey" is a known word).

/** The states of the account step, each one source docs/soll/src/konto-<state>.html and two pictures. */
export const KONTO_STATES = Object.freeze(["passkey", "fehlgeschlagen"]);
/** Words that name how the account is built instead of what happens; the same list the goal's source check uses. */
export const KONTO_WORDS = /handoff|token|wallet|smart|permission|sepolia|turnkey|\berc/i;

/**
 * Defects of one render of the account step. `m` is what assessHandoff() takes: `state`, `width`, `pngWidth`, `diffPixels`,
 * `scrollWidth`, `text`, `foreign` (requests made and addresses named in attributes that are not file:, data: or relative) and
 * `blockBottom` (bottom edge of data-soll="passkey" in page pixels, null when missing). Only the state passkey carries the block.
 */
export function assessKonto(m) {
  const out = assess({ ...m, umzugBottom: 0 }).map((d) => `${m.state} ${d}`), fold = FOLD[m.width];
  if (!KONTO_STATES.includes(m.state)) out.push(`${m.state} ${m.width}: unknown state`);
  const word = String(m.text ?? "").split("\n").find((l) => KONTO_WORDS.test(l));
  if (word !== undefined) out.push(`${m.state} ${m.width}: word the reader has to translate in the visible text: ${word.trim().slice(0, 80)}`);
  if (m.state === "passkey") {
    if (m.blockBottom === null || m.blockBottom === undefined) out.push(`${m.state} ${m.width}: block data-soll="passkey" is missing`);
    else if (fold && m.blockBottom > fold) out.push(`${m.state} ${m.width}: block passkey ends at ${m.blockBottom} px, below the first screen at ${fold}`);
  }
  return out;
}

/** The last line of ops/soll-konto.mjs. Wording fixed by goals/konto/03, Punkt 1. */
export function summaryKonto(results) {
  const y = WIDTHS.map((w) => {
    const r = results.find((x) => x.state === "passkey" && x.width === w);
    return `${w}=${r?.blockBottom ?? "fehlt"}`;
  }).join(" ");
  const n = results.reduce((s, r) => s + r.defects.length, 0);
  return `soll konto: ${results.length} Bilder, passkey oben ${y}, ${n} Mängel`;
}

// ---- /h/{code}, step limit (goals/konto/04) -------------------------------------------------------------------------------
// Two more states of the phone page for raising the daily limit: `approve` (the number, with today's and the new daily limit)
// and `passkey` (confirm the new limit with the passkey of the account). Each carries a block that has to end in the first
// screen: data-soll="approve" and data-soll="limit". On top of the defects of the start page, a word the reader would first have
// to translate is a defect, with the list of goals/konto/04 ("passkey" and "daily limit" are known words).

/** The states of the step limit, each one source docs/soll/src/limit-<state>.html and two pictures. */
export const LIMIT_STATES = Object.freeze(["approve", "passkey"]);
/** The block of each state that has to end in the first screen, as its data-soll value. */
export const LIMIT_BLOCKS = Object.freeze({ approve: "approve", passkey: "limit" });
/** Words that name how the limit is built instead of what happens; the same list the goal's source check uses. */
export const LIMIT_WORDS = /handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance/i;

/**
 * Defects of one render of the step limit. `m` is what assessKonto() takes: `state`, `width`, `pngWidth`, `diffPixels`,
 * `scrollWidth`, `text`, `foreign` and `blockBottom` (bottom edge of the block of the state in page pixels, null when missing).
 */
export function assessLimit(m) {
  const out = assess({ ...m, umzugBottom: 0 }).map((d) => `${m.state} ${d}`), fold = FOLD[m.width];
  const block = LIMIT_BLOCKS[m.state];
  if (!LIMIT_STATES.includes(m.state)) out.push(`${m.state} ${m.width}: unknown state`);
  const word = String(m.text ?? "").split("\n").find((l) => LIMIT_WORDS.test(l));
  if (word !== undefined) out.push(`${m.state} ${m.width}: word the reader has to translate in the visible text: ${word.trim().slice(0, 80)}`);
  if (block) {
    if (m.blockBottom === null || m.blockBottom === undefined) out.push(`${m.state} ${m.width}: block data-soll="${block}" is missing`);
    else if (fold && m.blockBottom > fold) out.push(`${m.state} ${m.width}: block ${block} ends at ${m.blockBottom} px, below the first screen at ${fold}`);
  }
  return out;
}

/** The last line of ops/soll-limit.mjs. Wording fixed by goals/konto/04, Punkt 1. */
export function summaryLimit(results) {
  const top = (state) => WIDTHS.map((w) => `${w}=${results.find((x) => x.state === state && x.width === w)?.blockBottom ?? "missing"}`).join(" ");
  const n = results.reduce((s, r) => s + r.defects.length, 0);
  return `soll limit: ${results.length} images, ${LIMIT_BLOCKS.approve} top ${top("approve")}, ${LIMIT_BLOCKS.passkey} top ${top("passkey")}, ${n} defects`;
}

// ---- /h/{code}, money in and out (goals/konto/05) -------------------------------------------------------------------------
// Seven more states of the phone page: adding money by card and sending money to the person's own bank account, plus `retry`
// after a signature check that did not go through. Every state carries a block that has to end in the first screen. On top of
// the defects of the start page, a word the reader would first have to translate is a defect, with the list of goals/konto/05
// ("passkey", "IBAN", "card", "identity", Bridge and MoonPay are known words).

/** The states of money in and out, each one source docs/soll/src/money-<state>.html and two pictures. */
export const MONEY_STATES = Object.freeze(["deposit-approve", "deposit-card", "payout-approve", "payout-verify", "payout-bank", "payout-passkey", "retry"]);
/** The block of each state that has to end in the first screen, as its data-soll value. */
export const MONEY_BLOCKS = Object.freeze({
  "deposit-approve": "approve",
  "deposit-card": "card",
  "payout-approve": "approve",
  "payout-verify": "verify",
  "payout-bank": "bank",
  "payout-passkey": "payout",
  retry: "retry",
});
/** Words that name how money moves instead of what happens; the same list the goal's source check uses. */
export const MONEY_WORDS = /handoff|token|wallet|smart|permission|sepolia|turnkey|\berc|allowance|liquidation|on-?ramp|\bkyc|forwarder|spender|usdc/i;

/**
 * Defects of one render of money in and out. `m` is what assessLimit() takes: `state`, `width`, `pngWidth`, `diffPixels`,
 * `scrollWidth`, `text`, `foreign` and `blockBottom` (bottom edge of the block of the state in page pixels, null when missing).
 */
export function assessMoney(m) {
  const out = assess({ ...m, umzugBottom: 0 }).map((d) => `${m.state} ${d}`), fold = FOLD[m.width];
  const block = MONEY_BLOCKS[m.state];
  if (!MONEY_STATES.includes(m.state)) out.push(`${m.state} ${m.width}: unknown state`);
  const word = String(m.text ?? "").split("\n").find((l) => MONEY_WORDS.test(l));
  if (word !== undefined) out.push(`${m.state} ${m.width}: word the reader has to translate in the visible text: ${word.trim().slice(0, 80)}`);
  if (block) {
    if (m.blockBottom === null || m.blockBottom === undefined) out.push(`${m.state} ${m.width}: block data-soll="${block}" is missing`);
    else if (fold && m.blockBottom > fold) out.push(`${m.state} ${m.width}: block ${block} ends at ${m.blockBottom} px, below the first screen at ${fold}`);
  }
  return out;
}

/**
 * The last line of ops/soll-money.mjs. Wording fixed by goals/konto/05, Punkt 2: per width the block bottom furthest down of all
 * states, `missing` when a state of that width has none.
 */
export function summaryMoney(results) {
  const end = (w) => {
    const at = results.filter((r) => r.width === w);
    if (!at.length || at.some((r) => r.blockBottom === null || r.blockBottom === undefined)) return `${w}=missing`;
    return `${w}=${Math.max(...at.map((r) => r.blockBottom))}`;
  };
  const n = results.reduce((s, r) => s + r.defects.length, 0);
  return `soll money: ${results.length} images, blocks end ${WIDTHS.map(end).join(" ")}, ${n} defects`;
}

/**
 * Font configuration for the browser that renders the SOLL pictures. The page stacks start with system-ui and end in the
 * generic sans-serif and monospace, which resolve to whatever the host prefers: the committed pictures were rendered while
 * those were WenQuanYi Zen Hei, and since 2026-11-15 the code-host prefers DejaVu, which renders the same source 56 px taller
 * at 390 px. The edits run after the system configuration and put the reference fonts in front of its own preferences, and
 * DejaVu is left out entirely, because glyphs the reference fonts lack fell back to other fonts when the pictures were made.
 */
const REFERENCE_FONTS = [["sans-serif", "WenQuanYi Zen Hei"], ["system-ui", "WenQuanYi Zen Hei"], ["monospace", "WenQuanYi Zen Hei Mono"]];
export const FONTS_CONF = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <selectfont><rejectfont><glob>*/dejavu/*</glob><glob>*/DejaVu*</glob></rejectfont></selectfont>
${REFERENCE_FONTS.map(([generic, font]) => `  <match target="pattern"><test name="family"><string>${generic}</string></test><edit name="family" mode="prepend" binding="strong"><string>${font}</string></edit></match>`).join("\n")}
</fontconfig>
`;
