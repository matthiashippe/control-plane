import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { assessGif, assessMp4, assessPoster, assessVideoFiles, defaultPaths, expectedComment, parseGif, parseMp4, readVideoFiles } from "../ops/video-assess.mjs";
// @ts-expect-error plain ESM module under ops/, no declaration file
import { encodePng } from "../ops/soll-assess.mjs";

/**
 * The judgement of ops/video-assess.mjs over the video files of reichweite goal 03 (decision 6): the mp4, its poster and the
 * README gif. Every rejecting case starts from a synthetic file that is clean on every count, shows that it passes, then plants
 * exactly one defect. The boxes and blocks are built here byte by byte, so the test needs no ffmpeg.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// ---- mp4 builders ------------------------------------------------------------------------------------------------------------

function box(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children), head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}
const full = (type: string, body: Buffer, version = 0, flags = 0) => {
  const vf = Buffer.alloc(4); vf.writeUInt32BE(((version & 0xff) << 24) | (flags & 0xffffff), 0);
  return box(type, vf, body);
};
const u32 = (...xs: number[]) => { const b = Buffer.alloc(4 * xs.length); xs.forEach((x, i) => b.writeUInt32BE(x >>> 0, 4 * i)); return b; };
const MATRIX = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

function mvhd(timescale: number, duration: number) {
  return full("mvhd", Buffer.concat([u32(0, 0, timescale, duration, 0x10000), Buffer.from([1, 0]), Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(2)]));
}
function tkhd(width: number, height: number) {
  return full("tkhd", Buffer.concat([u32(0, 0, 1, 0, 0, 0, 0, 0, 0), MATRIX, u32(width * 65536, height * 65536)]), 0, 3);
}
function hdlr(handler: string) {
  return full("hdlr", Buffer.concat([u32(0), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Handler\0", "latin1")]));
}
/** avcC with one SPS and one PPS; High profile carries the chroma format and bit depth bytes. */
function avcC(profile: number, chroma = 1) {
  const sps = Buffer.from([0x67, profile, 0, 0x1f, 0xac]), pps = Buffer.from([0x68, 0xeb, 0xe3]);
  const parts = [Buffer.from([1, profile, 0, 0x1f, 0xff, 0xe1, 0, sps.length]), sps, Buffer.from([1, 0, pps.length]), pps];
  if (profile === 100) parts.push(Buffer.from([0xfc | chroma, 0xf8, 0xf8, 0]));
  return box("avcC", ...parts);
}
function sampleEntry(codec: string, width: number, height: number, child: Buffer) {
  const fields = Buffer.alloc(78);
  fields.writeUInt16BE(1, 6);
  fields.writeUInt16BE(width, 24);
  fields.writeUInt16BE(height, 26);
  fields.writeUInt32BE(0x480000, 28);
  fields.writeUInt32BE(0x480000, 32);
  fields.writeUInt16BE(1, 40);
  fields.writeUInt16BE(24, 74);
  fields.writeInt16BE(-1, 76);
  return box(codec, fields, child);
}
type Track = { handler?: string; width?: number; height?: number; codec?: string; profile?: number; chroma?: number };
function trak({ handler = "vide", width = 1280, height = 720, codec = "avc1", profile = 100, chroma = 1 }: Track = {}) {
  const entry = handler === "vide" ? sampleEntry(codec, width, height, avcC(profile, chroma)) : box("mp4a", Buffer.alloc(28));
  const stsd = full("stsd", Buffer.concat([u32(1), entry]));
  return box("trak", tkhd(handler === "vide" ? width : 0, handler === "vide" ? height : 0),
    box("mdia", full("mdhd", u32(0, 0, 10240, 0, 0)), hdlr(handler), box("minf", box("stbl", stsd))));
}
function udta(comment: string) {
  const data = box("data", u32(1, 0), Buffer.from(comment, "utf8"));
  return box("udta", full("meta", Buffer.concat([hdlr("mdir"), box("ilst", box("©too", box("data", u32(1, 0), Buffer.from("Lavf"))), box("©cmt", data))])));
}
type Mp4 = { tracks?: Track[]; timescale?: number; duration?: number; comment?: string; mdatFirst?: boolean };
function mp4({ tracks = [{}], timescale = 1000, duration = 23400, comment = "", mdatFirst = false }: Mp4 = {}) {
  const ftyp = box("ftyp", Buffer.from("isom"), u32(0x200), Buffer.from("isomiso2avc1mp41"));
  const moov = box("moov", mvhd(timescale, duration), ...tracks.map(trak), udta(comment));
  const mdat = box("mdat", Buffer.alloc(64, 7));
  return Buffer.concat(mdatFirst ? [ftyp, mdat, moov] : [ftyp, moov, box("free"), mdat]);
}

// ---- gif, png and the companion files --------------------------------------------------------------------------------------

type Frame = { delay: number | null };
function gif({ width = 800, height = 450, frames = [{ delay: 10 }, { delay: 10 }] as Frame[], padTo = 0 } = {}) {
  const parts = [Buffer.from("GIF89a", "latin1")];
  const lsd = Buffer.alloc(7); lsd.writeUInt16LE(width, 0); lsd.writeUInt16LE(height, 2); lsd[4] = 0x80;
  parts.push(lsd, Buffer.from([0, 0, 0, 255, 255, 255]));
  parts.push(Buffer.from([0x21, 0xff, 11]), Buffer.from("NETSCAPE2.0", "latin1"), Buffer.from([3, 1, 0, 0, 0]));
  for (const f of frames) {
    if (f.delay !== null) { const g = Buffer.from([0x21, 0xf9, 4, 0, 0, 0, 0, 0]); g.writeUInt16LE(f.delay, 4); parts.push(g); }
    const d = Buffer.alloc(10); d[0] = 0x2c; d.writeUInt16LE(width, 5); d.writeUInt16LE(height, 7);
    parts.push(d, Buffer.from([2, 2, 0x4c, 0x01, 0]));
  }
  const used = parts.reduce((s, p) => s + p.length, 0) + 1;
  if (padTo > used) {
    const blocks: Buffer[] = [Buffer.from([0x21, 0xfe])];
    let left = padTo - used - 3;
    // Each sub-block costs n + 1 bytes with 1 <= n <= 255; never leave a single byte that no sub-block can fill.
    while (left > 0) { const n = left > 256 ? (left - 256 === 1 ? 254 : 255) : left - 1; blocks.push(Buffer.from([n]), Buffer.alloc(n, 0x61)); left -= n + 1; }
    blocks.push(Buffer.from([0]));
    parts.push(...blocks);
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

function png(width: number, height: number, change?: [number, number]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([13, 17, 23, 255], i * 4);
  if (change) rgba.set([200, 40, 40, 255], (change[1] * width + change[0]) * 4);
  return encodePng(width, height, rgba) as Buffer;
}
let keyframeCache: Buffer | undefined;
const keyframe = () => (keyframeCache ??= png(1280, 720));

const transcript = Buffer.from(JSON.stringify({ runtime_rev: "d8f8168", steps: [{ scene: "conway", lines: [{ t_ms: 0, text: "a" }, { t_ms: 5, text: "b" }] }] }, null, 2) + "\n");
const tape = Buffer.from("Type \"Change one line\"\nEnter\n");
const comment = `transcript_sha256=${sha(transcript)} tape_sha256=${sha(tape)}`;
const companions = { transcript, tape };

describe("video files of reichweite goal 03", () => {
  it("accepts the committed video files", () => {
    const files = readVideoFiles(defaultPaths(ROOT));
    const r = assessVideoFiles(files);
    expect(r.defects).toEqual([]);
    expect(r.summary).toMatch(/^video files: mp4 1280x720 \d+\.\d s, poster 1280x720, gif 800 px, 0 defects$/);
    expect(r.mp4.duration).toBeLessThanOrEqual(30);
  });

  it("rejects an mp4 with an audio track", () => {
    expect(expectedComment(transcript, tape)).toBe(comment);
    const clean = assessMp4(mp4({ comment }), companions);
    expect(clean.defects).toEqual([]);
    expect(parseMp4(mp4({ comment })).tracks.map((t: { handler: string }) => t.handler)).toEqual(["vide"]);
    const audio = assessMp4(mp4({ comment, tracks: [{}, { handler: "soun" }] }), companions);
    expect(audio.defects.some((d: string) => /audio track/.test(d))).toBe(true);
    const second = assessMp4(mp4({ comment, tracks: [{}, {}] }), companions);
    expect(second.defects.some((d: string) => /audio track/.test(d))).toBe(true);
    const only = assessMp4(mp4({ comment, tracks: [{ handler: "soun" }] }), companions);
    expect(only.defects.some((d: string) => /audio track/.test(d))).toBe(true);
  });

  it("rejects an mp4 longer than 30 seconds", () => {
    const at30 = assessMp4(mp4({ comment, timescale: 1000, duration: 30000 }), companions);
    expect(at30.defects).toEqual([]);
    expect(at30.duration).toBe(30);
    const long = assessMp4(mp4({ comment, timescale: 15360, duration: 15360 * 30 + 1 }), companions);
    expect(long.defects.some((d: string) => /longer than 30\.0 s/.test(d))).toBe(true);
  });

  it("rejects an mp4 whose moov comes after mdat", () => {
    expect(parseMp4(mp4({ comment })).topLevel).toEqual(["ftyp", "moov", "free", "mdat"]);
    const late = assessMp4(mp4({ comment, mdatFirst: true }), companions);
    expect(late.defects.some((d: string) => /moov after mdat/.test(d))).toBe(true);
  });

  it("rejects an mp4 that is not 1280x720", () => {
    const small = assessMp4(mp4({ comment, tracks: [{ width: 1920, height: 1080 }] }), companions);
    expect(small.width).toBe(1920);
    expect(small.defects.some((d: string) => /1920x1080, not 1280x720/.test(d))).toBe(true);
    const narrow = assessMp4(mp4({ comment, tracks: [{ width: 1280, height: 718 }] }), companions);
    expect(narrow.defects.some((d: string) => /not 1280x720/.test(d))).toBe(true);
  });

  it("rejects an mp4 whose transcript hash does not match", () => {
    const poster = keyframe();
    const all = { mp4: mp4({ comment }), poster, keyframe: poster, gif: gif(), transcript, tape };
    const ok = assessVideoFiles(all);
    expect(ok.defects).toEqual([]);
    expect(ok.summary).toBe("video files: mp4 1280x720 23.4 s, poster 1280x720, gif 800 px, 0 defects");

    const t = JSON.parse(transcript.toString("utf8"));
    t.steps[0].lines.splice(1, 1);
    const shorter = Buffer.from(JSON.stringify(t, null, 2) + "\n");
    const bad = assessVideoFiles({ ...all, transcript: shorter });
    expect(bad.defects.some((d: string) => /transcript_sha256/.test(d))).toBe(true);
    expect(bad.summary).toMatch(/, [1-9]\d* defects$/);

    const otherTape = Buffer.from(tape.toString("utf8").replace("Change one line", "Change two lines"));
    expect(assessVideoFiles({ ...all, tape: otherTape }).defects.some((d: string) => /tape_sha256/.test(d))).toBe(true);
    expect(assessMp4(mp4({ comment: "" }), companions).defects.some((d: string) => /comment/.test(d))).toBe(true);
    const missing = assessVideoFiles({ ...all, transcript: null });
    expect(missing.defects.some((d: string) => /transcript file is missing/.test(d))).toBe(true);
  });

  it("rejects a gif wider than 800 px or larger than 3 MB", () => {
    const clean = gif();
    expect(parseGif(clean)).toMatchObject({ width: 800, height: 450, delays: [10, 10] });
    expect(assessGif(clean).defects).toEqual([]);
    expect(assessGif(gif({ width: 801 })).defects.some((d: string) => /801 px wide, not 800/.test(d))).toBe(true);
    const big = gif({ padTo: 3145729 });
    expect(big.length).toBe(3145729);
    expect(parseGif(big).delays).toEqual([10, 10]);
    expect(assessGif(big).defects.some((d: string) => /larger than 3145728 bytes/.test(d))).toBe(true);
    expect(assessGif(gif({ padTo: 3145728 })).defects).toEqual([]);
    expect(assessGif(gif({ frames: [{ delay: 10 }, { delay: 5 }] })).defects.some((d: string) => /more than 10 frames per second/.test(d))).toBe(true);
    expect(assessGif(gif({ frames: [{ delay: 10 }, { delay: null }] })).defects.some((d: string) => /without a delay/.test(d))).toBe(true);
  });

  it("rejects a poster that differs from key frame 2", () => {
    expect(assessPoster(keyframe(), keyframe()).defects).toEqual([]);
    const off = assessPoster(png(1280, 720, [640, 360]), keyframe());
    expect(off.defects.some((d: string) => /1 pixels differ from key frame 2/.test(d))).toBe(true);
    const small = assessPoster(png(640, 360), keyframe());
    expect(small.defects.some((d: string) => /640x360, not 1280x720/.test(d))).toBe(true);
    expect(assessPoster(null, keyframe()).defects.some((d: string) => /poster file is missing/.test(d))).toBe(true);
    expect(assessPoster(keyframe(), null).defects.some((d: string) => /key frame 2 file is missing/.test(d))).toBe(true);
  });
});
