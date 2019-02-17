import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { notNull } from '@codewitchbella/ts-utils'

type DirType = 'source' | 'build'
type MigrationFile = { path: string; type: DirType; name: string }

async function fileList(
  directories: { path: string; type: DirType }[],
): Promise<MigrationFile[]> {
  const dirs = await Promise.all(
    directories.map(async dir => ({
      fnames: await promisify(fs.readdir)(dir.path),
      dir: dir.path,
      type: dir.type,
    })),
  )
  return dirs
    .map(d =>
      d.fnames.map(f => ({
        path: path.join(d.dir, f),
        type: d.type,
        name: f,
      })),
    )
    .reduce((a, b) => a.concat(b))
}

function parsePgsql(text: string) {
  const descriptionR = /-- description: ([^\n]*)\n/.exec(text)
  const description = descriptionR ? descriptionR[1] : '<not specified>'

  const upIndex = text.indexOf('-- up')
  const downIndex = text.indexOf('-- down')
  if (upIndex < 0) {
    throw new Error('Up section not found')
  }
  if (downIndex < 0) {
    throw new Error('Down section not found')
  }
  if (upIndex > downIndex) {
    throw new Error('Up section must be before down section')
  }

  const up = text.substring(upIndex, downIndex)
  const down = text.substring(downIndex)
  return { up, down, description }
}

async function readMigration(
  file: MigrationFile,
  list: MigrationFile[],
): Promise<{
  name: string
  up: string
  down: string
  description: string
} | null> {
  if (/\.pgsql$/.exec(file.path)) {
    // read pgsql files only from source
    // otherwise there would be risk to read them twice
    if (file.type === 'build') return null

    const text = await promisify(fs.readFile)(file.path, 'utf-8')
    return { ...parsePgsql(text), name: file.name }
  }

  if (/\.ts$/.exec(file.path) || /\.js\.map$/.exec(file.path)) {
    // ignore those - we pick up built .js files
    return null
  }
  if (/\.js$/.exec(file.path)) {
    // skip built .js files for which we cannot find source file
    if (file.type === 'build') {
      const src = file.name.replace(/\.js$/, '.ts')
      if (!list.some(f => f.type === 'source' && f.name === src)) {
        return null
      }
    }
    const mod = require(file.path)
    const mig = 'default' in mod ? mod.default : mod
    return {
      description: '<no description>',
      ...mig,
      name: file.name,
    }
  }
  throw new Error(`Unknown migration file type on file "${file.path}"`)
}

async function readAll(directories: { path: string; type: DirType }[]) {
  const files = await fileList(directories)

  const migrations = await Promise.all(files.map(f => readMigration(f, files)))
  return migrations.filter(notNull)
}
export default readAll
