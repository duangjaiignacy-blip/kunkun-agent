import assert from 'node:assert/strict'
import fs from 'node:fs'

const copy = fs.readFileSync(new URL('../src/data/copy.js', import.meta.url), 'utf8')
const lizardBlock = copy.match(/lizard:\s*\{[\s\S]*?\n  \},\n\}/)?.[0] || ''

assert.match(lizardBlock, /idle:\s*'b-hero'/, 'Lumo idle pose should use a full-body asset, not the edge-cropped b-orb pose')
assert.doesNotMatch(lizardBlock, /idle:\s*'b-orb'/, 'b-orb has the tail cropped at the source image edge')

console.log('lumo layout tests passed')
