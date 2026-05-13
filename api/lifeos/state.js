import {
  isAllowedOrigin,
  sendJson,
  setCors,
  supabaseAdmin,
} from '../fitbit/_shared.js'

function ensureAllowedOrigin(request, response) {
  if (isAllowedOrigin(request.headers.origin)) return true
  sendJson(response, 403, { error: 'Origin is not allowed' })
  return false
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

async function syncTable(admin, table, rows, keyColumn) {
  const normalizedRows = normalizeArray(rows)

  const { data: existingRows, error: existingError } = await admin.from(table).select(keyColumn)
  if (existingError) throw existingError

  const incomingKeys = new Set(
    normalizedRows
      .map((row) => row?.[keyColumn])
      .filter((value) => typeof value === 'string' || typeof value === 'number'),
  )

  const staleKeys = (existingRows ?? [])
    .map((row) => row?.[keyColumn])
    .filter(
      (value) =>
        (typeof value === 'string' || typeof value === 'number') && !incomingKeys.has(value),
    )

  if (normalizedRows.length > 0) {
    const { error: upsertError } = await admin.from(table).upsert(normalizedRows, {
      onConflict: keyColumn,
      ignoreDuplicates: false,
    })
    if (upsertError) throw upsertError
  }

  if (staleKeys.length > 0) {
    const { error: deleteError } = await admin.from(table).delete().in(keyColumn, staleKeys)
    if (deleteError) throw deleteError
  }
}

async function fetchState(admin) {
  const [fasting, workouts, meals, recipes, lifts] = await Promise.all([
    admin.from('fasting_sessions').select('*').order('completed_on', { ascending: false }),
    admin.from('workout_logs').select('*').order('completed_at_iso', { ascending: false }),
    admin.from('meal_timelines').select('*').order('date', { ascending: false }),
    admin.from('recipes').select('*').order('updated_at', { ascending: false }),
    admin.from('lift_progress').select('*').order('updated_at_iso', { ascending: false }),
  ])

  const errors = [fasting.error, workouts.error, meals.error, recipes.error, lifts.error].filter(Boolean)
  if (errors.length > 0) throw errors[0]

  return {
    fastingSessions: fasting.data ?? [],
    workoutLogs: workouts.data ?? [],
    mealTimelines: meals.data ?? [],
    recipes: recipes.data ?? [],
    liftProgress: lifts.data ?? [],
  }
}

async function syncState(admin, body) {
  const payload = body && typeof body === 'object' ? body : {}

  await Promise.all([
    syncTable(admin, 'fasting_sessions', payload.fastingSessions, 'id'),
    syncTable(admin, 'workout_logs', payload.workoutLogs, 'id'),
    syncTable(admin, 'meal_timelines', payload.mealTimelines, 'id'),
    syncTable(admin, 'recipes', payload.recipes, 'id'),
    syncTable(admin, 'lift_progress', payload.liftProgress, 'label'),
  ])
}

export default async function handler(request, response) {
  setCors(request, response)

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (!ensureAllowedOrigin(request, response)) return

  try {
    const admin = supabaseAdmin()

    if (request.method === 'GET') {
      const state = await fetchState(admin)
      sendJson(response, 200, state)
      return
    }

    if (request.method === 'POST') {
      const body =
        typeof request.body === 'string'
          ? JSON.parse(request.body || '{}')
          : request.body && typeof request.body === 'object'
            ? request.body
            : {}

      await syncState(admin, body)
      sendJson(response, 200, { ok: true })
      return
    }

    sendJson(response, 405, { error: 'Method not allowed' })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'LifeOS state request failed',
    })
  }
}
