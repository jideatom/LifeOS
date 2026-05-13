import type { MealPlanItem } from './domain/lifeos'

export type CompletedFastRecordRow = {
  id: string
  protocol: string
  planned_hours: number
  actual_hours: number
  started_at_iso: string
  ended_at_iso: string
  completed_on: string
}

export type WorkoutLogRow = {
  id: string
  date: string
  plan: string
  focus: string
  status: string
  completed_at_iso: string
}

export type RecipeRow = {
  id: string
  title: string
  tag: string
  carb_signal: string
  base: string
  protein: string
  vehicle: string
  source: string
  updated_at: string
}

export type LiftProgressRow = {
  label: string
  weight: number
  increment: number
  failures: number
  updated_at_iso: string
}

export type MealTimelineRow = {
  id: string
  date: string
  time: string
  title: string
  role: MealPlanItem['role']
  status: MealPlanItem['status']
  carb_signal: MealPlanItem['carbSignal']
  items: string[]
  budget_backup: string | null
}

type LifeOsCloudState = {
  fastingSessions: CompletedFastRecordRow[]
  workoutLogs: WorkoutLogRow[]
  mealTimelines: MealTimelineRow[]
  recipes: RecipeRow[]
  liftProgress: LiftProgressRow[]
}

const DEFAULT_LIFEOS_API_BASE = 'https://life-os-lac-pi.vercel.app'

function trimEnv(value: string | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function apiOriginFromUrl(value: string) {
  if (!value) return ''

  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

const lifeOsApiBase =
  trimEnv(import.meta.env.VITE_LIFEOS_API_BASE) ||
  trimEnv(import.meta.env.VITE_LIFEOS_HEALTH_API_BASE) ||
  apiOriginFromUrl(trimEnv(import.meta.env.VITE_LIFEOS_SYNC_API_URL)) ||
  DEFAULT_LIFEOS_API_BASE

const LIFEOS_STATE_ENDPOINT = lifeOsApiBase ? `${lifeOsApiBase}/api/lifeos/state` : ''

export const hasSupabaseConfig = Boolean(LIFEOS_STATE_ENDPOINT)

async function requestLifeOsState<T>(method: 'GET' | 'POST', body?: unknown) {
  if (!LIFEOS_STATE_ENDPOINT) return null

  const response = await fetch(LIFEOS_STATE_ENDPOINT, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'LifeOS shared sync request failed'
    throw new Error(message)
  }

  return payload as T
}

export async function fetchLifeOsCloudState() {
  return (await requestLifeOsState<LifeOsCloudState>('GET')) ?? null
}

export async function syncLifeOsCloudState(input: LifeOsCloudState) {
  await requestLifeOsState<{ ok: boolean }>('POST', input)
}

export function subscribeToLifeOsCloudState(onChange: () => void) {
  void onChange
  return () => {}
}
