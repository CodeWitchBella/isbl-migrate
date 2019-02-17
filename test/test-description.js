const mig = require('../dist/index').migration(t => {
  t.description('Hello world')
  t.createTable('user_table', c => [c('name').type('text')])
  t.createTable('user_email', c => [
    c('value').type('text'),
    c('user').references('user_table'),
  ])
  t.alterTable('user_email').addColumn(c => c('normalized').type('text'))
})

console.log('-- description: ' + mig.description)
console.log('-- up\n')
console.log(mig.up)
console.log('\n-- down\n')
console.log(mig.down)
console.log()
