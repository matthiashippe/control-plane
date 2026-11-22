#!/usr/bin/env node
// Makes the three card packages of the control plane sell at Digistore24 (goals/karte/02, point 1 and 11).
//
//   node ops/digistore-release.mjs '--passphrase'   creates ~/.config/control-plane/digistore-ipn.txt (mode 600) if it is missing
//   node ops/digistore-release.mjs '--ipn'          creates the IPN connection automaton-credit once; an existing one stays as it is
//   node ops/digistore-release.mjs '--report'       reads only: the IPN, each product, its test purchase and approval, the defects
//   node ops/digistore-release.mjs '--submit'       submits each product for approval, once per state of the product and of the
//                                                   block card of src/public/index.html, and only without a defect
//   node ops/digistore-release.mjs '--selftest'     the same flows against a fake account, no network
//
// The vendor account is shared with Personalplaner24, Bautagebuch24 and Aszendent24. Writes go only to the three IDs of
// CARD_PACKAGES in src/payments/digistore.ts, never to an ID of PROTECTED, and only through ipnSetup (one connection with our own
// domain_id) and updateProduct with approval_status pending. Never a purchase, refund, voucher, marketplace entry or price.
// The API key and the IPN passphrase never appear in any output. ops/digistore.mjs (goals/karte/01) stays unchanged; its exports
// are reused here. Standard library and global fetch only.

import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PROTECTED, classicApi, idsInSource, mask as maskKey, productVerdict, setSecret } from './digistore.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'src', 'payments', 'digistore.ts')
const PAGE_FILE = join(ROOT, 'src', 'public', 'index.html')
const CONFIG = join(homedir(), '.config', 'control-plane')
export const PASSPHRASE_FILE = join(CONFIG, 'digistore-ipn.txt')
const SUBMITTED_FILE = join(CONFIG, 'digistore-submitted.json')

export const IPN = {
  ipn_url: 'https://automatonhost.com/pay/digistore',
  name: 'automaton-credit',
  domain_id: 'automaton-credit',
  categories: 'orders',
  transactions: ['payment', 'refund', 'chargeback'],
  timing: 'before_thankyou'
}
const FLAGS = ['--passphrase', '--ipn', '--report', '--submit', '--selftest']

// ── Output: neither the key nor the passphrase ever leaves ──────────────────────
let passphraseSecret = ''
const mask = (text) => {
  const t = maskKey(text)
  return passphraseSecret.length >= 8 ? t.split(passphraseSecret).join('***') : t
}

// ── The passphrase file ─────────────────────────────────────────────────────────
const PASSPHRASE = /^[0-9a-f]{32}$/

/** The passphrase in `file`, or '' when the file is missing or holds anything but 32 hex characters. */
export function readPassphrase (file) {
  let text = ''
  try { text = readFileSync(file, 'utf8').trim() } catch { return '' }
  return PASSPHRASE.test(text) ? text : ''
}

/** --passphrase: creates the file with umask 077 when it is missing; an existing file is never touched. */
export function ensurePassphrase (file, log) {
  if (!existsSync(file)) {
    const old = process.umask(0o077)
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      writeFileSync(file, `${randomBytes(16).toString('hex')}\n`, { mode: 0o600, flag: 'wx' })
      chmodSync(file, 0o600)
    } finally {
      process.umask(old)
    }
  }
  if (!readPassphrase(file)) throw new Error(`${file} does not hold 32 hex characters; it is left as it is`)
  log('passphrase file ready')
  return 0
}

// ── Our three products ──────────────────────────────────────────────────────────
/** The three product IDs of CARD_PACKAGES, in their order; throws on anything else, so nothing is written with a wrong ID. */
export function ownIds (sourceText) {
  const ids = [...idsInSource(sourceText).values()]
  if (ids.length !== 3 || ids.some((id) => !/^[1-9][0-9]{4,}$/.test(id)) || new Set(ids).size !== 3) {
    throw new Error(`CARD_PACKAGES does not name three product IDs: ${ids.join(',') || 'none'}`)
  }
  for (const id of ids) if (PROTECTED.has(id)) throw new Error(`product ${id} belongs to another project`)
  return ids
}

/** Throws before anything is sent when a write would touch anything but our own products. */
export function assertOwn (own, ids) {
  for (const id of ids) {
    if (PROTECTED.has(String(id))) throw new Error(`product ${id} belongs to another project`)
    if (!own.includes(String(id))) throw new Error(`product ${id} is not one of ours`)
  }
}

// ── Verdicts ────────────────────────────────────────────────────────────────────
const setOf = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

/** The IPN line and its defects from ipnInfo. The passphrase is compared, never printed. */
export function ipnVerdict (info, own, passphrase) {
  const s = info?.ipn_settings
  if (info?.have_settings !== 'Y' || !s || Array.isArray(s)) {
    return { line: `ipn ${IPN.domain_id}: missing`, defects: [`ipn ${IPN.domain_id}: missing`] }
  }
  const products = setOf(s.product_ids)
  const events = setOf(s.transactions)
  const timing = s.timing === 'before_thankyou' ? 'before' : 'after'
  const defects = []
  if (s.ipn_url !== IPN.ipn_url) defects.push(`ipn: url ${s.ipn_url || 'missing'}`)
  if (!sameSet(products, own)) defects.push(`ipn: products ${products.join(',') || 'none'}`)
  if (!sameSet(events, IPN.transactions)) defects.push(`ipn: events ${events.join(',') || 'none'}`)
  if (s.timing !== IPN.timing) defects.push(`ipn: timing ${s.timing || 'missing'}`)
  if (!passphrase) defects.push('ipn: passphrase file missing on this host')
  else if (s.sha_passphrase !== passphrase) defects.push('ipn: passphrase differs from the file on this host')
  const line = `ipn ${IPN.domain_id}: url ${s.ipn_url || '?'}, products ${products.join(',') || 'none'}, ` +
    `events ${events.join(' ') || 'none'}, ${timing} thankyou`
  return { line, defects }
}

/** The approval of the German reseller (DS-de) counts; approval_status alone is empty for a new product. */
export function approvalOf (p) {
  const list = Array.isArray(p?.approval_status_list) ? p.approval_status_list : []
  const de = list.find((a) => String(a.reseller_id) === '1') ?? list[0] ?? {}
  return {
    status: String(de.approval_status || p?.approval_status || 'new'),
    reason: String(de.approval_reject_reason_msg || '').replace(/\s+/g, ' ').trim()
  }
}

export function approvalVerdict (id, p) {
  const { status, reason } = approvalOf(p)
  const line = `approval ${id}: ${status}${reason ? `, ${reason}` : ''}`
  const defects = status === 'pending' || status === 'approved' ? [] : [`approval ${id}: ${status}`]
  return { line, defects }
}

/** Test purchases per product from listPurchases: only the count, never a buyer, an email or a custom field. */
export function testPurchaseVerdict (id, purchases) {
  const n = purchases.filter((x) => String(x.main_product_id) === String(id) && String(x.transaction_pay_method) === 'Test').length
  return { line: `test purchase ${id}: ${n}`, defects: n > 0 ? [] : [`test purchase ${id}: none`] }
}

/** What Digistore24 reviews; the hash of it is the state that may be submitted once. */
export function stateHash (p) {
  const plans = (Array.isArray(p?.paymentplans) ? p.paymentplans : []).map((x) => [
    x.first_amount, x.currency, x.number_of_installments, x.is_active
  ])
  const fields = [
    p?.name_intern, p?.name_en, p?.description_en, p?.description_thankyou_page_en, p?.description_thankyou_page,
    p?.salespage_url, p?.buyer_type, p?.currency, p?.product_type_id, p?.orderform_id,
    JSON.stringify(p?.refund_policy ?? null), JSON.stringify(plans)
  ]
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex')
}

/**
 * The sales page Digistore24 reviews with the products (salespage_url): the hash of the block card of src/public/index.html with its
 * buttons, prices, credit and text, or null without the block. Nothing outside the block changes it.
 */
export function salesPageState (html) {
  const start = String(html ?? '').search(/<section id="card"[\s>]/)
  if (start < 0) return null
  const end = html.indexOf('</section>', start)
  if (end < 0) return null
  return createHash('sha256').update(html.slice(start, end + '</section>'.length)).digest('hex')
}

const productOf = (d) => d?.product ?? d ?? {}
const plansOf = (p) => (Array.isArray(p?.paymentplans) ? p.paymentplans : [])

/** Everything --report prints: { lines, defects, products, own } with the defects of each product apart. */
export async function readRelease (deps) {
  const own = ownIds(deps.source())
  const lines = []
  const defects = []
  const byProduct = Object.fromEntries(own.map((id) => [id, []]))
  const products = {}
  const add = (v, id) => {
    lines.push(v.line)
    defects.push(...v.defects)
    if (id) byProduct[id].push(...v.defects)
  }
  try {
    add(ipnVerdict(await deps.api('ipnInfo', { domain_id: IPN.domain_id }), own, deps.passphrase()))
  } catch (e) {
    add({ line: `ipn ${IPN.domain_id}: unreadable (${e.message})`, defects: ['ipn: unreadable'] })
  }
  let purchases = null
  try {
    const d = await deps.api('listPurchases', {
      from: '2026-11-01', to: 'now', 'search[product_id]': own.join(','), 'search[order_type]': 'test', page_size: 500
    })
    purchases = Array.isArray(d?.purchase_list) ? d.purchase_list : []
  } catch (e) {
    lines.push(`test purchases: unreadable (${e.message})`)
  }
  for (const id of own) {
    try {
      products[id] = productOf(await deps.api('getProduct', { product_id: id }))
    } catch (e) {
      add({ line: `product ${id}: unreadable (${e.message})`, defects: [`product ${id}: unreadable`] }, id)
      continue
    }
    add(productVerdict(id, products[id], plansOf(products[id])), id)
    add(purchases ? testPurchaseVerdict(id, purchases) : { line: `test purchase ${id}: unreadable`, defects: [`test purchase ${id}: unreadable`] }, id)
  }
  for (const id of own) {
    if (products[id]) add(approvalVerdict(id, products[id]), id)
  }
  return { lines, defects, byProduct, products, own }
}

export async function report (deps) {
  const r = await readRelease(deps)
  for (const l of r.lines) deps.log(l)
  for (const d of r.defects) deps.log(`defect: ${d}`)
  deps.log(`release report: ${r.defects.length} defects`)
  return r.defects.length ? 1 : 0
}

/** --ipn: one connection with our domain_id for our three products; an existing connection is never changed. */
export async function ipn (deps) {
  const own = ownIds(deps.source())
  assertOwn(own, own)
  const info = await deps.api('ipnInfo', { domain_id: IPN.domain_id })
  if (info?.have_settings === 'Y') {
    deps.log(`ipn ${IPN.domain_id}: exists, nothing changed`)
    deps.log(ipnVerdict(info, own, deps.passphrase()).line)
    return 0
  }
  const passphrase = deps.passphrase()
  if (!passphrase) throw new Error(`passphrase file missing or not 32 hex characters, run '--passphrase' first (${PASSPHRASE_FILE})`)
  const { transactions, ...rest } = IPN
  await deps.api('ipnSetup', { ...rest, product_ids: own.join(','), transactions: transactions.join(','), sha_passphrase: passphrase })
  deps.log(`ipn ${IPN.domain_id}: created`)
  deps.log(ipnVerdict(await deps.api('ipnInfo', { domain_id: IPN.domain_id }), own, passphrase).line)
  return 0
}

/**
 * --submit: approval_status pending for each product that has no defect but its approval and is neither pending nor approved, at
 * most once per state. The state is the product (stateHash) and its sales page (salesPageState), so a rejected product goes in once
 * more after a change of the block card alone. Without the block nothing is submitted. The state is written down before the call,
 * so a crash never leads to a second submission.
 */
export async function submit (deps) {
  const r = await readRelease(deps)
  for (const l of r.lines) deps.log(l)
  const blocking = r.defects.filter((d) => d.startsWith('ipn'))
  if (blocking.length) {
    for (const d of blocking) deps.log(`defect: ${d}`)
    deps.log(`submit: nothing submitted, ${blocking.length} defects of the ipn`)
    return 1
  }
  const page = salesPageState(deps.page())
  if (page === null) {
    deps.log('submit: nothing submitted, src/public/index.html has no block card')
    return 1
  }
  const store = deps.store.read()
  let sent = 0
  for (const id of r.own) {
    const own = r.byProduct[id].filter((d) => !d.startsWith('approval '))
    if (own.length) {
      deps.log(`submit ${id}: not submitted, ${own.length} defects`)
      continue
    }
    const { status } = approvalOf(r.products[id])
    if (status === 'pending' || status === 'approved') {
      deps.log(`submit ${id}: ${status}, nothing to do`)
      continue
    }
    const hash = stateHash(r.products[id])
    if (store[id]?.hash === hash && store[id]?.page === page) {
      deps.log(`submit ${id}: this state was submitted already (${store[id].at}), not a second time`)
      continue
    }
    assertOwn(r.own, [id])
    store[id] = { hash, page, at: deps.now(), before: status }
    deps.store.write(store)
    await deps.api('updateProduct', { product_id: id, 'data[approval_status]': 'pending' })
    sent++
    deps.log(`submit ${id}: submitted`)
  }
  deps.log(`submitted: ${sent} products`)
  return 0
}

// ── Real access ─────────────────────────────────────────────────────────────────
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

/** Only the functions this tool may call; anything else throws before it is sent. */
const READS = new Set(['ipnInfo', 'getProduct', 'listPurchases'])
const WRITES = new Set(['ipnSetup', 'updateProduct'])
export function guarded (api, own) {
  return async (fn, params = {}) => {
    if (!READS.has(fn) && !WRITES.has(fn)) throw new Error(`${fn} is not allowed`)
    if (fn === 'getProduct' || fn === 'updateProduct') assertOwn(own, [params.product_id])
    if (fn === 'ipnSetup') {
      if (params.domain_id !== IPN.domain_id || params.ipn_url !== IPN.ipn_url) throw new Error('ipnSetup: not our connection')
      assertOwn(own, setOf(params.product_ids))
    }
    if (fn === 'updateProduct') {
      const keys = Object.keys(params).filter((k) => k !== 'product_id')
      if (keys.length !== 1 || keys[0] !== 'data[approval_status]' || params[keys[0]] !== 'pending') {
        throw new Error('updateProduct: only approval_status pending is allowed')
      }
    }
    return api(fn, params)
  }
}

function jsonStore (file) {
  return {
    read: () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}),
    write: (data) => {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
      chmodSync(file, 0o600)
    }
  }
}

// ── Self-test ───────────────────────────────────────────────────────────────────
const FAKE_KEY = 'ds-release-selftest-key-0815'
const SAMPLE = `export const CARD_PACKAGES = [
  { productId: "900101", grossEurCents: 500, label: "credit 5 EUR" },
  { productId: "900102", grossEurCents: 2000, label: "credit 20 EUR" },
  { productId: "900103", grossEurCents: 5000, label: "credit 50 EUR" },
];`
const OWN = ['900101', '900102', '900103']
const PAGE = `<section id="move"><a href="#card">Pay by card</a></section>
<section id="card" data-soll="card"><form method="get">
<button class="card pick card-buy" type="submit" formaction="https://www.checkout-ds24.com/product/900101/">5 EUR about $3 credit</button>
</form></section>`

function goodProduct (id, label, price) {
  const thanks = '<p>Seller of this offer is Digistore24 GmbH. The charge is made by Digistore24. 30 days money back.</p>'
  return {
    id, name_intern: `Automaton ${label}`, name_en: `Automaton ${label}`, currency: 'EUR', orderform_id: '254538',
    salespage_url: 'https://automatonhost.com/', description_thankyou_page_en: thanks, is_active: 'Y',
    refund_policy: { private: { refund_days: 30 } },
    paymentplans: [{ first_amount: price, currency: 'EUR', number_of_installments: 1, is_active: 'Y' }],
    approval_status: '',
    approval_status_list: [{ reseller_id: '1', approval_status: 'new' }, { reseller_id: '2', approval_status: 'new' }]
  }
}

/** An account with fixed answers that records every call. */
function fakeAccount ({ ipn: withIpn = false, testPurchases = OWN, refund = 30 } = {}) {
  const products = {
    900101: goodProduct('900101', 'credit 5 EUR', '5.00'),
    900102: goodProduct('900102', 'credit 20 EUR', '20.00'),
    900103: goodProduct('900103', 'credit 50 EUR', '50.00'),
    758179: goodProduct('758179', 'credit 5 EUR', '5.00')
  }
  for (const id of OWN) products[id].refund_policy.private.refund_days = refund
  let settings = null
  const calls = []
  const api = async (fn, params) => {
    calls.push({ fn, params })
    if (fn === 'ipnInfo') return settings ? { have_settings: 'Y', ipn_settings: settings } : { have_settings: 'N', ipn_settings: [] }
    if (fn === 'ipnSetup') { settings = { ...params }; return {} }
    if (fn === 'getProduct') return { ...products[params.product_id] }
    if (fn === 'listPurchases') {
      return {
        purchase_list: testPurchases.map((id) => ({ main_product_id: id, transaction_pay_method: 'Test', custom: '0xfeed', buyer: { email: 'x@example.org' } }))
      }
    }
    if (fn === 'updateProduct') {
      products[params.product_id].approval_status_list[0].approval_status = params['data[approval_status]']
      return {}
    }
    throw new Error(`${fn} not known to the fake account`)
  }
  if (withIpn) settings = { ...withIpn }
  return { api, calls, products, writes: () => calls.filter((c) => WRITES.has(c.fn)) }
}

export async function selftest (print = (l) => console.log(mask(l))) {
  const errors = []
  const out = []
  const log = (l) => out.push(mask(l))
  const dir = mkdtempSync(join(tmpdir(), 'ds-release-'))
  try {
    setSecret(FAKE_KEY)
    // 1. --passphrase: a new file with mode 600 and 32 hex characters; a second run keeps it.
    const file = join(dir, 'conf', 'digistore-ipn.txt')
    ensurePassphrase(file, log)
    const first = readPassphrase(file)
    if (!PASSPHRASE.test(first)) errors.push('passphrase file without 32 hex characters')
    if ((statSync(file).mode & 0o777) !== 0o600) errors.push(`passphrase file mode ${(statSync(file).mode & 0o777).toString(8)}`)
    ensurePassphrase(file, log)
    if (readPassphrase(file) !== first) errors.push('a second --passphrase changed the file')
    if (out.filter((l) => l === 'passphrase file ready').length !== 2) errors.push(`--passphrase output: ${out.join(' | ')}`)
    passphraseSecret = first

    const deps = (account, extra = {}) => ({
      api: guarded(account.api, OWN), source: () => SAMPLE, page: () => PAGE, passphrase: () => first, log, now: () => '2026-11-22T12:00:00Z',
      store: jsonStore(join(dir, 'submitted.json')), ...extra
    })

    // 2. --ipn: creates exactly one connection for our three products, then never again.
    const a = fakeAccount()
    await ipn(deps(a))
    const setups = a.calls.filter((c) => c.fn === 'ipnSetup')
    if (setups.length !== 1) errors.push(`ipnSetup ${setups.length} times`)
    const p = setups[0]?.params ?? {}
    if (p.ipn_url !== IPN.ipn_url || p.product_ids !== OWN.join(',') || p.transactions !== 'payment,refund,chargeback' ||
      p.timing !== 'before_thankyou' || p.domain_id !== 'automaton-credit' || p.sha_passphrase !== first) {
      errors.push('ipnSetup with wrong fields')
    }
    await ipn(deps(a))
    if (a.calls.filter((c) => c.fn === 'ipnSetup').length !== 1) errors.push('a second --ipn changed the connection')
    if (!out.includes(`ipn automaton-credit: exists, nothing changed`)) errors.push('second --ipn does not say it changed nothing')
    let threw = false
    try { await ipn(deps(fakeAccount(), { passphrase: () => '' })) } catch { threw = true }
    if (!threw) errors.push('--ipn without passphrase file did not stop')

    // 3. --report: the exact IPN line, approval new is a defect, nothing secret in it.
    const lines = []
    const n = await report(deps(a, { log: (l) => lines.push(mask(l)) }))
    const want = 'ipn automaton-credit: url https://automatonhost.com/pay/digistore, products 900101,900102,900103, ' +
      'events payment refund chargeback, before thankyou'
    if (!lines.includes(want)) errors.push(`report ipn line: ${lines[0]}`)
    if (n !== 1 || lines.at(-1) !== 'release report: 3 defects') errors.push(`report before submit: ${lines.at(-1)}`)
    if (lines.filter((l) => /^approval 9001\d\d: new$/.test(l)).length !== 3) errors.push('report without approval lines')
    if (lines.join('\n').match(/0xfeed|example\.org/)) errors.push('report prints a buyer field')
    const wrong = await readRelease(deps(fakeAccount({ ipn: { ...p, ipn_url: 'https://other.example/ipn', timing: 'delayed', sha_passphrase: 'other' } })))
    for (const d of ['ipn: url https://other.example/ipn', 'ipn: timing delayed', 'ipn: passphrase differs from the file on this host']) {
      if (!wrong.defects.includes(d)) errors.push(`report misses: ${d}`)
    }
    const missing = await readRelease(deps(fakeAccount()))
    if (missing.lines[0] !== 'ipn automaton-credit: missing') errors.push(`report without ipn: ${missing.lines[0]}`)

    // 4. --submit: each product once; again nothing; never with a defect of its own or of the ipn.
    await submit(deps(a))
    const ups = a.writes().filter((c) => c.fn === 'updateProduct').map((c) => c.params.product_id)
    if (ups.join() !== OWN.join()) errors.push(`submit wrote ${ups.join()}`)
    const after = []
    if (await report(deps(a, { log: (l) => after.push(l) })) !== 0 || after.at(-1) !== 'release report: 0 defects') {
      errors.push(`report after submit: ${after.at(-1)}`)
    }
    const reject = () => { for (const prod of OWN) a.products[prod].approval_status_list[0].approval_status = 'rejected' }
    const updates = () => a.writes().filter((c) => c.fn === 'updateProduct').map((c) => c.params.product_id)
    // Rejected, fields and block equal: none.
    reject()
    await submit(deps(a))
    if (updates().length !== 3) errors.push('submit sent the same state twice')
    a.products['900102'].description_en = 'changed after the rejection'
    await submit(deps(a))
    const resent = updates().slice(3)
    if (resent.join() !== '900102') errors.push(`changed state submitted: ${resent.join() || 'none'}`)
    // Rejected, fields equal, block changed: exactly one new submission of each product, then none.
    reject()
    const page = PAGE.replace('about $3 credit', 'about $4 credit')
    if (salesPageState(page) === salesPageState(PAGE)) errors.push('a change in the block card keeps the state of the page')
    await submit(deps(a, { page: () => page }))
    const block = updates().slice(4)
    if (block.join() !== OWN.join()) errors.push(`changed block card submitted: ${block.join() || 'none'}`)
    reject()
    await submit(deps(a, { page: () => page }))
    if (updates().length !== 7) errors.push('submit sent the same block card twice')
    // Without block card: none, and the log says why.
    const bare = fakeAccount({ ipn: p })
    const noBlock = []
    const html = PAGE.replace(/<section id="card"[\s\S]*?<\/section>/, '')
    if (salesPageState(html) !== null) errors.push('a page without block card has a state')
    await submit(deps(bare, { page: () => html, store: jsonStore(join(dir, 'e.json')), log: (l) => noBlock.push(l) }))
    if (bare.writes().length) errors.push('submit without block card wrote')
    if (!noBlock.some((l) => l.includes('block card'))) errors.push('submit without block card does not say why')

    const b = fakeAccount({ ipn: p, testPurchases: ['900101'], refund: 14 })
    await submit(deps(b, { store: jsonStore(join(dir, 'b.json')) }))
    if (b.writes().length) errors.push('submit with refund 14 or without test purchase wrote')
    const c = fakeAccount()
    await submit(deps(c, { store: jsonStore(join(dir, 'c.json')) }))
    if (c.writes().length) errors.push('submit without ipn wrote')
    const good = fakeAccount({ ipn: p, testPurchases: ['900101', '900102'] })
    await submit(deps(good, { store: jsonStore(join(dir, 'd.json')) }))
    const partial = good.writes().map((w) => w.params.product_id)
    if (partial.join() !== '900101,900102') errors.push(`submit without test purchase of 900103: ${partial.join()}`)

    // 5. The gate: never a protected or foreign ID, never another field or function, nothing is sent.
    const g = fakeAccount()
    const api = guarded(g.api, OWN)
    const refused = [
      ['protected product', 'updateProduct', { product_id: '758179', 'data[approval_status]': 'pending' }],
      ['protected read', 'getProduct', { product_id: '758179' }],
      ['foreign product', 'updateProduct', { product_id: '123456', 'data[approval_status]': 'pending' }],
      ['price', 'updateProduct', { product_id: '900101', 'data[approval_status]': 'pending', 'data[price]': '1' }],
      ['approval other than pending', 'updateProduct', { product_id: '900101', 'data[approval_status]': 'new' }],
      ['ipn of another project', 'ipnSetup', { ...p, domain_id: 'bautagebuch24-app' }],
      ['ipn with a protected product', 'ipnSetup', { ...p, product_ids: '900101,758179' }],
      ['refund', 'refundPurchase', { purchase_id: '1' }],
      ['voucher', 'createVoucher', { product_ids: '900101' }]
    ]
    for (const [what, fn, params] of refused) {
      let blocked = false
      try { await api(fn, params) } catch { blocked = true }
      if (!blocked) errors.push(`gate let through: ${what}`)
    }
    if (g.calls.length) errors.push(`gate sent ${g.calls.map((x) => x.fn).join(',')}`)
    let bad = false
    try { ownIds(SAMPLE.replace('900102', '758180')) } catch { bad = true }
    if (!bad) errors.push('a protected ID in CARD_PACKAGES was accepted')

    // 6. No output carries the key or the passphrase.
    const echo = classicApi(FAKE_KEY, async () => new Response(JSON.stringify({ result: 'error', message: `bad ${FAKE_KEY} ${first}` })))
    try { await echo('ipnInfo', {}) } catch (e) { log(e.message) }
    const all = [...out, ...lines, ...after].join('\n')
    if (all.includes(FAKE_KEY) || all.includes(first)) errors.push('an output carries the key or the passphrase')
    if (!out.some((l) => l.includes('***'))) errors.push('nothing was masked')
  } finally {
    rmSync(dir, { recursive: true, force: true })
    setSecret('')
    passphraseSecret = ''
  }
  for (const e of errors) print(`FAIL ${e}`)
  print(errors.length ? `SELFTEST FAILED (${errors.length})` : 'SELFTEST OK')
  return errors.length ? 1 : 0
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main (argv) {
  const say = (l) => console.log(mask(l))
  if (argv.length !== 1 || !FLAGS.includes(argv[0])) {
    say(`usage: node ops/digistore-release.mjs ${FLAGS.map((f) => `'${f}'`).join(' | ')}`)
    return 1
  }
  const flag = argv[0]
  if (flag === '--selftest') return selftest()
  if (flag === '--passphrase') return ensurePassphrase(PASSPHRASE_FILE, say)
  const source = () => readFileSync(SOURCE, 'utf8')
  const own = ownIds(source())
  const passphrase = () => {
    const p = readPassphrase(PASSPHRASE_FILE)
    if (p) passphraseSecret = p
    return p
  }
  const deps = {
    api: guarded(classicApi(readKey()), own), source, page: () => readFileSync(PAGE_FILE, 'utf8'), passphrase, log: say,
    now: () => new Date().toISOString(), store: jsonStore(SUBMITTED_FILE)
  }
  if (flag === '--ipn') return ipn(deps)
  if (flag === '--submit') return submit(deps)
  return report(deps)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code }, (e) => {
    console.error(mask(`error: ${e.message}`))
    process.exitCode = 2
  })
}
