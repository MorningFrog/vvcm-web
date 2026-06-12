import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const host = process.env.VITE_SCREENSHOT_HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.VITE_SCREENSHOT_PORT ?? '5174', 10)
const strictPort = process.env.VITE_SCREENSHOT_STRICT_PORT === 'true'
const outputDir = path.resolve(root, process.env.VITE_SCREENSHOT_DIR ?? 'artifacts/screenshots')
const route = process.env.VITE_SCREENSHOT_PATH ?? '/'

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]

let server
let browser

try {
  browser = await chromium.launch()

  server = await createServer({
    root,
    logLevel: 'warn',
    server: {
      host,
      port,
      strictPort,
    },
  })

  await server.listen()
  await mkdir(outputDir, { recursive: true })

  const baseUrl = server.resolvedUrls?.local?.[0] ?? `http://${host}:${port}/`
  const url = new URL(route, baseUrl).toString()

  console.log(`[screenshot] Vite ready at ${url}`)

  for (const viewport of viewports) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
    })

    const pageErrors = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    const response = await page.goto(url, { waitUntil: 'networkidle' })
    if (!response?.ok()) {
      throw new Error(`Page request failed with status ${response?.status() ?? 'unknown'}`)
    }

    await page.waitForSelector('.app-shell', { state: 'visible' })
    await page.waitForSelector('.coordinate-canvas', { state: 'visible' })
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForTimeout(500)

    if (pageErrors.length > 0) {
      throw new Error(`Page error while rendering ${viewport.name}: ${pageErrors.join('; ')}`)
    }

    const screenshotPath = path.join(outputDir, `vite-${viewport.name}.png`)
    await page.screenshot({ path: screenshotPath })
    await page.close()

    console.log(`[screenshot] ${viewport.name} ${viewport.width}x${viewport.height} -> ${path.relative(root, screenshotPath)}`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[screenshot] ${message}`)

  if (message.includes("Executable doesn't exist") || message.includes('browserType.launch')) {
    console.error('[screenshot] Run `npm run screenshot:install` once to install the managed Chromium browser.')
  }

  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
}
