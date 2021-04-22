import readAll from './read'
import { Knex } from 'knex'

async function getMigration(knex: Knex) {
  try {
    const data = await knex('migration').select()
    return data[0].data.list as any[]
  } catch (e) {
    if (e.code === '42P01') {
      await knex.raw('CREATE TABLE migration ( data jsonb );')
      await knex('migration').insert({ data: { list: [] } })
      return []
    }

    throw e
  }
}

type DbMigration = {
  name: string
  up: string
  down: string
  description: string
}

function parseName({ name }: { name: string }): [number, string] {
  const regex = /[^0-9]/
  return [
    Number.parseInt(name.split(/[^0-9]/)[0], 10),
    name.replace(/^[0-9]*/, ''),
  ]
}

function compareNames(a: { name: string }, b: { name: string }) {
  const [idA, restA] = parseName(a)
  const [idB, restB] = parseName(b)
  const diff = idA - idB
  if (diff !== 0) return diff
  return restA.localeCompare(restB)
}

function migrationToDB(mig: any) {
  return {
    name: mig.name,
    down: mig.down,
    up: mig.up.toString(),
    description: mig.description,
  }
}

function save(data: any, knex: Knex) {
  return knex('migration').update({ data: { list: data } })
}

async function handleAlreadyRun({
  data,
  migration,
  development,
  knex,
  last,
}: {
  data: DbMigration[]
  migration: any
  development: boolean
  knex: Knex
  last: boolean
}) {
  const prevIdx = data.findIndex((mig) => mig.name === migration.name)
  if (prevIdx >= 0) {
    let prev = data[prevIdx]
    // only test the last migration because codegen could easily change and if
    // it does then we dont want to trigger massive failing down/up cycles
    if (last) {
      if (prev.up !== migration.up.toString()) {
        if (development) {
          await knex.transaction(async (trx) => {
            console.log(`Migration ${migration.name} up changed`)
            console.log('Running down migration and following it with up again')
            console.log('Running down from database')
            await trx.raw(prev.down).catch(() => {
              console.log('Down from database failed. Running down from disc')
              return trx.raw(migration.down)
            })

            console.log('Running up')
            await trx.raw(migration.up)

            prev = migrationToDB(migration)
            // eslint-disable-next-line no-param-reassign
            data[prevIdx] = prev
            await save(data, knex)
          })
        } else {
          throw new Error(
            'Up migration changed! This is bad in non-development env',
          )
        }
      }
      if (
        prev.down !== migration.down ||
        prev.description !== migration.description
      ) {
        // eslint-disable-next-line no-param-reassign
        data[prevIdx] = migrationToDB(migration)
        await save(data, knex)
      }
    }
    return true
  }
  return false
}

export async function migrate({
  directories,
  knex,
  development,
}: {
  directories: (string | { path: string; type: 'source' | 'build' })[]
  knex: Knex
  development: boolean
}) {
  const migrations = await readAll(
    directories.map((d) =>
      typeof d === 'string' ? { path: d, type: 'source' as 'source' } : d,
    ),
  )

  let data = await getMigration(knex)
  let alreadyRun = 0

  function printRun() {
    if (alreadyRun > 0) {
      console.log(
        `${alreadyRun} migration${alreadyRun > 1 ? 's' : ''} were already run`,
      )
      alreadyRun = 0
    }
  }

  // check for missing migrations
  migrations.sort(compareNames).reverse()
  for (const remoteMigration of data) {
    if (!migrations.some((m) => m.name === remoteMigration.name)) {
      console.log(`Migration ${remoteMigration.name} does not exist locally`)
      if (development && 'down' in remoteMigration) {
        console.log('We are in development. Running down migration')
        await knex.raw(remoteMigration.down)
        data = data.filter((d) => d !== remoteMigration)
        await save(data, knex)
      }
    }
  }

  // run migrations which were not run yet
  migrations.reverse()
  let i = 0
  for (const migration of migrations) {
    i += 1
    if (
      await handleAlreadyRun({
        data,
        migration,
        knex,
        development,
        last: i === migrations.length,
      })
    ) {
      alreadyRun += 1
      continue
    }
    printRun()

    const print = `${migration.name}: "${migration.description}"`
    console.log(`Running migration ${print}`)
    if (typeof migration.up === 'string') {
      await knex.raw(migration.up).catch((e) => {
        console.log(migration.up)
        throw e
      })
    } else {
      throw new Error('Migration.up must be string')
    }
    data.push(migrationToDB(migration))
    await save(data, knex)
  }
  printRun()
}
