/**
 * Inline the opening artwork into the host half.
 *
 * `src/index.js` carries the literal `'__BOOT_IMAGE__'` where the artwork
 * belongs; this script replaces it with a data URI, so the row the host injects
 * into the boot HTML depends on no route, no static file, and no second
 * request. Plain Node, no dependencies: `node scripts/build.mjs`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = "'__BOOT_IMAGE__'"

const image = await readFile(join(root, 'assets', 'boot-splash.jpg'))
const dataUri = `data:image/jpeg;base64,${image.toString('base64')}`

const template = await readFile(join(root, 'src', 'index.js'), 'utf8')
if (!template.includes(PLACEHOLDER)) {
  throw new Error(`build: src/index.js does not contain the ${PLACEHOLDER} placeholder`)
}
const host = template.replace(PLACEHOLDER, JSON.stringify(dataUri))

await mkdir(join(root, 'lib'), { recursive: true })
await writeFile(join(root, 'lib', 'index.js'), host)

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
console.log(`build: assets/boot-splash.jpg ${kib(image.length)} -> lib/index.js ${kib(Buffer.byteLength(host))}`)
