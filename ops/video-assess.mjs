// Checks the video files of reichweite goal 03 (decision 6) without ffmpeg and without network: the mp4 under src/public/video/,
// its poster, and the README gif under docs/video/. The mp4 boxes and the gif blocks are read here in Node; the PNGs go through
// decodePng and pixelDiffCount from ops/soll-assess.mjs.
//
//   node ops/video-assess.mjs [--mp4 <f>] [--poster <f>] [--gif <f>] [--keyframe <f>] [--transcript <f>] [--tape <f>]
//
// Prints one line `video files: defect <text>` per defect and as last line the summary
// `video files: mp4 <w>x<h> <d> s, poster <w>x<h>, gif <w> px, <n> defects`; exit 1 on any defect. A missing file is a defect.
// The judgement lives in the exported pure functions, which test/video-assess.test.ts runs on synthetic buffers.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pixelDiffCount } from "./soll-assess.mjs";

export const MP4_WIDTH = 1280;
export const MP4_HEIGHT = 720;
export const MAX_SECONDS = 30;
export const MAX_MP4_BYTES = 2097152;
export const POSTER_WIDTH = 1280;
export const POSTER_HEIGHT = 720;
export const GIF_WIDTH = 800;
export const MAX_GIF_BYTES = 3145728;
/** Smallest frame delay in centiseconds: 10 cs is 10 frames per second. */
export const MIN_GIF_DELAY_CS = 10;
/** H.264 profiles allowed: Baseline, Main, High. All three carry 4:2:0 only, which is what yuv420p is. */
export const AVC_PROFILES = Object.freeze([66, 77, 100]);

const PREFIX = "video files:";
/** Boxes the parser descends into; everything else is read as a leaf. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "ilst", "edts", "dinf"]);
/** Size of the fields of a visual sample entry (ISO 14496-12) between its header and its child boxes. */
const VISUAL_ENTRY_FIELDS = 78;
/** The iTunes metadata key the ffmpeg option -metadata comment=... writes: the bytes A9 63 6D 74. */
const COMMENT_KEY = "©cmt";

/** Splits buf[start, end) into boxes: { type, start, head, end }. Stops at a box whose size runs past the end. */
function boxes(buf, start, end) {
  const out = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos), head = 8;
    const type = buf.toString("latin1", pos + 4, pos + 8);
    if (size === 1) {
      if (pos + 16 > end) break;
      size = Number(buf.readBigUInt64BE(pos + 8));
      head = 16;
    } else if (size === 0) size = end - pos;
    if (size < head || pos + size > end) { out.push({ type, start: pos, head, end: pos + size, truncated: true }); break; }
    out.push({ type, start: pos, head, end: pos + size });
    pos += size;
  }
  return out;
}
const child = (buf, b, type, skip = 0) => boxes(buf, b.start + b.head + skip, b.end).find((c) => c.type === type);
const children = (buf, b, type, skip = 0) => boxes(buf, b.start + b.head + skip, b.end).filter((c) => c.type === type);
const body = (buf, b) => buf.subarray(b.start + b.head, b.end);

/** Reads the profile, chroma format and bit depth from an avcC box body. Chroma and depth are null when the box omits them. */
function readAvcC(b) {
  if (b.length < 7) return { profile: null, chromaFormat: null, bitDepthLuma: null, bitDepthChroma: null };
  const profile = b[1];
  let at = 6, chromaFormat = null, bitDepthLuma = null, bitDepthChroma = null;
  const sps = b[5] & 0x1f;
  for (let i = 0; i < sps && at + 2 <= b.length; i++) at += 2 + b.readUInt16BE(at);
  const pps = at < b.length ? b[at++] : 0;
  for (let i = 0; i < pps && at + 2 <= b.length; i++) at += 2 + b.readUInt16BE(at);
  if (![66, 77, 88].includes(profile) && at + 3 <= b.length) {
    chromaFormat = b[at] & 0x03;
    bitDepthLuma = (b[at + 1] & 0x07) + 8;
    bitDepthChroma = (b[at + 2] & 0x07) + 8;
  }
  return { profile, chromaFormat, bitDepthLuma, bitDepthChroma };
}

function readTrack(buf, trak) {
  const t = { handler: null, width: null, height: null, codec: null, profile: null, chromaFormat: null, bitDepthLuma: null, bitDepthChroma: null };
  const tkhd = child(buf, trak, "tkhd");
  if (tkhd) {
    const b = body(buf, tkhd), at = b[0] === 1 ? 88 : 76;
    if (b.length >= at + 8) { t.width = b.readUInt32BE(at) / 65536; t.height = b.readUInt32BE(at + 4) / 65536; }
  }
  const mdia = child(buf, trak, "mdia");
  const hdlr = mdia && child(buf, mdia, "hdlr");
  if (hdlr) { const b = body(buf, hdlr); if (b.length >= 12) t.handler = b.toString("latin1", 8, 12); }
  const minf = mdia && child(buf, mdia, "minf");
  const stbl = minf && child(buf, minf, "stbl");
  const stsd = stbl && child(buf, stbl, "stsd");
  const entry = stsd && boxes(buf, stsd.start + stsd.head + 8, stsd.end)[0];
  if (entry) {
    t.codec = entry.type;
    const avcC = entry.end - entry.start > entry.head + VISUAL_ENTRY_FIELDS ? child(buf, entry, "avcC", VISUAL_ENTRY_FIELDS) : undefined;
    if (avcC) Object.assign(t, readAvcC(body(buf, avcC)));
  }
  return t;
}

function readComment(buf, moov) {
  const udta = child(buf, moov, "udta");
  const meta = udta && child(buf, udta, "meta");
  // meta is a full box: four bytes of version and flags before its children.
  const ilst = meta && child(buf, meta, "ilst", 4);
  const cmt = ilst && child(buf, ilst, COMMENT_KEY);
  const data = cmt && child(buf, cmt, "data");
  if (!data) return null;
  // data: four bytes of type (1 is UTF-8), four bytes of locale, then the value.
  return body(buf, data).subarray(8).toString("utf8");
}

/**
 * Reads what decision 6 asks about from an mp4: the order of the top-level boxes, the movie duration, every track with its
 * handler, size, codec and avcC fields, and the comment. Never throws on a broken file; `error` names the first problem.
 */
export function parseMp4(buf) {
  const out = { topLevel: [], timescale: null, durationUnits: null, duration: null, tracks: [], comment: null, error: null };
  if (!Buffer.isBuffer(buf) || buf.length < 8) { out.error = "file is too short for an mp4"; return out; }
  const top = boxes(buf, 0, buf.length);
  out.topLevel = top.map((b) => b.type);
  if (top.some((b) => b.truncated)) out.error = "a box runs past the end of the file";
  const moov = top.find((b) => b.type === "moov");
  if (!moov) { out.error ??= "no moov box"; return out; }
  const mvhd = child(buf, moov, "mvhd");
  if (mvhd) {
    const b = body(buf, mvhd);
    if (b[0] === 1 && b.length >= 32) { out.timescale = b.readUInt32BE(20); out.durationUnits = Number(b.readBigUInt64BE(24)); }
    else if (b.length >= 20) { out.timescale = b.readUInt32BE(12); out.durationUnits = b.readUInt32BE(16); }
    if (out.timescale) out.duration = out.durationUnits / out.timescale;
  }
  out.tracks = children(buf, moov, "trak").map((t) => readTrack(buf, t));
  out.comment = readComment(buf, moov);
  return out;
}

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** The comment the mp4 has to carry for exactly this transcript and tape. */
export function expectedComment(transcript, tape) {
  return `transcript_sha256=${sha256(transcript)} tape_sha256=${sha256(tape)}`;
}

/**
 * Defects of the mp4 against decision 6. `files.transcript` and `files.tape` are the bytes the comment has to name; null means
 * the file is missing. Returns { defects, width, height, duration } with the measured values (null when unknown).
 */
export function assessMp4(buf, files = {}) {
  const defects = [];
  if (!Buffer.isBuffer(buf)) return { defects: ["mp4 file is missing"], width: null, height: null, duration: null, missing: true };
  const m = parseMp4(buf);
  if (m.error) defects.push(`mp4 is broken: ${m.error}`);
  if (buf.length > MAX_MP4_BYTES) defects.push(`mp4 is ${buf.length} bytes, larger than ${MAX_MP4_BYTES} bytes`);

  const moovAt = m.topLevel.indexOf("moov"), mdatAt = m.topLevel.indexOf("mdat");
  if (mdatAt < 0) defects.push("mp4 has no mdat box");
  else if (moovAt > mdatAt) defects.push("mp4 has moov after mdat, no fast start");

  if (m.duration === null) defects.push("mp4 has no movie duration (mvhd)");
  else if (m.duration > MAX_SECONDS) defects.push(`mp4 is ${m.duration.toFixed(3)} s, longer than ${MAX_SECONDS.toFixed(1)} s`);

  const handlers = m.tracks.map((t) => t.handler ?? "none");
  if (m.tracks.length !== 1 || handlers.includes("soun")) defects.push(`mp4 has an audio track or a second track: ${m.tracks.length} tracks, handlers ${handlers.join(",") || "none"}`);
  const video = m.tracks.find((t) => t.handler === "vide");
  if (!video) defects.push("mp4 has no video track");
  else {
    if (video.width !== MP4_WIDTH || video.height !== MP4_HEIGHT) defects.push(`mp4 is ${video.width}x${video.height}, not ${MP4_WIDTH}x${MP4_HEIGHT}`);
    if (video.codec !== "avc1") defects.push(`mp4 codec is ${video.codec ?? "unknown"}, not avc1 (H.264)`);
    else if (!AVC_PROFILES.includes(video.profile)) defects.push(`mp4 H.264 profile ${video.profile ?? "unknown"} is not one of ${AVC_PROFILES.join(", ")} (4:2:0)`);
    else if (video.chromaFormat !== null && (video.chromaFormat !== 1 || video.bitDepthLuma !== 8 || video.bitDepthChroma !== 8)) {
      defects.push(`mp4 pixel format is chroma ${video.chromaFormat} at ${video.bitDepthLuma} bit, not yuv420p`);
    }
  }

  if (!Buffer.isBuffer(files.transcript)) defects.push("transcript file is missing");
  if (!Buffer.isBuffer(files.tape)) defects.push("tape file is missing");
  if (m.comment === null || m.comment === "") defects.push("mp4 has no comment metadata");
  else if (Buffer.isBuffer(files.transcript) && Buffer.isBuffer(files.tape)) {
    const want = expectedComment(files.transcript, files.tape);
    if (m.comment !== want) {
      const got = /^transcript_sha256=(\S*) tape_sha256=(\S*)$/.exec(m.comment);
      const [wantT, wantP] = /^transcript_sha256=(\S*) tape_sha256=(\S*)$/.exec(want).slice(1);
      if (!got) defects.push("mp4 comment is not of the form transcript_sha256=<hex> tape_sha256=<hex>");
      else {
        if (got[1] !== wantT) defects.push("mp4 comment transcript_sha256 does not match the transcript file");
        if (got[2] !== wantP) defects.push("mp4 comment tape_sha256 does not match the tape file");
      }
    }
  }
  return { defects, width: video?.width ?? null, height: video?.height ?? null, duration: m.duration };
}

/** Reads the logical screen and the delay of every frame (null for a frame without graphic control extension) from a gif. */
export function parseGif(buf) {
  const out = { version: null, width: null, height: null, delays: [], error: null };
  if (!Buffer.isBuffer(buf) || buf.length < 13) { out.error = "file is too short for a gif"; return out; }
  out.version = buf.toString("latin1", 0, 6);
  if (out.version !== "GIF87a" && out.version !== "GIF89a") { out.error = "no GIF87a or GIF89a header"; return out; }
  out.width = buf.readUInt16LE(6);
  out.height = buf.readUInt16LE(8);
  let pos = 13;
  if (buf[10] & 0x80) pos += 3 * (1 << ((buf[10] & 0x07) + 1));
  const skipSubBlocks = () => { while (pos < buf.length && buf[pos] !== 0) pos += buf[pos] + 1; pos++; };
  let delay = null;
  while (pos < buf.length) {
    const kind = buf[pos];
    if (kind === 0x3b) return out;
    if (kind === 0x21) {
      const label = buf[pos + 1];
      if (label === 0xf9 && pos + 6 <= buf.length) delay = buf.readUInt16LE(pos + 4);
      pos += 2;
      skipSubBlocks();
    } else if (kind === 0x2c) {
      if (pos + 10 > buf.length) break;
      const packed = buf[pos + 9];
      pos += 10;
      if (packed & 0x80) pos += 3 * (1 << ((packed & 0x07) + 1));
      pos++; // LZW minimum code size
      skipSubBlocks();
      out.delays.push(delay);
      delay = null;
    } else { out.error = `unknown block 0x${kind.toString(16)} at byte ${pos}`; return out; }
  }
  out.error = "gif ends without trailer";
  return out;
}

/** Defects of the README gif against decision 6. */
export function assessGif(buf) {
  if (!Buffer.isBuffer(buf)) return { defects: ["gif file is missing"], width: null, missing: true };
  const defects = [], g = parseGif(buf);
  if (g.error) defects.push(`gif is broken: ${g.error}`);
  if (g.width !== null && g.width !== GIF_WIDTH) defects.push(`gif is ${g.width} px wide, not ${GIF_WIDTH}`);
  if (buf.length > MAX_GIF_BYTES) defects.push(`gif is ${buf.length} bytes, larger than ${MAX_GIF_BYTES} bytes`);
  if (g.version && !g.error && g.delays.length === 0) defects.push("gif has no frame");
  const missing = g.delays.filter((d) => d === null).length;
  if (missing) defects.push(`gif has ${missing} frames without a delay`);
  const fast = g.delays.filter((d) => d !== null && d < MIN_GIF_DELAY_CS);
  if (fast.length) defects.push(`gif has ${fast.length} frames with a delay under ${MIN_GIF_DELAY_CS} cs, more than 10 frames per second`);
  return { defects, width: g.width };
}

function decode(buf, name, defects) {
  try { return decodePng(buf); } catch (e) { defects.push(`${name} does not decode: ${e.message}`); return null; }
}

/** Defects of the poster: decodes, is 1280x720 and pixel-equal to key frame 2. */
export function assessPoster(poster, keyframe) {
  const defects = [];
  if (!Buffer.isBuffer(poster)) defects.push("poster file is missing");
  if (!Buffer.isBuffer(keyframe)) defects.push("key frame 2 file is missing");
  const p = Buffer.isBuffer(poster) ? decode(poster, "poster", defects) : null;
  const k = Buffer.isBuffer(keyframe) ? decode(keyframe, "key frame 2", defects) : null;
  if (p && (p.width !== POSTER_WIDTH || p.height !== POSTER_HEIGHT)) defects.push(`poster is ${p.width}x${p.height}, not ${POSTER_WIDTH}x${POSTER_HEIGHT}`);
  if (p && k) {
    const diff = pixelDiffCount(p, k);
    if (diff > 0) defects.push(`poster: ${diff} pixels differ from key frame 2`);
  }
  return { defects, width: p?.width ?? null, height: p?.height ?? null, missing: !Buffer.isBuffer(poster) };
}

const dims = (w, h) => (w === null || h === null ? "?x?" : `${w}x${h}`);

/** All checks over one set of files (Buffers, null for a missing file) and the summary line. */
export function assessVideoFiles(files) {
  const mp4 = assessMp4(files.mp4 ?? null, { transcript: files.transcript ?? null, tape: files.tape ?? null });
  const poster = assessPoster(files.poster ?? null, files.keyframe ?? null);
  const gif = assessGif(files.gif ?? null);
  const defects = [...mp4.defects, ...poster.defects, ...gif.defects];
  const m = mp4.missing ? "mp4 missing" : `mp4 ${dims(mp4.width, mp4.height)} ${mp4.duration === null ? "?" : mp4.duration.toFixed(1)} s`;
  const p = poster.missing ? "poster missing" : `poster ${dims(poster.width, poster.height)}`;
  const g = gif.missing ? "gif missing" : `gif ${gif.width ?? "?"} px`;
  return { defects, mp4, poster, gif, summary: `${PREFIX} ${m}, ${p}, ${g}, ${defects.length} defects` };
}

/** The committed files, relative to the repo root. */
export function defaultPaths(root) {
  return {
    mp4: path.join(root, "src/public/video/move.mp4"),
    poster: path.join(root, "src/public/video/move-poster.png"),
    gif: path.join(root, "docs/video/move.gif"),
    keyframe: path.join(root, "docs/soll/video-move-2-1280.png"),
    transcript: path.join(root, "docs/video/move.transcript.json"),
    tape: path.join(root, "docs/video/move.tape"),
  };
}

/** Reads every file; a file that cannot be read becomes null, which the checks report as missing. */
export function readVideoFiles(paths) {
  const out = {};
  for (const [k, f] of Object.entries(paths)) { try { out[k] = readFileSync(f); } catch { out[k] = null; } }
  return out;
}

const USAGE = "usage: node ops/video-assess.mjs [--mp4 <f>] [--poster <f>] [--gif <f>] [--keyframe <f>] [--transcript <f>] [--tape <f>]";

function main(args) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const paths = defaultPaths(ROOT);
  // Every argument is a known flag followed by its value; anything else ends the tool before it reads a file.
  for (let i = 0; i < args.length; i += 2) {
    const key = /^--(mp4|poster|gif|keyframe|transcript|tape)$/.exec(args[i])?.[1];
    if (!key || args[i + 1] === undefined || args[i + 1].startsWith("--")) { console.error(USAGE); process.exit(1); }
    paths[key] = path.resolve(args[i + 1]);
  }
  const r = assessVideoFiles(readVideoFiles(paths));
  for (const d of r.defects) console.log(`${PREFIX} defect ${d}`);
  console.log(r.summary);
  process.exit(r.defects.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
