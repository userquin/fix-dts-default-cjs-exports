import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from 'pathe'

let cleanup = false

const folders = ['mixed-declarations', 'reexport-default', 'reexport-types']

export default async function () {
  if (cleanup) {
    throw new Error('cleanup called twice')
  }
  cleanup = true
  const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    './fixtures',
  )
  // eslint-disable-next-line no-console
  console.log('Cleaning up dist folders at', root)
  await Promise.all(folders.map((folder) => {
    const dist = resolve(root, folder, 'dist')
    return rm(dist, { recursive: true, force: true })
  }))
}
