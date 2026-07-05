export const IP_STORAGE_KEY = 'kunkun-ip-key'
export const DEFAULT_IP_KEY = 'tiger'
const VALID_IP_KEYS = new Set(['tiger', 'lizard'])

export function normalizeIpKey(value) {
  return VALID_IP_KEYS.has(value) ? value : DEFAULT_IP_KEY
}

const defaultStorage = () => {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

export function getPreferredIpKey(storage = defaultStorage()) {
  try {
    return normalizeIpKey(storage?.getItem(IP_STORAGE_KEY))
  } catch {
    return DEFAULT_IP_KEY
  }
}

export function writePreferredIpKey(value, storage = defaultStorage()) {
  const normalized = normalizeIpKey(value)
  try {
    storage?.setItem(IP_STORAGE_KEY, normalized)
  } catch {
    /* localStorage can fail in restricted browser contexts. */
  }
  return normalized
}

export async function setPreferredIpKey(value) {
  const normalized = writePreferredIpKey(value)
  const { busEmit } = await import('./bus.js')
  await busEmit({ ip: normalized })
  return normalized
}

export async function listenPreferredIp(handler) {
  const { busListen } = await import('./bus.js')
  const offBus = await busListen((payload) => {
    if (payload && payload.ip) handler(normalizeIpKey(payload.ip))
  })

  const onStorage = (event) => {
    if (event.key === IP_STORAGE_KEY) handler(normalizeIpKey(event.newValue))
  }
  window.addEventListener('storage', onStorage)

  return () => {
    offBus && offBus()
    window.removeEventListener('storage', onStorage)
  }
}
