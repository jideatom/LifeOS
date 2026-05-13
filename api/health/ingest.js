import { sendJson, setCors, upsertDailyMetrics } from '../fitbit/_shared.js'

function expectedPhoneSyncKey() {
  return String(process.env.LIFEOS_PHONE_SYNC_KEY || '').trim()
}

function normalizeNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function normalizePayload(payload) {
  return {
    date: typeof payload.date === 'string' && payload.date ? payload.date : todayIso(),
    source:
      typeof payload.source === 'string' && payload.source
        ? payload.source
        : 'Phone Health Sync',
    sync_status: 'Imported',
    sleep_hours: normalizeNumber(payload.sleep_hours),
    sleep_score: normalizeNumber(payload.sleep_score),
    resting_heart_rate: normalizeNumber(payload.resting_heart_rate),
    steps: normalizeNumber(payload.steps),
    active_zone_minutes: normalizeNumber(payload.active_zone_minutes),
    calories_burned: normalizeNumber(payload.calories_burned),
    distance_km: normalizeNumber(payload.distance_km),
    workout_minutes: normalizeNumber(payload.workout_minutes),
    weight_kg: normalizeNumber(payload.weight_kg),
    synced_at: new Date().toISOString(),
  }
}

export default async function handler(request, response) {
  setCors(request, response)

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  try {
    const configuredKey = expectedPhoneSyncKey()
    if (!configuredKey) {
      throw new Error('LIFEOS_PHONE_SYNC_KEY is not configured')
    }

    const receivedKey = String(request.headers['x-lifeos-phone-sync-key'] || '').trim()
    if (!receivedKey || receivedKey !== configuredKey) {
      sendJson(response, 401, { error: 'Phone sync key is invalid' })
      return
    }

    const body =
      typeof request.body === 'string'
        ? JSON.parse(request.body || '{}')
        : request.body && typeof request.body === 'object'
          ? request.body
          : {}

    const row = normalizePayload(body)
    await upsertDailyMetrics(row)

    sendJson(response, 200, {
      ok: true,
      message: 'Phone health metrics stored',
      metrics: row,
    })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Phone health ingest failed',
    })
  }
}
