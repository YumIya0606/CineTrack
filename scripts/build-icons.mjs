/**
 * Generates app icons from the brand SVG using sharp.
 * resources/icon.png is canonical (window icon + packaging).
 * resources/icon.ico is the multi-size Windows icon used by the packaged exe.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const resDir = join(__dirname, '../resources')

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Assembles a Windows .ico from PNG-encoded entries (supported on Vista+),
 * which lets sharp do the rasterizing instead of a dedicated ico encoder.
 */
function buildIco(pngs) {
  const header = 6
  const entries = 16 * pngs.length
  const dir = Buffer.alloc(header)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: icon
  dir.writeUInt16LE(pngs.length, 4)

  let offset = header + entries
  const parts = [dir]
  const entry = Buffer.alloc(16)
  pngs.forEach((png, i) => {
    const size = ICO_SIZES[i]
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // color count
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit depth
    entry.writeUInt32LE(png.length, 8) // payload size
    entry.writeUInt32LE(offset, 12) // payload offset
    parts.push(Buffer.from(entry))
    offset += png.length
  })
  parts.push(...pngs)
  return Buffer.concat(parts)
}

async function main() {
  const svg = readFileSync(join(resDir, 'icon.svg'))

  await sharp(svg).resize(512, 512).png().toFile(join(resDir, 'icon.png'))
  console.log('[icon] wrote icon.png 512')

  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    await sharp(svg).resize(s, s).png().toFile(join(resDir, `icon-${s}.png`))
  }
  console.log('[icon] wrote sized pngs')

  const pngs = await Promise.all(
    ICO_SIZES.map(s => sharp(svg).resize(s, s).png().toBuffer())
  )
  writeFileSync(join(resDir, 'icon.ico'), buildIco(pngs))
  console.log('[icon] wrote icon.ico', ICO_SIZES.join('/'))

  console.log('[icon] done')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
