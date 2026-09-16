/**
 * Generates app icons from the brand SVG using sharp.
 * resources/icon.png is canonical (window icon + packaging).
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const resDir = join(__dirname, '../resources')

async function main() {
  const svg = readFileSync(join(resDir, 'icon.svg'))

  await sharp(svg).resize(512, 512).png().toFile(join(resDir, 'icon.png'))
  console.log('[icon] wrote icon.png 512')

  for (const s of [16, 24, 32, 48, 64, 128, 256]) {
    await sharp(svg).resize(s, s).png().toFile(join(resDir, `icon-${s}.png`))
  }
  console.log('[icon] wrote sized pngs')

  console.log('[icon] done')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
