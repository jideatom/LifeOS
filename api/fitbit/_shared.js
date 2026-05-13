import { createClient } from '@supabase/supabase-js'

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'https://misimisys.github.io',
  'https://jideatom.github.io',
]

const DEFAULT_LIFEOS_WEB_URL = 'https://misimisys.github.io/LifeOS/'
const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
].join(' ')

function requiredEnv(name) {
  const value = process.env[name]
  const normalized = typeof value === 'string' ? value.trim() : value
  if (!normalized) {
    throw new Error(`${name} is not configured`)
  }
  return normalized
}

function googleClientId() {
  return (process.env.GOOGLE_HEALTH_CLIENT_ID || process.env.FITBIT_CLIENT_ID || '').trim() || requiredEnv('FITBIT_CLIENT_ID')
}

function googleClientSecret() {
  return (process.env.GOOGLE_HEALTH_CLIENT_SECRET || process.env.FITBIT_CLIENT_SECRET || '').trim() || requiredEnv('FITBIT_CLIENT_SECRET')
}

export function healthRedirectUri() {
  return (process.env.GOOGLE_HEALTH_REDIRECT_URI || process.env.FITBIT_REDIRECT_URI || '').trim() || requiredEnv('FITBIT_REDIRECT_URI')
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim() || requiredEnv('VITE_SUPABASE_URL')
}

function supabaseServiceRoleKey() {
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
}

export function webAppUrl() {
  return process.env.LIFEOS_WEB_APP_URL || DEFAULT_LIFEOS_WEB_URL
}

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function allowedOrigins() {
  const configured = process.env.LIFEOS_ALLOWED_ORIGIN
  if (!configured) return DEFAULT_ALLOWED_ORIGINS

  return [...new Set([
    ...configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...DEFAULT_ALLOWED_ORIGINS,
  ])]
}

export function isAllowedOrigin(origin) {
  if (!origin) return true
  return allowedOrigins().includes(origin)
}

export function setCors(request, response) {
  const requestOrigin = request.headers.origin
  const allowed = allowedOrigins()
  const responseOrigin =
    requestOrigin && allowed.includes(requestOrigin)
      ? requestOrigin
      : allowed[0] || '*'

  response.setHeader('Access-Control-Allow-Origin', responseOrigin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function parseCookies(request) {
  return String(request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) return cookies
      const key = part.slice(0, separatorIndex)
      const value = decodeURIComponent(part.slice(separatorIndex + 1))
      cookies[key] = value
      return cookies
    }, {})
}

export function authRedirectUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: googleClientId(),
    redirect_uri: healthRedirectUri(),
    scope: GOOGLE_HEALTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function supabaseAdmin() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export { supabaseAdmin }

export async function exchangeAuthorizationCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: 'authorization_code',
      redirect_uri: healthRedirectUri(),
      code,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google Health token exchange failed')
  }
  return payload
}

export async function refreshHealthToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Google Health token refresh failed')
  }
  return payload
}

export async function getStoredHealthToken() {
  const admin = supabaseAdmin()
  const { data, error } = await admin.from('fitbit_tokens').select('*').eq('id', 'primary').maybeSingle()
  if (error) throw error
  return data
}

export async function storeHealthToken(payload) {
  const admin = supabaseAdmin()
  const expiresAt = new Date(Date.now() + Number(payload.expires_in || 0) * 1000).toISOString()
  const row = {
    id: 'primary',
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: expiresAt,
    scope: payload.scope || GOOGLE_HEALTH_SCOPES,
    fitbit_user_id: payload.id_token || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from('fitbit_tokens').upsert(row, { onConflict: 'id' })
  if (error) throw error
  return row
}

export async function getValidHealthAccessToken() {
  const stored = await getStoredHealthToken()
  if (!stored?.refresh_token) {
    throw new Error('Google Health is not connected yet')
  }

  const expiresAtMs = stored.expires_at ? new Date(stored.expires_at).getTime() : 0
  const shouldRefresh = !stored.access_token || !expiresAtMs || expiresAtMs - Date.now() < 5 * 60 * 1000

  if (!shouldRefresh) {
    return stored.access_token
  }

  const refreshed = await refreshHealthToken(stored.refresh_token)
  const saved = await storeHealthToken({
    ...stored,
    ...refreshed,
    refresh_token: refreshed.refresh_token || stored.refresh_token,
  })
  return saved.access_token
}

async function googleFitRequest(path, accessToken, init = {}) {
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google Health request failed: ${response.status}`)
  }
  return payload
}

function dayWindow() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return {
    start,
    end,
    startNs: String(start.getTime() * 1_000_000),
    endNs: String(end.getTime() * 1_000_000),
  }
}

function aggregateNumberValue(bucket, dataTypeName) {
  const dataset = (bucket?.dataset || []).find((entry) => entry.dataSourceId?.includes(dataTypeName))
  const point = dataset?.point?.[0]
  const value = point?.value?.[0]
  if (!value) return null
  if (typeof value.intVal === 'number') return value.intVal
  if (typeof value.fpVal === 'number') return value.fpVal
  return null
}

async function aggregateMetric(accessToken, dataTypeName) {
  const { startNs, endNs } = dayWindow()
  const payload = await googleFitRequest('/fitness/v1/users/me/dataset:aggregate', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      aggregateBy: [{ dataTypeName }],
      bucketByTime: { durationMillis: 86_400_000 },
      startTimeMillis: Number(startNs) / 1_000_000,
      endTimeMillis: Number(endNs) / 1_000_000,
    }),
  })

  const bucket = payload.bucket?.[0]
  return aggregateNumberValue(bucket, dataTypeName)
}

async function fetchSleepHours(accessToken) {
  const { startNs, endNs } = dayWindow()
  const payload = await googleFitRequest(
    `/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(
      new Date(Number(startNs) / 1_000_000).toISOString(),
    )}&endTime=${encodeURIComponent(new Date(Number(endNs) / 1_000_000).toISOString())}&activityType=72`,
    accessToken,
  )

  const sessions = Array.isArray(payload.session) ? payload.session : []
  const totalMs = sessions.reduce((sum, session) => {
    const startMs = Number(session.startTimeMillis || 0)
    const endMs = Number(session.endTimeMillis || 0)
    if (!startMs || !endMs || endMs <= startMs) return sum
    return sum + (endMs - startMs)
  }, 0)

  return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null
}

export async function fetchTodayHealthMetrics() {
  const accessToken = await getValidHealthAccessToken()
  const [steps, calories, heartRate, weightKg, sleepHours] = await Promise.all([
    aggregateMetric(accessToken, 'com.google.step_count.delta'),
    aggregateMetric(accessToken, 'com.google.calories.expended').catch(() => null),
    aggregateMetric(accessToken, 'com.google.heart_rate.bpm').catch(() => null),
    aggregateMetric(accessToken, 'com.google.weight').catch(() => null),
    fetchSleepHours(accessToken).catch(() => null),
  ])

  const today = new Date().toISOString().slice(0, 10)

  return {
    date: today,
    source: 'Google Health',
    sync_status: 'Imported',
    sleep_hours: sleepHours,
    sleep_score: null,
    resting_heart_rate: heartRate,
    steps: typeof steps === 'number' ? Math.round(steps) : null,
    active_zone_minutes: null,
    calories_burned: typeof calories === 'number' ? Math.round(calories) : null,
    distance_km: null,
    workout_minutes: null,
    weight_kg: typeof weightKg === 'number' ? weightKg : null,
    synced_at: new Date().toISOString(),
  }
}

export async function upsertDailyMetrics(row) {
  const admin = supabaseAdmin()
  const { error } = await admin.from('fitbit_daily_metrics').upsert(row, { onConflict: 'date' })
  if (error) throw error
}

export async function latestHealthMetrics() {
  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('fitbit_daily_metrics')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
