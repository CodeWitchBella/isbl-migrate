import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { notNull } from '@codewitchbella/ts-utils'

async function readMigration({ fname, dir }: { fname: string; dir: string }) {
  if (/\.pgsql$/.exec(fname)) {
    const text = await promisify(fs.readFile)(path.join(dir, fname), 'utf-8')

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
    return { up, down, description, name: fname }
  }
  if (/\.ts$/.exec(fname) || /\.js\.map$/.exec(fname)) {
    // ignore those - we pick up built .js files
    return null
  }
  if (/\.js$/.exec(fname)) {
    return {
      description: '<no description>',
      ...require(path.join(dir, fname)),
      name: fname,
    }
  }
  throw new Error(`Unknown migration file type on file "${fname}"`)
}

async function readDir(dir: string) {
  return (await promisify(fs.readdir)(dir)).map(fname => ({
    fname,
    dir,
  }))
}

async function readAll(directories: string[]) {
  const lists = await Promise.all(directories.map(readDir))
  const list = lists.reduce((a, b) => a.concat(b))

  const migrations = await Promise.all(list.sort().map(f => readMigration(f)))
  return migrations.filter(notNull)
}
export default readAll
