/**
 * End-to-end smoke test for dsh-boot-splash.
 *
 * Loads the built host half, drives its `webserver/index-inject` listener to
 * collect the rows the host renders into the boot HTML, then renders that HTML
 * in jsdom with `runScripts: 'dangerously'` so the injected handover script
 * really executes. Every assertion is about the bytes that reach the browser.
 *
 *   node tests/verify.mjs        (needs jsdom: npm install)
 */
import { JSDOM } from 'jsdom'

const ROOT_ATTR = 'data-dsh-boot-splash'
const EXIT_ATTR = 'data-dsh-splash-exiting'
const HOST = new URL('../lib/index.js', import.meta.url).href

const { apply } = await import(HOST)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let failures = 0
let checks = 0
function check(label, condition) {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${label}`)
}

/** Stand-in for the Cordis context: records listeners and replays one event. */
function collectRows(config) {
  const listeners = new Map()
  const ctx = {
    on(event, handler) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
    }
  }
  apply(ctx, config)
  const table = []
  for (const handler of listeners.get('webserver/index-inject') ?? []) handler(table)
  return table
}

/** Render exactly what the host renders for one index response. */
function renderPage(rows, { lang = 'zh-CN' } = {}) {
  const text = (kind) => rows.filter((row) => row.kind === kind).map((row) => row.text ?? row.html).join('\n')
  const dom = new JSDOM(
    `<!doctype html><html lang="${lang}"><head><title>DSH</title><style>${text('style')}</style></head><body>${
      text('html')
    }<script>${text('script')}</script><div id="root"><div data-dsh-boot><div data-dsh-boot-spinner></div></div></div></body></html>`,
    { url: 'http://127.0.0.1:19387/', runScripts: 'dangerously', pretendToBeVisual: true }
  )
  return { dom, window: dom.window, doc: dom.window.document }
}

const overlay = (doc) => doc.querySelector(`[${ROOT_ATTR}]`)

// --- 1. the rows the host receives -----------------------------------------
console.log('\n1. injected rows')
{
  const rows = collectRows(undefined)
  const kinds = rows.map((row) => `${row.kind}${row.placement === undefined ? '' : `/${row.placement}`}`)
  check('three rows: head style, body html, body script', kinds.join(', ') === 'style, html/body, script/body')
  const style = rows.find((row) => row.kind === 'style').text
  const html = rows.find((row) => row.kind === 'html').html
  const script = rows.find((row) => row.kind === 'script').text
  check('style carries the opening sequence', style.includes('dshs-settle') && style.includes('dshs-beam'))
  check('style carries the CSS failsafe', /animation: dshs-failsafe 10500ms linear forwards/.test(style))
  check('style pins the layer above host chrome', /z-index: 100000/.test(style))
  check('style never closes its own element', !style.includes('</style'))
  check('html carries the inlined artwork', html.includes('src="data:image/jpeg;base64,'))
  check('html carries the wordmark and phases', html.includes('DEEPSEEK HARNESS') && html.includes('初始化内核'))
  check('script never closes its own element', !script.includes('</script'))
  check('script watches the frontend boot card', script.includes('[data-dsh-boot]'))
}

// --- 2. config: off, and escaping ------------------------------------------
console.log('\n2. config')
{
  check('enabled: false contributes nothing', collectRows({ enabled: false }).length === 0)

  const rows = collectRows({ wordmark: '<img src=x onerror=1>', minShowMs: 1000, maxShowMs: 2000 })
  const html = rows.find((row) => row.kind === 'html').html
  check('a configured wordmark is HTML-escaped', html.includes('&lt;img src=x onerror=1&gt;') && !html.includes('<img src=x'))
  const style = rows.find((row) => row.kind === 'style').text
  check('a configured cap moves the failsafe with it', style.includes('dshs-failsafe 3500ms'))
  check('a configured minShow drives the idle bar', style.includes('dshs-fill-idle 1000ms'))
}

// --- 3. first paint: the layer exists before any application code runs -----
console.log('\n3. first paint')
{
  const { doc } = renderPage(collectRows({ minShowMs: 400, maxShowMs: 4000 }))
  check('overlay is in the document', overlay(doc) !== null)
  check('it is outside #root (hydration cannot see it)', doc.querySelector('#root > [data-dsh-boot-splash]') === null)
  check('artwork is the inlined data URI', (doc.querySelector('.dshs-art')?.getAttribute('src') ?? '').startsWith('data:image/jpeg;base64,'))
  check('three phase lines are staged', doc.querySelectorAll('.dshs-phase > span').length === 3)
  check('the skip hint is present', doc.querySelector('.dshs-skip') !== null)
  check('percentage starts empty so it never reads as a stuck 0%', doc.querySelector('.dshs-pct').textContent === '')
  await delay(200)
  check('percentage is driven once the script runs', /%$/.test(doc.querySelector('.dshs-pct').textContent))
}

// --- 4. handover: the frontend boot card leaving releases the layer --------
console.log('\n4. handover when the application mounts')
{
  const { doc } = renderPage(collectRows({ minShowMs: 400, maxShowMs: 5000 }))
  check('still held while the boot card is up', overlay(doc) !== null)

  const appRoot = doc.getElementById('root')
  doc.querySelector('[data-dsh-boot]').remove()
  appRoot.append(doc.createElement('main'))

  await delay(700)
  check('exit state applied on the mount signal', overlay(doc)?.hasAttribute(EXIT_ATTR) ?? false)
  check('progress released to 100%', doc.querySelector('.dshs-pct')?.textContent === '100%')
  check('the last phase reads ready', doc.querySelector('.dshs-phase > span:last-child .dshs-lang-zh')?.textContent === '就绪')

  await delay(800)
  check('overlay removed once the fade ends', overlay(doc) === null)
}

// --- 5. skip ---------------------------------------------------------------
console.log('\n5. skip')
{
  const { window, doc } = renderPage(collectRows({ minShowMs: 4000, maxShowMs: 9000 }))
  await delay(150)
  overlay(doc).dispatchEvent(new window.Event('pointerdown', { bubbles: true }))
  check('exit state applied immediately', overlay(doc)?.hasAttribute(EXIT_ATTR) ?? false)
  await delay(900)
  check('overlay removed', overlay(doc) === null)
}

// --- 6. the cap: no readiness signal, the layer still leaves ---------------
console.log('\n6. hard cap without a readiness signal')
{
  const { doc } = renderPage(collectRows({ minShowMs: 300, maxShowMs: 700 }))
  await delay(200)
  check('held at 200ms', overlay(doc) !== null)
  await delay(1400)
  check('gone by 1.6s on the cap alone', overlay(doc) === null)
}

// --- 7. language ----------------------------------------------------------
console.log('\n7. language')
{
  const zh = renderPage(collectRows({ minShowMs: 300, maxShowMs: 900 }), { lang: 'zh-CN' })
  check('a Chinese host keeps the markup default', zh.doc.documentElement.getAttribute('data-dsh-splash-lang') === null)
  const en = renderPage(collectRows({ minShowMs: 300, maxShowMs: 900 }), { lang: 'en-US' })
  check('an English host switches the language', en.doc.documentElement.getAttribute('data-dsh-splash-lang') === 'en')
}

console.log(`\n${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
