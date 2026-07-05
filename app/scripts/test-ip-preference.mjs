import assert from 'node:assert/strict'
import {
  IP_STORAGE_KEY,
  getPreferredIpKey,
  normalizeIpKey,
  writePreferredIpKey,
} from '../src/lib/ipPreference.js'

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
  }
}

assert.equal(normalizeIpKey('tiger'), 'tiger')
assert.equal(normalizeIpKey('lizard'), 'lizard')
assert.equal(normalizeIpKey('unknown'), 'tiger')
assert.equal(normalizeIpKey(null), 'tiger')

assert.equal(getPreferredIpKey(fakeStorage()), 'tiger')
assert.equal(getPreferredIpKey(fakeStorage({ [IP_STORAGE_KEY]: 'lizard' })), 'lizard')
assert.equal(getPreferredIpKey(fakeStorage({ [IP_STORAGE_KEY]: 'bad-value' })), 'tiger')

const storage = fakeStorage()
assert.equal(writePreferredIpKey('lizard', storage), 'lizard')
assert.equal(storage.getItem(IP_STORAGE_KEY), 'lizard')
assert.equal(writePreferredIpKey('not-real', storage), 'tiger')
assert.equal(storage.getItem(IP_STORAGE_KEY), 'tiger')

console.log('ipPreference tests passed')
