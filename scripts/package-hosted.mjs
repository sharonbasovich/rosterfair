import { copyFile, writeFile } from 'node:fs/promises'

// Retain notices alongside the compiled static distribution.
for (const name of ['LICENSE', 'THIRD-PARTY.md', 'THIRD_PARTY_NOTICES.txt']) {
  await copyFile(name, `hosted-site/rosterfair/${name}`)
}
await writeFile('hosted-site/rosterfair/.nojekyll', '')
