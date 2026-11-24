import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesDirectory = dirname(fileURLToPath(import.meta.url))

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : []
    }),
  )
  return files.flat()
}

describe('CSS-Design-Tokens', () => {
  it('referenziert nur definierte CSS-Variablen', async () => {
    const files = await cssFiles(stylesDirectory)
    const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')))
    const declared = new Set(
      contents
        .join('\n')
        .matchAll(/^\s*(--[\w-]+)\s*:/gm)
        .map((match) => match[1]),
    )
    const used = new Set(
      contents
        .join('\n')
        .matchAll(/var\(\s*(--[\w-]+)/g)
        .map((match) => match[1]),
    )
    expect([...used].filter((variable) => !declared.has(variable))).toEqual([])
  })
})
