#!/usr/bin/env node
// The three card packages of the control plane at Digistore24 (goals/karte/01).
//
//   node ops/digistore.mjs --create     creates the missing ones of the three products, then writes their IDs into CARD_PACKAGES
//   node ops/digistore.mjs --report     reads only: one line per product, whether the IDs match CARD_PACKAGES, the number of defects
//   node ops/digistore.mjs --selftest   checks the write gate, the create flow and the report against fixed answers, no network
//
// The vendor account is shared with Personalplaner24, Bautagebuch24 and Aszendent24. Writes go only to a product that carries one
// of our three names and whose ID is in CARD_PACKAGES or was created in this run, never to an ID of PROTECTED, and only through
// createProduct, createPaymentplan and updateProduct. Never ipnSetup, approval, vouchers, discounts, marketplace or purchases.
// Access: DIGISTORE24_API_KEY from the environment or ~/brain/connectors/secrets.env (read only), classic API with the header
// X-DS-API-KEY. The key never appears in any output. Standard library and global fetch only.

import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'src', 'payments', 'digistore.ts')
const CLASSIC_URL = 'https://www.digistore24.com/api/call/'

// Products of other projects in the same vendor account (Urlaubsplaner, Personalplaner24, Bautagebuch24, Aszendent24). Never written to.
export const PROTECTED = new Set([
  '736203', '736204', '736205', '736206', '736207',
  '758179', '758180', '758181',
  '758954', '758955', '758956',
  '765137', '767706', '768415', '769937'
])
const WRITE_FUNCTIONS = new Set(['createProduct', 'createPaymentplan', 'updateProduct'])

export const ORDERFORM = '254538'
export const CURRENCY = 'EUR'
export const SALES_PAGE = 'https://automatonhost.com/'
// 7 is "electronically supplied service" in getGlobalSettings: prepaid credit for a hosted service. consumer: the price is gross.
export const PRODUCT_TYPE = '7'
export const BUYER_TYPE = 'consumer'
export const REFUND_DAYS = 30
export const SELLER_SENTENCE = 'Seller of this offer is Digistore24 GmbH. The charge is made by Digistore24.'
export const THANKYOU_TEXT =
  '<p><strong>Thank you for your purchase.</strong> The credit is on your automaton within a few minutes.</p>' +
  `<p>${SELLER_SENTENCE} 30 days money back.</p>`

/** The three packages as the product sees them: label, gross price in cents, name in the account. */
export const PACKAGES = [
  { label: 'credit 5 EUR', grossEurCents: 500 },
  { label: 'credit 20 EUR', grossEurCents: 2000 },
  { label: 'credit 50 EUR', grossEurCents: 5000 }
].map((p) => ({ ...p, name: `Automaton ${p.label}`, price: `${p.grossEurCents / 100}.00` }))
const byName = new Map(PACKAGES.map((p) => [p.name, p]))

// ── Output and access ───────────────────────────────────────────────────────────
let secret = ''
export const setSecret = (s) => { secret = s }
export const mask = (text) => {
  const t = String(text).replace(/X-DS-API-KEY[^,\n]*/gi, 'X-DS-API-KEY ***')
  return secret.length >= 6 ? t.split(secret).join('***') : t
}

function readKey () {
  let key = process.env.DIGISTORE24_API_KEY?.trim()
  if (!key) {
    let text = ''
    try { text = readFileSync(join(homedir(), 'brain', 'connectors', 'secrets.env'), 'utf8') } catch { /* below */ }
    const line = text.split('\n').find((l) => l.startsWith('DIGISTORE24_API_KEY='))
    if (!line) throw new Error('DIGISTORE24_API_KEY missing in environment and secrets.env')
    key = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  }
  setSecret(key)
  return key
}

/** The classic API: form fields in, `data` of a successful answer out, anything else throws (masked). */
export function classicApi (key, fetchImpl = fetch) {
  return async (fn, params = {}) => {
    const body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
    let text
    try {
      const res = await fetchImpl(`${CLASSIC_URL}${fn}/`, {
        method: 'POST',
        headers: { 'X-DS-API-KEY': key, Accept: 'application/json', 'User-Agent': 'automaton-credit' },
        body,
        signal: AbortSignal.timeout(60_000)
      })
      text = await res.text()
    } catch (e) {
      throw new Error(`${fn}: Digistore24 not reachable: ${mask(e.message)}`)
    }
    if (!String(text).includes('{')) throw new Error(`${fn}: ${mask(String(text).trim().slice(0, 200))}`)
    const d = JSON.parse(text.slice(text.indexOf('{')))
    if (d?.result !== 'success') throw new Error(`${fn}: ${mask(String(d?.message ?? JSON.stringify(d)).slice(0, 200))}`)
    return d.data ?? {}
  }
}

// ── CARD_PACKAGES in src/payments/digistore.ts ──────────────────────────────────
const LINE = /\{\s*productId:\s*"([0-9]*)",\s*grossEurCents:\s*([0-9]+),\s*label:\s*"([^"]+)"\s*\}/g

/** label -> productId ('' while not created) of CARD_PACKAGES in the source text. */
export function idsInSource (text) {
  const out = new Map()
  for (const m of text.matchAll(LINE)) out.set(m[3], m[1])
  return out
}

/** The source text with the productId of `label` set to `id`; only the text between its quotes changes. */
export function writeIdInSource (text, label, id) {
  if (!/^[1-9][0-9]*$/.test(id)) throw new Error(`not a product id: ${id}`)
  let hit = 0
  const out = text.replace(LINE, (all, _old, cents, l) => {
    if (l !== label) return all
    hit++
    return all.replace(/productId:\s*"[0-9]*"/, `productId: "${id}"`)
  })
  if (hit !== 1) throw new Error(`CARD_PACKAGES: ${hit} entries for ${label}`)
  return out
}

// ── The write gate ──────────────────────────────────────────────────────────────
/**
 * The one way to write. own: IDs this run may write to (ours by name and in CARD_PACKAGES, or created in this run).
 * Throws before anything is sent for a function that is not allowed, a protected or foreign ID, or an approval.
 */
export async function write (api, own, fn, params) {
  if (!WRITE_FUNCTIONS.has(fn)) throw new Error(`${fn} is not an allowed write`)
  if (/approval|ipn|voucher|marketplace/i.test(Object.keys(params).join(' '))) throw new Error(`${fn}: field not allowed`)
  if (fn !== 'createProduct') {
    const id = String(params.product_id ?? '')
    if (PROTECTED.has(id)) throw new Error(`product ${id} belongs to another project`)
    if (!own.has(id)) throw new Error(`product ${id} is not one of ours`)
  }
  return api(fn, params)
}

const data = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [`data[${k}]`, v]))

export const productFields = (pkg) => ({
  name_intern: pkg.name, name_en: pkg.name, name_de: pkg.name,
  description_en: `Prepaid ${pkg.label} for your automaton. Credit is never paid out.`,
  description_thankyou_page_en: THANKYOU_TEXT, description_thankyou_page_de: THANKYOU_TEXT, description_thankyou_page: THANKYOU_TEXT,
  product_type_id: PRODUCT_TYPE, buyer_type: BUYER_TYPE, currency: CURRENCY, orderform_id: ORDERFORM, salespage_url: SALES_PAGE,
  language: 'en', is_address_input_mandatory: 'N', is_search_engine_allowed: 'N'
})

export const planFields = (pkg) => ({
  first_amount: pkg.price, currency: CURRENCY, number_of_installments: 1, first_billing_interval: '1_month', is_active: 'Y', position: 1
})

/** [{ id, name }] of the account. Without a readable list nothing is created: an empty list would hide an existing product. */
async function listOurs (api) {
  const d = await api('listProducts', {})
  if (!Array.isArray(d?.products)) throw new Error('product list of the account not readable; nothing is created')
  return d.products
    .map((p) => ({ id: String(p.id ?? ''), name: String(p.name_intern ?? '') }))
    .filter((p) => p.id && byName.has(p.name) && !PROTECTED.has(p.id))
}

const productOf = (d) => d?.product ?? d ?? {}
const plansOf = (d) => (Array.isArray(d?.paymentplans) ? d.paymentplans : Array.isArray(d) ? d : [])
const yes = (v) => ['Y', '1', 'true', true].includes(v ?? 'Y')

/** --create. files: { read(), write(text) } of src/payments/digistore.ts. */
export async function create (api, log, files) {
  const found = await listOurs(api)
  const own = new Set()
  const ids = new Map()
  for (const pkg of PACKAGES) {
    const hits = found.filter((p) => p.name === pkg.name)
    if (hits.length > 1) throw new Error(`${hits.length} products named ${pkg.name}; nothing is created`)
    if (hits.length) {
      ids.set(pkg.label, hits[0].id)
      log(`exists ${hits[0].id} ${pkg.label}`)
      continue
    }
    const d = await write(api, own, 'createProduct', data(productFields(pkg)))
    const id = String(d?.product_id ?? d?.id ?? '')
    if (!/^[1-9][0-9]*$/.test(id) || PROTECTED.has(id)) throw new Error(`product not created: ${mask(JSON.stringify(d).slice(0, 200))}`)
    own.add(id)
    ids.set(pkg.label, id)
    // Digistore24 puts a new product on USD and its own order form whatever createProduct was told: set both right after.
    const p = productOf(await api('getProduct', { product_id: id }))
    const fix = {}
    if (String(p.currency ?? '') !== CURRENCY) fix.currency = CURRENCY
    if (String(p.orderform_id ?? '') !== ORDERFORM) fix.orderform_id = ORDERFORM
    if (Object.keys(fix).length) await write(api, own, 'updateProduct', { product_id: id, ...data(fix) })
    const plans = plansOf(await api('listPaymentPlans', { product_id: id }))
    if (plans.length === 0) await write(api, own, 'createPaymentplan', { product_id: id, ...data(planFields(pkg)) })
    log(`created ${id} ${pkg.label}`)
  }
  let text = files.read()
  for (const [label, id] of ids) text = writeIdInSource(text, label, id)
  if (text !== files.read()) files.write(text)
  log(`card packages: ${[...ids].map(([l, id]) => `${l} ${id}`).join(', ')}`)
  return ids
}

/** The report line and the defects of one product. */
export function productVerdict (id, p, plans) {
  const pkg = byName.get(String(p.name_intern ?? ''))
  const defects = []
  const active = plans.filter((x) => yes(x.is_active))
  const plan = active[0] ?? {}
  const amount = String(plan.first_amount ?? '?')
  const cur = String(plan.currency ?? p.currency ?? '?')
  const refund = String(p.refund_policy?.private?.refund_days ?? '?')
  const thanks = [p.description_thankyou_page_en, p.description_thankyou_page_de, p.description_thankyou_page]
    .some((t) => String(t ?? '').includes(SELLER_SENTENCE))
  if (!pkg) defects.push(`product ${id}: not one of ours`)
  if (active.length !== 1) defects.push(`product ${id}: ${active.length} active payment plans`)
  if (pkg && amount !== pkg.price) defects.push(`product ${id}: price ${amount}, expected ${pkg.price}`)
  if (cur !== CURRENCY || String(p.currency ?? '') !== CURRENCY) defects.push(`product ${id}: currency ${p.currency}/${cur}`)
  if (String(plan.number_of_installments ?? '1') !== '1') defects.push(`product ${id}: not a single payment`)
  if (String(p.orderform_id ?? '') !== ORDERFORM) defects.push(`product ${id}: order form ${p.orderform_id}`)
  if (refund !== String(REFUND_DAYS)) defects.push(`product ${id}: refund ${refund} days, expected ${REFUND_DAYS}`)
  if (!thanks) defects.push(`product ${id}: thank-you text without the seller sentence`)
  if (p.salespage_url !== SALES_PAGE) defects.push(`product ${id}: sales page ${p.salespage_url}`)
  if (p.is_active != null && !yes(p.is_active)) defects.push(`product ${id}: not active`)
  const line = `product ${id}: ${pkg?.label ?? 'unknown'}, ${cur} ${amount}, order form ${p.orderform_id ?? '?'}, ` +
    `refund ${refund} days, thankyou ${thanks ? 'yes' : 'no'}, sales page ${p.salespage_url || '?'}`
  return { line, defects }
}

/** ids of the account by label against CARD_PACKAGES of the source. */
export function idsVerdict (accountIds, sourceIds) {
  const differ = PACKAGES.some((pkg) => !accountIds.get(pkg.label) || accountIds.get(pkg.label) !== sourceIds.get(pkg.label))
  return differ ? { line: 'ids: differ', defects: ['ids differ from CARD_PACKAGES'] } : { line: 'ids: match', defects: [] }
}

/** --report: reads only. */
export async function report (api, log, sourceText) {
  const found = await listOurs(api)
  const defects = []
  const accountIds = new Map()
  for (const pkg of PACKAGES) {
    const hits = found.filter((p) => p.name === pkg.name)
    if (hits.length !== 1) { defects.push(`${hits.length} products named ${pkg.name}`); continue }
    accountIds.set(pkg.label, hits[0].id)
  }
  for (const [, id] of accountIds) {
    const p = productOf(await api('getProduct', { product_id: id }))
    const v = productVerdict(id, p, plansOf(await api('listPaymentPlans', { product_id: id })))
    log(v.line)
    defects.push(...v.defects)
  }
  const ids = idsVerdict(accountIds, idsInSource(sourceText))
  log(ids.line)
  defects.push(...ids.defects)
  for (const d of defects) log(`defect: ${d}`)
  log(`report: ${defects.length} defects`)
  return defects.length
}

// ── Self-test ───────────────────────────────────────────────────────────────────
const FAKE_KEY = 'ds-selftest-key-4711-abcdef'
const SAMPLE = `export const CARD_PACKAGES: readonly CardPackage[] = [
  { productId: "", grossEurCents: 500, label: "credit 5 EUR" },
  { productId: "", grossEurCents: 2000, label: "credit 20 EUR" },
  { productId: "", grossEurCents: 5000, label: "credit 50 EUR" },
];`

/** An account with fixed answers that records every write. New products start the way Digistore24 creates them: USD, no form, refund 60. */
function fakeAccount (start = []) {
  const products = start.map((p) => ({ ...p }))
  const plans = new Map()
  const writes = []
  let next = 900100
  const find = (id) => products.find((p) => String(p.id) === String(id))
  const fields = (params) => Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith('data[')).map(([k, v]) => [k.slice(5, -1), v]))
  const api = async (fn, params) => {
    if (WRITE_FUNCTIONS.has(fn) || !['listProducts', 'getProduct', 'listPaymentPlans'].includes(fn)) writes.push(`${fn}:${params.product_id ?? 'new'}`)
    if (fn === 'listProducts') return { products: products.map(({ id, name_intern }) => ({ id, name_intern })) }
    if (fn === 'getProduct') return { product: find(params.product_id) }
    if (fn === 'listPaymentPlans') return { paymentplans: plans.get(String(params.product_id)) ?? [] }
    if (fn === 'createProduct') {
      const id = String(next++)
      products.push({ ...fields(params), id, currency: 'USD', orderform_id: '0', refund_policy: { private: { refund_days: '60' } } })
      return { product_id: id }
    }
    if (fn === 'updateProduct') { Object.assign(find(params.product_id), fields(params)); return {} }
    if (fn === 'createPaymentplan') {
      const f = fields(params)
      plans.set(String(params.product_id), [{ ...f, is_active: 'Y' }])
      return { paymentplan_id: 1 }
    }
    throw new Error(`${fn} not known to the fake account`)
  }
  return { api, products, plans, writes }
}

export async function selftest (print = (l) => console.log(mask(l))) {
  const errors = []
  const lines = []
  const log = (l) => lines.push(mask(l))
  setSecret(FAKE_KEY)
  const foreign = [...PROTECTED].map((id) => ({ id, name_intern: `Foreign ${id}` }))
  // A protected product that happens to carry one of our names is still not ours.
  foreign[5].name_intern = PACKAGES[0].name

  // 1. An account with only foreign products: the three are created, and every write goes to a new ID.
  const a = fakeAccount(foreign)
  let source = SAMPLE
  const files = { read: () => source, write: (t) => { source = t } }
  const ids = await create(a.api, log, files)
  if (ids.size !== 3) errors.push(`create made ${ids.size} products`)
  if (a.writes.some((w) => PROTECTED.has(w.split(':')[1]))) errors.push(`create wrote to a protected product: ${a.writes.join(',')}`)
  if (a.writes.filter((w) => w.startsWith('createProduct')).length !== 3) errors.push(`createProduct ${a.writes.join(',')}`)
  if (a.writes.filter((w) => w.startsWith('createPaymentplan')).length !== 3) errors.push('no payment plan per product')
  for (const p of a.products.filter((x) => byName.has(x.name_intern) && !PROTECTED.has(x.id))) {
    if (p.currency !== 'EUR' || p.orderform_id !== ORDERFORM) errors.push(`product ${p.id} not set to EUR and ${ORDERFORM}`)
  }
  const inSource = idsInSource(source)
  if (PACKAGES.some((pkg) => inSource.get(pkg.label) !== ids.get(pkg.label))) errors.push('ids not written into CARD_PACKAGES')

  // 2. A second run creates nothing and writes nothing.
  const before = a.writes.length
  await create(a.api, log, files)
  if (a.writes.length !== before) errors.push(`second create wrote ${a.writes.slice(before).join(',')}`)

  // 3. The report: refund 60 days is a defect, refund 30 is not, differing IDs are a defect.
  const reportLines = []
  const n60 = await report(a.api, (l) => reportLines.push(l), source)
  if (n60 !== 3 || !reportLines.includes('ids: match')) errors.push(`report with refund 60: ${n60} defects, ${reportLines.join(' | ')}`)
  for (const p of a.products) if (byName.has(p.name_intern)) p.refund_policy = { private: { refund_days: '30' } }
  const good = []
  if (await report(a.api, (l) => good.push(l), source) !== 0) errors.push(`good report has defects: ${good.join(' | ')}`)
  const shape = /^product [0-9]+: credit (5|20|50) EUR, EUR (5|20|50)\.00, order form 254538, refund [0-9]+ days, thankyou yes, sales page https:\/\/automatonhost\.com\/$/
  if (good.filter((l) => shape.test(l)).length !== 3) errors.push(`report lines: ${good.join(' | ')}`)
  const wrongIds = writeIdInSource(source, 'credit 20 EUR', '123456')
  const differ = []
  if (await report(a.api, (l) => differ.push(l), wrongIds) !== 1 || !differ.includes('ids: differ')) errors.push('differing ids are no defect')
  const noThanks = a.products.find((p) => p.name_intern === PACKAGES[1].name && !PROTECTED.has(p.id))
  for (const k of ['description_thankyou_page_en', 'description_thankyou_page_de', 'description_thankyou_page']) noThanks[k] = ''
  const thin = []
  if (await report(a.api, (l) => thin.push(l), source) !== 1 || !thin.some((l) => l.includes('thankyou no'))) errors.push('missing thank-you text is no defect')

  // 4. The write gate: never a protected or foreign ID, never an approval or IPN.
  const gate = fakeAccount(foreign)
  const own = new Set(['900100'])
  const refused = [
    ['protected product', 'updateProduct', { product_id: '758179', 'data[currency]': 'EUR' }],
    ['protected even when listed as own', 'updateProduct', { product_id: '765137', 'data[currency]': 'EUR' }],
    ['foreign product', 'updateProduct', { product_id: '123456', 'data[currency]': 'EUR' }],
    ['ipn setup', 'ipnSetup', { product_ids: '900100' }],
    ['approval', 'updateProduct', { product_id: '900100', 'data[approval_status]': 'pending' }],
    ['voucher', 'createVoucher', { product_ids: '900100' }]
  ]
  own.add('765137')
  for (const [what, fn, params] of refused) {
    let threw = false
    try { await write(gate.api, own, fn, params) } catch { threw = true }
    if (!threw) errors.push(`write gate let through: ${what}`)
  }
  if (gate.writes.length) errors.push(`write gate sent ${gate.writes.join(',')}`)
  for (const id of ['758179', '758180', '758181', '758954', '758955', '758956', '765137', '767706']) {
    if (!PROTECTED.has(id)) errors.push(`${id} is not protected`)
  }

  // 5. No output carries the key: an error that echoes it comes out masked.
  const echo = classicApi(FAKE_KEY, async () => new Response(`denied for key ${FAKE_KEY}`, { status: 403 }))
  try { await echo('listProducts', {}) } catch (e) { log(e.message) }
  const echoJson = classicApi(FAKE_KEY, async () => new Response(JSON.stringify({ result: 'error', message: `bad X-DS-API-KEY ${FAKE_KEY}` })))
  try { await echoJson('listProducts', {}) } catch (e) { log(e.message) }
  const all = [...lines, ...reportLines, ...good, ...differ, ...thin, ...errors].join('\n')
  if (all.includes(FAKE_KEY)) errors.push('an output carries the key')
  if (!lines.some((l) => l.includes('***'))) errors.push('the key was not masked')

  for (const e of errors) print(`FAIL ${e}`)
  setSecret('')
  print(errors.length ? `SELFTEST FAILED (${errors.length})` : 'SELFTEST OK')
  return errors.length ? 1 : 0
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main (argv) {
  const say = (l) => console.log(mask(l))
  if (argv.includes('--selftest')) return selftest()
  const flag = ['--create', '--report'].find((f) => argv.includes(f))
  if (!flag) {
    say("usage: node ops/digistore.mjs '--create' | '--report' | '--selftest'")
    return 2
  }
  const api = classicApi(readKey())
  if (flag === '--create') {
    await create(api, say, { read: () => readFileSync(SOURCE, 'utf8'), write: (t) => writeFileSync(SOURCE, t) })
    return 0
  }
  return (await report(api, say, readFileSync(SOURCE, 'utf8'))) ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (e) => {
    console.error(mask(`error: ${e.message}`))
    process.exitCode = 2
  })
}
