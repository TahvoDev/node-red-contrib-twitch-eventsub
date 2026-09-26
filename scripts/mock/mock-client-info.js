// Prints the mock client's id and secret as shell assignments.
// The Twitch CLI keeps the generated mock credentials in its event cache, so
// tools and health checks need to read them from there.
//
//   eval "$(node mock-client-info.sh)"   ->   MOCK_CLIENT_ID=... MOCK_CLIENT_SECRET=...
const { DatabaseSync } = require('node:sqlite')

const dbPath = process.argv[2]
if (!dbPath) {
    console.error('usage: mock-client-info.js <path to eventCache.db>')
    process.exit(2)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const row = db.prepare('select id, secret from clients limit 1').get()
db.close()

if (!row || !row.id) {
    console.error('no mock client found')
    process.exit(1)
}

console.log(`MOCK_CLIENT_ID=${row.id}`)
console.log(`MOCK_CLIENT_SECRET=${row.secret ?? ''}`)
