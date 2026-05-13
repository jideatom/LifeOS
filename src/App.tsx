import {
  Apple,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Database,
  Dumbbell,
  ExternalLink,
  Flag,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Pencil,
  Plus,
  Smartphone,
  TimerReset,
  Trophy,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRef } from 'react'
import {
  DEFAULT_FASTING_PLAN,
  FASTING_PHASE_MAX_HOURS,
  FASTING_PLANS,
  getFastingPhasesForElapsed,
  getPlanForDate,
  getWeekPreview,
  shiftDate,
  todayIso,
  type FastingPlan,
} from './data/today'
import type { FastingSession, MealPlanItem, SyncMetric } from './domain/lifeos'
import { computeReadiness, fastingProgress } from './domain/lifeos'
import {
  fetchLifeOsCloudState,
  hasSupabaseConfig,
  subscribeToLifeOsCloudState,
  syncLifeOsCloudState,
  type CompletedFastRecordRow,
  type LiftProgressRow,
  type MealTimelineRow,
  type RecipeRow,
  type WorkoutLogRow,
} from './supabase'
import './TodayDashboard.css'
import './App.css'

const NOTION_LIFEOS_URL =
  'https://app.notion.com/p/LifeOS-Command-Center-3544ab8a5f28813d967af856319c8f67?source=copy_link'
const LEARNING_PORTAL_URL = 'https://misimisys.github.io/portal/'
const DEFAULT_NOTION_SYNC_ENDPOINT = 'https://life-os-lac-pi.vercel.app/api/recipes/upsert'
const DEFAULT_HEALTH_BRIDGE_BASE = 'https://life-os-lac-pi.vercel.app'
const NOTION_SYNC_ENDPOINT = import.meta.env.VITE_LIFEOS_SYNC_API_URL ?? DEFAULT_NOTION_SYNC_ENDPOINT
const HEALTH_BRIDGE_BASE =
  import.meta.env.VITE_LIFEOS_HEALTH_API_BASE ??
  import.meta.env.VITE_LIFEOS_FITBIT_API_BASE ??
  DEFAULT_HEALTH_BRIDGE_BASE
const HEALTH_STATUS_ENDPOINT = `${HEALTH_BRIDGE_BASE}/api/health/status`
const HEALTH_CONNECT_ENDPOINT = `${HEALTH_BRIDGE_BASE}/api/health/connect`
const HEALTH_SYNC_ENDPOINT = `${HEALTH_BRIDGE_BASE}/api/health/sync`
const ACTIVE_FAST_STORAGE_KEY = 'lifeos.activeFastStartIso'
const FASTING_PLAN_STORAGE_KEY = 'lifeos.selectedFastingPlan'
const CUSTOM_PLAN_STORAGE_KEY = 'lifeos.customFastingPlan'
const PLANNED_FAST_START_TIME_STORAGE_KEY = 'lifeos.plannedFastStartTime'
const FASTING_HISTORY_STORAGE_KEY = 'lifeos.fastingHistory'
const WORKOUT_LOG_STORAGE_KEY = 'lifeos.workoutLog'
const LIFT_PROGRESS_STORAGE_KEY = 'lifeos.liftProgress'
const RECIPES_STORAGE_KEY = 'lifeos.recipes'
const MEAL_TIMELINE_STORAGE_KEY = 'lifeos.mealTimeline'
const ACTIVE_CHALLENGE_STORAGE_KEY = 'lifeos.activeChallenge'
const DAILY_STEP_GOAL = 10000
const TIME_OPTIONS = Array.from({ length: 24 * 12 }, (_, index) => {
  const totalMinutes = index * 5
  const hours = `${Math.floor(totalMinutes / 60)}`.padStart(2, '0')
  const minutes = `${totalMinutes % 60}`.padStart(2, '0')
  return `${hours}:${minutes}`
})

function readinessLabel(readiness: string) {
  if (readiness === 'Green') return 'Train as planned'
  if (readiness === 'Yellow') return 'Train, hold load'
  return 'Recovery day'
}

function fastingPlanProfile(plan: FastingPlan): FastingPlanProfile {
  switch (plan.protocol) {
    case '12:12':
      return {
        benefits: ['Easiest fasting habit to maintain', 'Gentle appetite reset', 'Better control over random snacking'],
        suitableFor: ['Beginners', 'Recovery weeks', 'People easing into fasting while cleaning up meals'],
        notSuitableFor: ['People expecting dramatic body-composition changes without fixing meal quality'],
        advice: ['Use this as a rhythm builder, not a finish line. Clean suppers still matter.'],
        precautions: ['If even this feels rough, tighten food quality and sleep before extending the fast.'],
      }
    case '13:11':
      return {
        benefits: ['Gentle structure', 'Improved consistency over free eating', 'A realistic bridge toward 14:10 and 16:8'],
        suitableFor: ['Beginners who want a small step up', 'Travel or busy weeks', 'People rebuilding fasting confidence'],
        notSuitableFor: ['Anyone wanting a stricter cut without tightening meal quality'],
        advice: ['Keep the evening meal controlled so the shorter fast still has a real effect.'],
        precautions: ['If hunger is constant, check meal composition before jumping to harsher fasting.'],
      }
    case '14:10':
      return {
        benefits: ['Better eating-window discipline', 'Lower-friction daily fasting', 'Useful balance between structure and flexibility'],
        suitableFor: ['Busy schedules', 'People moving beyond beginner fasting', 'Weeks when training still needs fuel flexibility'],
        notSuitableFor: ['People wanting a very tight feeding window as their main strategy'],
        advice: ['A good weekday reset fast when sleep or training demands make 16:8 feel too tight.'],
        precautions: ['Still prioritize protein and avoid grazing during the eating window.'],
      }
    case '15:9':
      return {
        benefits: ['More structure than 14:10', 'Better control over appetite drift', 'Strong bridge into 16:8'],
        suitableFor: ['People progressing steadily', 'Those who can comfortably delay the first meal', 'Low-carb weekday routines'],
        notSuitableFor: ['People with frequent energy crashes or poor sleep'],
        advice: ['Treat this as a bridge plan and move to 16:8 once it feels steady.'],
        precautions: ['If workouts feel flat, review sleep and pre-fast supper before pushing harder.'],
      }
    case '16:8':
      return {
        benefits: ['Sustainable weight loss', 'Improved metabolic health', 'Good fit with low-carb suppers', 'Improved meal discipline', 'Repeatable long-term fasting rhythm'],
        suitableFor: ['Repeatable weekday fasting', 'People balancing training and fasting', 'Busy schedules that still need structure'],
        notSuitableFor: ['People taking medications requiring regular meals', 'Those with low blood pressure symptoms', 'People with a history of disordered eating'],
        advice: ['This is the best default LifeOS fast: repeatable, serious, and still training-friendly.'],
        precautions: ['If dizziness, palpitations, or repeated weakness show up, stop and reassess before pushing longer windows.'],
      }
    case '17:7':
      return {
        benefits: ['Stronger appetite control', 'Tighter eating window', 'Good transition into deeper fasting'],
        suitableFor: ['People already stable on 16:8', 'Intermediate fasters', 'Weeks with solid sleep and routine'],
        notSuitableFor: ['Beginners', 'People whose heavy training already feels under-fueled'],
        advice: ['Best used when supper is satisfying and the next day is not chaotic.'],
        precautions: ['Watch recovery on squat and deadlift days before making this a default.'],
      }
    case '18:6':
      return {
        benefits: ['Stronger appetite control', 'More deliberate eating window', 'Useful bridge toward deeper fasting', 'Supports lower-carb momentum'],
        suitableFor: ['Intermediate fasters', 'People comfortable skipping breakfast', 'Those wanting stronger structure than 16:8'],
        notSuitableFor: ['Beginners without consistent fasting history', 'People with low blood pressure symptoms', 'Anyone prone to rebound overeating'],
        advice: ['Best used when sleep is decent and supper the previous night was satisfying.'],
        precautions: ['Heavy training and poor readiness do not mix well with 18:6.'],
      }
    case '19:5':
      return {
        benefits: ['Tighter fasting discipline', 'Smaller eating window can simplify decisions', 'Useful cut-phase structure'],
        suitableFor: ['Experienced fasters', 'People who handle small eating windows well', 'Stable routines with controlled meals'],
        notSuitableFor: ['Beginners', 'People with high training stress', 'People who tend to binge after long restriction'],
        advice: ['Break the fast calmly with protein first, not with a reward meal.'],
        precautions: ['If sleep quality or mood starts slipping, ease back rather than forcing it.'],
      }
    case '20:4':
      return {
        benefits: ['Sustainable weight loss', 'Improved metabolic health', 'Increased mental clarity'],
        suitableFor: ['Advanced fasters focused on aggressive weight loss', 'People who can handle longer fasting windows'],
        notSuitableFor: [
          'Those with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'Beginners without prior fasting experience',
          'Those with gastrointestinal issues',
          'Those with diabetes',
        ],
        advice: ['Plan meals that are balanced and rich in vitamins and minerals.', 'Stay busy during fasting hours to reduce fixation on hunger.', 'Protect sleep so the tight eating window does not become stress on top of stress.'],
        precautions: ['Increased hunger may occur.', 'Not recommended for those with eating disorders.', 'If recovery tanks, move back to 18:6 or 16:8.'],
      }
    case '21:3':
    case '22:2':
    case '23:1':
      return {
        benefits: ['Very tight eating structure', 'Strong calorie control', 'Can simplify food decisions for advanced fasters'],
        suitableFor: ['Very experienced fasters', 'Short challenge blocks', 'Busy days where one main meal is easier than grazing'],
        notSuitableFor: [
          'Beginners without prior fasting experience',
          'People with low blood pressure',
          'People taking medications requiring regular meals',
          'Pregnant or breastfeeding women',
          'Underweight individuals',
          'People with gastrointestinal issues or diabetes',
        ],
        advice: ['Keep the single eating period nutrient-dense and protein-forward.', 'Use calm, deliberate meals instead of trying to “make up” for the long fast.', 'Do not pair this with hard training and poor sleep.'],
        precautions: ['These protocols are not everyday defaults for most people.', 'If obsession, rebound eating, or severe fatigue shows up, step back immediately.'],
      }
    case '24h':
      return {
        benefits: ['Sustainable weight loss', 'Improved metabolic health', 'Enhanced longevity', 'Cellular repair and autophagy support'],
        suitableFor: ['Reset for the body', 'Managing one full day without food', 'Experienced fasters using occasional structured fasts'],
        notSuitableFor: [
          'Those with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'Inexperienced fasters',
          'Individuals with existing health issues such as diabetes or chronic gastrointestinal problems',
          'Individuals with extreme fatigue or energy deficiencies',
        ],
        advice: ['Break the fast with light and easily digested foods to reduce gastrointestinal discomfort.', 'Drink water, herbal teas, or electrolytes to stay hydrated.', 'Prepare balanced meals in advance so refeeding stays controlled.'],
        precautions: ['Not suitable for those with unstable medical conditions.', 'Pay attention to how your body responds and adjust rather than forcing completion.'],
      }
    case '30h':
      return {
        benefits: ['Deeper break from frequent eating', 'Stronger fasting discipline', 'Useful bridge between 24h and multi-day fasting'],
        suitableFor: ['Advanced fasters building toward longer protocols', 'Occasional challenge weeks', 'Low-stress periods with lighter training'],
        notSuitableFor: [
          'Beginners without prior fasting experience',
          'People with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'People with chronic medical conditions unless medically cleared',
        ],
        advice: ['Prepare for fasting days in advance.', 'Use nutrient-dense meals before and after the fast.', 'Keep activity light and avoid ego-driven training.'],
        precautions: ['This is no longer casual intermittent fasting.', 'If dizziness, weakness, or poor concentration escalates, stop and refeed.'],
      }
    case '48h':
      return {
        benefits: ['Sustainable weight loss', 'Enhanced longevity', 'Cellular repair and autophagy support'],
        suitableFor: ['Advanced fasters seeking maximum health benefits', 'People with prior fasting experience'],
        notSuitableFor: [
          'Those with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'Those without prior fasting experience',
          'Individuals with existing health issues such as diabetes, gastrointestinal issues, or chronic health conditions',
          'Individuals prone to dehydration',
          'Individuals with extreme fatigue or energy deficiencies',
        ],
        advice: ['Stay hydrated and consider electrolyte supplementation.', 'Prioritize relaxation and light activities.', 'Prepare mentally and physically before starting.'],
        precautions: ['Risk of severe fatigue and dehydration.', 'Requires significant fasting experience.', 'Higher risk of nutrient shortfall and poor recovery if used carelessly.', 'Consider consulting a healthcare professional before prolonged fasting.'],
      }
    case '72h':
      return {
        benefits: ['Sustainable weight loss', 'Enhanced longevity', 'Cellular repair and autophagy support'],
        suitableFor: ['Very experienced fasters focusing on longevity', 'Medically fit individuals only'],
        notSuitableFor: [
          'Those with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'Those without prior fasting experience',
          'Those without medical supervision',
          'Individuals with existing health issues such as diabetes, gastrointestinal issues, or chronic health conditions',
          'Individuals prone to dehydration',
          'Individuals with extreme fatigue or energy deficiencies',
        ],
        advice: ['Stay hydrated and consider electrolyte supplementation.', 'Prioritize relaxation and light activities.', 'Prepare mentally and physically before starting.'],
        precautions: ['Risk of severe fatigue and dehydration.', 'Requires significant fasting experience.', 'High risk of nutrient deficiency if repeated carelessly.', 'Consult a healthcare professional for prolonged fasting.'],
      }
    case '96h':
      return {
        benefits: ['Extended fasting discipline', 'Very deep break from frequent eating', 'Challenge-level protocol for highly experienced fasters'],
        suitableFor: ['Only very experienced fasters', 'Rare challenge use, not routine use', 'Periods with strong recovery and no heavy training demands'],
        notSuitableFor: [
          'Beginners without prior fasting experience',
          'People with low blood pressure',
          'People taking medications requiring regular meals',
          'Underweight individuals',
          'Pregnant or breastfeeding women',
          'Anyone with medical conditions unless directly supervised',
          'Anyone with a history of disordered eating',
        ],
        advice: ['Reduce activity drastically and prepare the refeed before you start.', 'Treat electrolyte intake, rest, and mental state as non-optional.', 'Do not make this a badge-of-honor protocol.'],
        precautions: ['This sits well beyond ordinary intermittent fasting.', 'Professional medical guidance is strongly advisable.', 'Stop if symptoms escalate instead of chasing the clock.'],
      }
    default:
      break
  }

  if (plan.fastingHours <= 14) {
    return {
      benefits: ['Easier consistency', 'Gentler appetite reset', 'Better eating-window structure'],
      suitableFor: ['Beginners building rhythm', 'Busy weekdays', 'People testing fasting without heavy strain'],
      notSuitableFor: ['People expecting strong results without also cleaning up meal quality'],
      advice: ['Use this to establish routine first, then tighten later if needed.'],
      precautions: ['Use meal quality, sleep, and consistency to decide when to progress.'],
    }
  }

  if (plan.fastingHours <= 16) {
    return {
      benefits: ['Sustainable weight control', 'Better fasting consistency', 'Good fit with low-carb suppers', 'Improved meal discipline'],
      suitableFor: ['Repeatable weekday fasting', 'People balancing training and fasting', 'Busy schedules that still need structure'],
      notSuitableFor: ['Anyone with medication schedules that require regular meals', 'People with repeated dizziness when fasting'],
      advice: ['This is the best default LifeOS fast: repeatable, serious, and still training-friendly.'],
      precautions: ['If symptoms repeat, shorten the fast and review recovery first.'],
    }
  }

  if (plan.fastingHours <= 18) {
    return {
      benefits: ['Stronger appetite control', 'More deliberate eating window', 'Useful bridge toward deeper fasting', 'Supports lower-carb momentum'],
      suitableFor: ['Intermediate fasters', 'People comfortable skipping breakfast', 'Those wanting stronger structure than 16:8'],
      notSuitableFor: ['Beginners who still struggle with hunger swings', 'Heavy lifting days when recovery is poor'],
      advice: ['Best used when sleep is decent and supper the previous night was satisfying.'],
      precautions: ['Do not force this on red-readiness days.'],
    }
  }

  if (plan.fastingHours <= 20) {
    return {
      benefits: ['Tighter calorie control', 'Longer fat-burning window', 'Smaller eating window can simplify decisions'],
      suitableFor: ['Experienced fasters', 'Aggressive cut phases', 'Weeks when routine is stable'],
      notSuitableFor: ['Beginners', 'People with low blood pressure symptoms', 'Anyone pushing heavy training without enough recovery'],
      advice: ['Keep protein high and break the fast with a calm, controlled meal instead of a rebound feast.'],
      precautions: ['Aggressive windows work best as phases, not permanent defaults.'],
    }
  }

  if (plan.fastingHours <= 24) {
    return {
      benefits: ['Extended fasting exposure', 'Useful for advanced appetite control', 'Can sharpen discipline around meal timing'],
      suitableFor: ['Advanced fasters only', 'Occasional challenge days', 'Controlled low-stress schedules'],
      notSuitableFor: ['Pregnant or breastfeeding women', 'Underweight individuals', 'People with diabetes or medical conditions unless cleared by a clinician'],
      advice: ['Treat this as an advanced tool, not your casual everyday default.'],
      precautions: ['Longer fasts deserve calmer days and more deliberate refeeds.'],
    }
  }

  return {
    benefits: ['Extended metabolic break from frequent eating', 'Challenge-level fasting discipline', 'Can deepen confidence with longer protocols'],
    suitableFor: ['Advanced fasters with prior experience', 'Occasional structured challenge blocks', 'Periods with low training load and good recovery'],
    notSuitableFor: [
      'Beginners without prior fasting experience',
      'People with low blood pressure',
      'People taking medication requiring regular meals',
      'Pregnant or breastfeeding women',
      'Anyone with a history of disordered eating',
    ],
    advice: ['Use caution, lower training intensity, and have a deliberate refeed plan before starting.'],
    precautions: ['If you need to ask whether you are ready for this, the answer is usually not yet.'],
  }
}

function formatFastHours(hours: number) {
  const wholeHours = Math.floor(hours)
  const totalSeconds = Math.max(0, Math.floor(hours * 60 * 60))
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${wholeHours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
}

function formatTargetHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1)
}

function fastActionLabel(status: string) {
  if (status === 'Eating Window' || status === 'Completed') return 'Break Your Fast'
  if (status === 'Planned') return 'Start Fast'
  return 'End Fast'
}

function formatClockTime(date: Date) {
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatTimeInput(date: Date) {
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${hours}:${minutes}`
}

function isTimeInput(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function dateAtClockTime(dateIso: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date(`${dateIso}T12:00:00`)
  date.setHours(hours, minutes, 0, 0)
  return date
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function isoFromLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatRelativeDay(date: Date, referenceDate: Date) {
  const dateIso = isoFromLocalDate(date)
  const referenceIso = isoFromLocalDate(referenceDate)
  const tomorrow = new Date(referenceDate)
  tomorrow.setDate(referenceDate.getDate() + 1)

  if (dateIso === referenceIso) return 'Today'
  if (dateIso === isoFromLocalDate(tomorrow)) return 'Tomorrow'

  return new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatRelativeDayTime(date: Date, referenceDate: Date) {
  const dateIso = isoFromLocalDate(date)
  const referenceIso = isoFromLocalDate(referenceDate)
  const tomorrow = new Date(referenceDate)
  tomorrow.setDate(referenceDate.getDate() + 1)
  const tomorrowIso = isoFromLocalDate(tomorrow)

  if (dateIso === referenceIso) return `Today, ${formatClockTime(date)}`
  if (dateIso === tomorrowIso) return `Tomorrow, ${formatClockTime(date)}`

  return `${new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    day: 'numeric',
  }).format(date)}, ${formatClockTime(date)}`
}

function formatPickerDate(dateIso: string) {
  const [, month, day] = dateIso.split('-')
  return `${month}/${day}`
}

function activeFastInitialValue() {
  return window.localStorage.getItem(ACTIVE_FAST_STORAGE_KEY)
}

function plannedFastStartInitialValue() {
  const storedTime = window.localStorage.getItem(PLANNED_FAST_START_TIME_STORAGE_KEY)
  return storedTime && isTimeInput(storedTime) ? storedTime : '20:00'
}

function timeOptionsWithValue(value: string) {
  if (TIME_OPTIONS.includes(value)) return TIME_OPTIONS
  return [...TIME_OPTIONS, value].sort()
}

function uniqueSortedDates(dates: string[]) {
  return Array.from(new Set(dates)).sort()
}

function consecutiveDayCount(dates: string[]) {
  const uniqueDates = Array.from(new Set(dates)).sort().reverse()
  if (uniqueDates.length === 0) return 0

  let streak = 1
  let anchor = uniqueDates[0]

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const candidate = uniqueDates[index]
    if (candidate !== shiftDate(anchor, -1)) break
    streak += 1
    anchor = candidate
  }

  return streak
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function storedFastingPlanInitialValue() {
  const storedPlan = window.localStorage.getItem(FASTING_PLAN_STORAGE_KEY)
  if (!storedPlan) return DEFAULT_FASTING_PLAN

  try {
    const parsed = JSON.parse(storedPlan) as FastingPlan
    if (typeof parsed.id === 'string' && typeof parsed.fastingHours === 'number') return parsed
  } catch {
    window.localStorage.removeItem(FASTING_PLAN_STORAGE_KEY)
  }

  return DEFAULT_FASTING_PLAN
}

function storedCustomPlanInitialValue() {
  const storedPlan = window.localStorage.getItem(CUSTOM_PLAN_STORAGE_KEY)
  if (!storedPlan) return { fastingHours: 16, eatingHours: 8 }

  try {
    const parsed = JSON.parse(storedPlan) as { fastingHours?: number; eatingHours?: number }
    return {
      fastingHours: clampNumber(Number(parsed.fastingHours), 1, 96),
      eatingHours: clampNumber(Number(parsed.eatingHours), 0, 23),
    }
  } catch {
    window.localStorage.removeItem(CUSTOM_PLAN_STORAGE_KEY)
    return { fastingHours: 16, eatingHours: 8 }
  }
}

function planTone(level: FastingPlan['level']) {
  if (level === 'Advanced') return 'warm'
  if (level === 'Custom') return 'pink'
  if (level === 'Hot') return 'blue'
  return 'mint'
}

function challengeTone(accent: ChallengeDefinition['accent']) {
  if (accent === 'sun') return 'sun'
  if (accent === 'coral') return 'coral'
  if (accent === 'aqua') return 'aqua'
  return 'mint'
}

function dateIsoToAnchor(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`)
}

function challengeStateInitialValue() {
  const stored = window.localStorage.getItem(ACTIVE_CHALLENGE_STORAGE_KEY)
  if (!stored) return null as ActiveChallengeState | null

  try {
    const parsed = JSON.parse(stored) as Partial<ActiveChallengeState>
    if (typeof parsed.challengeId === 'string' && typeof parsed.startedOn === 'string') {
      return { challengeId: parsed.challengeId, startedOn: parsed.startedOn }
    }
  } catch {
    window.localStorage.removeItem(ACTIVE_CHALLENGE_STORAGE_KEY)
  }

  return null
}

const RECIPE_CARB_SIGNALS = ['Low', 'Medium', 'Relax'] as const
const RECIPE_FILTERS = ['All', ...RECIPE_CARB_SIGNALS] as const

type RecipeCarbSignal = (typeof RECIPE_CARB_SIGNALS)[number]

type Recipe = {
  id: string
  title: string
  tag: string
  carbSignal: RecipeCarbSignal
  base: string
  protein: string
  vehicle: string
  source: 'LifeOS' | 'Custom'
  updatedAt: string
}

type RecipeDraft = Omit<Recipe, 'id' | 'source' | 'updatedAt'>
type MealDraft = Omit<MealPlanItem, 'id'>

type CompletedFastRecord = {
  id: string
  protocol: FastingPlan['protocol']
  plannedHours: number
  actualHours: number
  startedAtIso: string
  endedAtIso: string
  completedOn: string
}

type ChallengeDefinition = {
  id: string
  title: string
  durationDays: number
  targetFasts: number
  minimumFastHours: number
  subtitle: string
  accent: 'mint' | 'sun' | 'coral' | 'aqua'
  benefits: string[]
  reward: string
}

type ActiveChallengeState = {
  challengeId: string
  startedOn: string
}

type FitbitDailyMetrics = {
  date: string
  source: string
  sync_status: string
  sleep_hours: number | null
  sleep_score: number | null
  resting_heart_rate: number | null
  steps: number | null
  active_zone_minutes: number | null
  calories_burned: number | null
  distance_km: number | null
  workout_minutes: number | null
  weight_kg: number | null
  synced_at: string | null
}

type FitbitBridgeState = {
  connected: boolean
  lastSyncedAt: string | null
  latestMetrics: FitbitDailyMetrics | null
}

type WorkoutLogEntry = {
  id: string
  date: string
  plan: string
  focus: string
  status: 'Done' | 'Skipped'
  completedAtIso: string
}

type LiftProgressEntry = {
  label: string
  weight: number
  increment: number
  failures: number
  updatedAtIso: string
}

type SignalCardTarget = 'day-overview' | 'nutrition' | 'fitness' | 'sync'

type FastingPlanProfile = {
  benefits: string[]
  suitableFor: string[]
  notSuitableFor: string[]
  advice: string[]
  precautions: string[]
}

const DEFAULT_LIFT_PROGRESS: Record<string, LiftProgressEntry> = {
  'Back Squat 5x5': { label: 'Back Squat 5x5', weight: 135, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Bench Press 5x5': { label: 'Bench Press 5x5', weight: 95, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Barbell Row 5x5': { label: 'Barbell Row 5x5', weight: 95, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Overhead Press 5x5': { label: 'Overhead Press 5x5', weight: 65, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Deadlift 1x5 or Trap Bar 3x3-5': { label: 'Deadlift 1x5 or Trap Bar 3x3-5', weight: 185, increment: 10, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Trap Bar Deadlift 3x3-5': { label: 'Trap Bar Deadlift 3x3-5', weight: 185, increment: 10, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
}

const FASTING_CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'fasting-7',
    title: '7-Day Fasting Reset',
    durationDays: 7,
    targetFasts: 4,
    minimumFastHours: 12,
    subtitle: 'Get started with 4 clean fasts in 7 days.',
    accent: 'mint',
    benefits: ['Build momentum fast', 'Re-establish meal timing', 'Low-friction win for getting back on track'],
    reward: '7-Day Reset badge',
  },
  {
    id: 'fasting-14',
    title: '14-Day Fasting Rhythm',
    durationDays: 14,
    targetFasts: 10,
    minimumFastHours: 12,
    subtitle: 'Transform consistency in two weeks.',
    accent: 'aqua',
    benefits: ['Noticeable discipline shift', 'Cleaner fasting windows', 'More stable weekday rhythm'],
    reward: '14-Day Rhythm badge',
  },
  {
    id: 'fasting-21',
    title: '21-Day Fasting Consistency',
    durationDays: 21,
    targetFasts: 16,
    minimumFastHours: 12,
    subtitle: 'Master the rhythm of fasting in 21 days.',
    accent: 'coral',
    benefits: ['Turns fasting into identity', 'Stronger appetite control', 'Best bridge into long-term LifeOS discipline'],
    reward: '21-Day Consistency badge',
  },
]

const recipeLibrary: Recipe[] = [
  {
    id: 'efo-riro-protein-bowl',
    title: 'Efo riro protein bowl',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Efo riro with spinach/ugu, pepper mix, palm oil in a controlled portion.',
    protein: 'Best with eggs, gizzard, chicken laps, or alaran when budget allows.',
    vehicle: 'Cabbage swallow, eggplant swallow, or cauliflower rice.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'okro-soup-fast-breaker',
    title: 'Okro soup fast breaker',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Okro cooked light with pepper, greens, and enough protein to make it filling.',
    protein: 'Use boiled eggs, chicken, gizzard, or mackerel. Skip crayfish and prawns.',
    vehicle: 'Cabbage swallow or a small side of sauteed cabbage.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'egusi-light-supper',
    title: 'Egusi light supper',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Egusi with more greens than seed paste, cooked rich but not heavy.',
    protein: 'Eggs and chicken keep cost down. Croaker only when price makes sense.',
    vehicle: 'Cauliflower rice or eggplant swallow.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'pepper-stew-cauliflower-rice',
    title: 'Pepper stew cauliflower rice',
    tag: 'Stew',
    carbSignal: 'Low',
    base: 'Tomato and pepper stew over cauliflower rice with sauteed vegetables.',
    protein: 'Eggs, gizzard, chicken laps, or alaran.',
    vehicle: 'Cauliflower rice as the default rice replacement.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'alaran-pepper-stew-plate',
    title: 'Alaran pepper stew plate',
    tag: 'Fish',
    carbSignal: 'Low',
    base: 'Mackerel in pepper stew with cucumber, cabbage, or steamed greens.',
    protein: 'Use alaran as the main fish option. Swap to eggs when fish price is high.',
    vehicle: 'Cabbage rice, cauliflower rice, or no swallow.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'egg-avocado-greens-plate',
    title: 'Egg avocado greens plate',
    tag: 'Fast breaker',
    carbSignal: 'Low',
    base: 'Eggs with avocado, cucumber, greens, and a small groundnut garnish.',
    protein: 'Eggs carry the plate. Add gizzard if training day hunger is high.',
    vehicle: 'No rice needed. Add soup or stew if you want heat.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'quinoa-lentil-control-bowl',
    title: 'Quinoa lentil control bowl',
    tag: 'Bowl',
    carbSignal: 'Medium',
    base: 'Small quinoa portion with lentils, greens, cucumber, and pepper sauce.',
    protein: 'Add eggs or chicken so the bowl does not become carb-led.',
    vehicle: 'Keep quinoa and lentils measured, especially on fasting days.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'garbanzo-salad-bowl',
    title: 'Garbanzo salad bowl',
    tag: 'Bowl',
    carbSignal: 'Medium',
    base: 'Garbanzo beans with avocado, cucumber, onions, pepper, and olive oil.',
    protein: 'Add eggs, chicken, or gizzard for better satiety.',
    vehicle: 'Best as a planned medium-carb meal, not a casual side.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'cabbage-rice-stir-fry',
    title: 'Cabbage rice stir-fry',
    tag: 'Skillet',
    carbSignal: 'Low',
    base: 'Shredded cabbage stir-fried with pepper, onions, eggs, and a little oil.',
    protein: 'Eggs are the budget version. Add chicken or gizzard for training days.',
    vehicle: 'Use as the rice replacement beside soup or stew.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
  {
    id: 'roasted-corn-and-ube',
    title: 'Roasted corn and ube',
    tag: 'Seasonal',
    carbSignal: 'Relax',
    base: 'May and June seasonal roasted corn with local pear.',
    protein: 'Pair with eggs or fish later so the day is not only carb-led.',
    vehicle: 'Relax-day item. Keep portion deliberate.',
    source: 'LifeOS',
    updatedAt: '2026-05-03',
  },
]

function emptyRecipeDraft(): RecipeDraft {
  return {
    title: '',
    tag: 'Custom',
    carbSignal: 'Low',
    base: '',
    protein: '',
    vehicle: '',
  }
}

function isRecipeCarbSignal(value: string): value is RecipeCarbSignal {
  return RECIPE_CARB_SIGNALS.includes(value as RecipeCarbSignal)
}

function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false
  const recipe = value as Partial<Recipe>
  return Boolean(
    recipe.id &&
      recipe.title &&
      recipe.tag &&
      recipe.base &&
      recipe.protein &&
      recipe.vehicle &&
      recipe.carbSignal &&
      isRecipeCarbSignal(recipe.carbSignal),
  )
}

function storedRecipesInitialValue() {
  const storedRecipes = window.localStorage.getItem(RECIPES_STORAGE_KEY)
  if (!storedRecipes) return recipeLibrary

  try {
    const parsed = JSON.parse(storedRecipes) as unknown
    if (Array.isArray(parsed)) {
      const recipes = parsed.filter(isRecipe)
      if (recipes.length > 0) return recipes
    }
  } catch {
    window.localStorage.removeItem(RECIPES_STORAGE_KEY)
  }

  return recipeLibrary
}

function recipeId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID()
  return `custom-${Date.now()}`
}

function completedFastId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID()
  return `fast-${Date.now()}`
}

function workoutLogId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID()
  return `workout-${Date.now()}`
}

function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    tag: recipe.tag,
    carbSignal: recipe.carbSignal,
    base: recipe.base,
    protein: recipe.protein,
    vehicle: recipe.vehicle,
  }
}

function storedFastingHistoryInitialValue() {
  const storedHistory = window.localStorage.getItem(FASTING_HISTORY_STORAGE_KEY)
  if (!storedHistory) return [] as CompletedFastRecord[]

  try {
    const parsed = JSON.parse(storedHistory) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is CompletedFastRecord => {
      if (!entry || typeof entry !== 'object') return false
      const record = entry as Partial<CompletedFastRecord>
      return Boolean(
        record.id &&
          record.protocol &&
          typeof record.plannedHours === 'number' &&
          typeof record.actualHours === 'number' &&
          record.startedAtIso &&
          record.endedAtIso &&
          record.completedOn,
      )
    })
  } catch {
    window.localStorage.removeItem(FASTING_HISTORY_STORAGE_KEY)
    return []
  }
}

function emptyMealDraft(): MealDraft {
  return {
    time: '',
    title: '',
    role: 'Main meal',
    status: 'Flexible',
    carbSignal: 'Low',
    items: [],
    budgetBackup: '',
  }
}

function mealItemId() {
  if (window.crypto.randomUUID) return window.crypto.randomUUID()
  return `meal-${Date.now()}`
}

function mealToDraft(meal: MealPlanItem): MealDraft {
  return {
    time: meal.time,
    title: meal.title,
    role: meal.role,
    status: meal.status,
    carbSignal: meal.carbSignal,
    items: meal.items,
    budgetBackup: meal.budgetBackup ?? '',
  }
}

function isMealStatus(value: string): value is MealPlanItem['status'] {
  return ['Planned', 'Done', 'Skipped', 'Flexible'].includes(value)
}

function isMealRole(value: string): value is MealPlanItem['role'] {
  return ['Break fast', 'Main meal', 'Supper', 'Snack', 'Hydration'].includes(value)
}

function isMealPlanItem(value: unknown): value is MealPlanItem {
  if (!value || typeof value !== 'object') return false
  const meal = value as Partial<MealPlanItem>
  return Boolean(
    meal.id &&
      typeof meal.time === 'string' &&
      meal.title &&
      meal.role &&
      isMealRole(meal.role) &&
      meal.status &&
      isMealStatus(meal.status) &&
      meal.carbSignal &&
      ['Low', 'Medium', 'Relax'].includes(meal.carbSignal) &&
      Array.isArray(meal.items),
  )
}

function storedMealTimelineInitialValue() {
  const storedTimeline = window.localStorage.getItem(MEAL_TIMELINE_STORAGE_KEY)
  if (!storedTimeline) return {} as Record<string, MealPlanItem[]>

  try {
    const parsed = JSON.parse(storedTimeline) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed as Record<string, unknown>).reduce(
      (accumulator, [date, meals]) => {
        if (Array.isArray(meals)) {
          const validMeals = meals.filter(isMealPlanItem)
          if (validMeals.length > 0) accumulator[date] = validMeals
        }
        return accumulator
      },
      {} as Record<string, MealPlanItem[]>,
    )
  } catch {
    window.localStorage.removeItem(MEAL_TIMELINE_STORAGE_KEY)
    return {}
  }
}

function fastingRecordToRow(record: CompletedFastRecord): CompletedFastRecordRow {
  return {
    id: record.id,
    protocol: record.protocol,
    planned_hours: record.plannedHours,
    actual_hours: record.actualHours,
    started_at_iso: record.startedAtIso,
    ended_at_iso: record.endedAtIso,
    completed_on: record.completedOn,
  }
}

function fastingRowToRecord(row: CompletedFastRecordRow): CompletedFastRecord {
  return {
    id: row.id,
    protocol: row.protocol as FastingPlan['protocol'],
    plannedHours: row.planned_hours,
    actualHours: row.actual_hours,
    startedAtIso: row.started_at_iso,
    endedAtIso: row.ended_at_iso,
    completedOn: row.completed_on,
  }
}

function workoutLogToRow(entry: WorkoutLogEntry): WorkoutLogRow {
  return {
    id: entry.id,
    date: entry.date,
    plan: entry.plan,
    focus: entry.focus,
    status: entry.status,
    completed_at_iso: entry.completedAtIso,
  }
}

function workoutRowToEntry(row: WorkoutLogRow): WorkoutLogEntry {
  return {
    id: row.id,
    date: row.date,
    plan: row.plan,
    focus: row.focus,
    status: row.status as WorkoutLogEntry['status'],
    completedAtIso: row.completed_at_iso,
  }
}

function recipeToRow(recipe: Recipe): RecipeRow {
  return {
    id: recipe.id,
    title: recipe.title,
    tag: recipe.tag,
    carb_signal: recipe.carbSignal,
    base: recipe.base,
    protein: recipe.protein,
    vehicle: recipe.vehicle,
    source: recipe.source,
    updated_at: recipe.updatedAt,
  }
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    carbSignal: row.carb_signal as RecipeCarbSignal,
    base: row.base,
    protein: row.protein,
    vehicle: row.vehicle,
    source: row.source as Recipe['source'],
    updatedAt: row.updated_at,
  }
}

function mealTimelineMapToRows(input: Record<string, MealPlanItem[]>): MealTimelineRow[] {
  return Object.entries(input).flatMap(([date, meals]) =>
    meals.map((meal) => ({
      id: meal.id,
      date,
      time: meal.time,
      title: meal.title,
      role: meal.role,
      status: meal.status,
      carb_signal: meal.carbSignal,
      items: meal.items,
      budget_backup: meal.budgetBackup ?? null,
    })),
  )
}

function rowsToMealTimelineMap(rows: MealTimelineRow[]) {
  return rows.reduce(
    (accumulator, row) => {
      const meal: MealPlanItem = {
        id: row.id,
        time: row.time,
        title: row.title,
        role: row.role,
        status: row.status,
        carbSignal: row.carb_signal,
        items: row.items,
        budgetBackup: row.budget_backup ?? undefined,
      }

      accumulator[row.date] = [...(accumulator[row.date] ?? []), meal]
      return accumulator
    },
    {} as Record<string, MealPlanItem[]>,
  )
}

function liftProgressToRows(input: Record<string, LiftProgressEntry>): LiftProgressRow[] {
  return Object.values(input).map((entry) => ({
    label: entry.label,
    weight: entry.weight,
    increment: entry.increment,
    failures: entry.failures,
    updated_at_iso: entry.updatedAtIso,
  }))
}

function rowsToLiftProgressMap(rows: LiftProgressRow[]) {
  return rows.reduce(
    (accumulator, row) => ({
      ...accumulator,
      [row.label]: {
        label: row.label,
        weight: row.weight,
        increment: row.increment,
        failures: row.failures,
        updatedAtIso: row.updated_at_iso,
      },
    }),
    {} as Record<string, LiftProgressEntry>,
  )
}

function storedWorkoutLogInitialValue() {
  const storedWorkoutLog = window.localStorage.getItem(WORKOUT_LOG_STORAGE_KEY)
  if (!storedWorkoutLog) return [] as WorkoutLogEntry[]

  try {
    const parsed = JSON.parse(storedWorkoutLog) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter((entry): entry is WorkoutLogEntry => {
      if (!entry || typeof entry !== 'object') return false
      const workoutEntry = entry as Partial<WorkoutLogEntry>
      return Boolean(
        workoutEntry.id &&
          workoutEntry.date &&
          workoutEntry.plan &&
          workoutEntry.focus &&
          workoutEntry.status &&
          workoutEntry.completedAtIso,
      )
    })
  } catch {
    window.localStorage.removeItem(WORKOUT_LOG_STORAGE_KEY)
    return []
  }
}

function isLiftProgressEntry(value: unknown): value is LiftProgressEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<LiftProgressEntry>
  return Boolean(
    entry.label &&
      typeof entry.weight === 'number' &&
      typeof entry.increment === 'number' &&
      typeof entry.failures === 'number' &&
      entry.updatedAtIso,
  )
}

function storedLiftProgressInitialValue() {
  const storedProgress = window.localStorage.getItem(LIFT_PROGRESS_STORAGE_KEY)
  if (!storedProgress) return DEFAULT_LIFT_PROGRESS

  try {
    const parsed = JSON.parse(storedProgress) as unknown
    if (!parsed || typeof parsed !== 'object') return DEFAULT_LIFT_PROGRESS

    return Object.entries(parsed as Record<string, unknown>).reduce(
      (accumulator, [key, value]) => {
        if (isLiftProgressEntry(value)) accumulator[key] = value
        return accumulator
      },
      { ...DEFAULT_LIFT_PROGRESS } as Record<string, LiftProgressEntry>,
    )
  } catch {
    window.localStorage.removeItem(LIFT_PROGRESS_STORAGE_KEY)
    return DEFAULT_LIFT_PROGRESS
  }
}

function advisoryContainsAvoid(text: string) {
  return /(prawn|prawns|catfish|crayfish|afang|ogbono|oha|nsala|miyan kuka|miyan taushe|tuwo shinkafa)/i.test(text)
}

function buildRecipeAdvisory(input: Pick<RecipeDraft, 'carbSignal' | 'base' | 'protein' | 'vehicle' | 'tag'>) {
  const advisory: string[] = []
  const combinedText = `${input.tag} ${input.base} ${input.protein} ${input.vehicle}`.toLowerCase()

  if (advisoryContainsAvoid(combinedText)) {
    advisory.push('This recipe mentions an avoid item. Swap it before using it in your plan.')
  }

  if (!input.protein.trim()) {
    advisory.push('Add a clear protein anchor so the meal does not become carb-led.')
  } else if (/(alaran|croaker|fish|mackerel)/i.test(input.protein)) {
    advisory.push('If fish price jumps, use eggs, gizzard, or chicken laps as the budget fallback.')
  }

  if (input.carbSignal === 'Low' && !/(cauliflower|cabbage|eggplant|no swallow)/i.test(combinedText)) {
    advisory.push('Keep this low-carb with cauliflower rice, cabbage rice, eggplant swallow, or no swallow.')
  }

  if (input.carbSignal === 'Medium') {
    advisory.push('Measure the carb portion deliberately so quinoa, lentils, or beans stay controlled.')
  }

  if (input.carbSignal === 'Relax') {
    advisory.push('Best on relax days. Lead with protein first so the meal stays steady.')
  }

  return advisory.slice(0, 2)
}

function recipesToNotionMarkdown(recipes: Recipe[]) {
  return [
    '# LifeOS Recipes',
    '',
    `Last staged: ${new Date().toLocaleString('en-NG')}`,
    '',
    ...recipes.flatMap((recipe) => [
      `## ${recipe.title}`,
      `- Type: ${recipe.tag}`,
      `- Carb signal: ${recipe.carbSignal}`,
      `- Source: ${recipe.source}`,
      `- Base: ${recipe.base}`,
      `- Protein: ${recipe.protein}`,
      `- Vehicle: ${recipe.vehicle}`,
      `- Updated: ${recipe.updatedAt}`,
      '',
    ]),
  ].join('\n')
}

function relativeDateLabel(dateIso: string, referenceDateIso: string) {
  if (dateIso === referenceDateIso) return 'Today'
  if (dateIso === shiftDate(referenceDateIso, -1)) return 'Yesterday'
  return dateIso
}

function metricStatus(value: number | null | undefined, goodFloor: number, watchFloor: number) {
  if (value == null) return 'Missing' as const
  if (value >= goodFloor) return 'Good' as const
  if (value >= watchFloor) return 'Watch' as const
  return 'Missing' as const
}

function formatFitbitSyncStamp(iso: string | null) {
  if (!iso) return 'No Fitbit sync yet'
  const stamp = new Date(iso)
  if (Number.isNaN(stamp.getTime())) return 'No Fitbit sync yet'

  return `Last Fitbit sync ${new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(stamp)}`
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [clock, setClock] = useState(() => new Date())
  const [selectedFastingPlan, setSelectedFastingPlan] = useState(storedFastingPlanInitialValue)
  const [isPlanPickerOpen, setIsPlanPickerOpen] = useState(false)
  const [focusedPlan, setFocusedPlan] = useState<FastingPlan | null>(null)
  const [activeChallenge, setActiveChallenge] = useState<ActiveChallengeState | null>(challengeStateInitialValue)
  const [focusedChallengeId, setFocusedChallengeId] = useState<string | null>(null)
  const [editingTimeField, setEditingTimeField] = useState<'start' | 'end' | null>(null)
  const [timeDraftDate, setTimeDraftDate] = useState(todayIso)
  const [timeDraftTime, setTimeDraftTime] = useState(plannedFastStartInitialValue)
  const [activeFastStartIso, setActiveFastStartIso] = useState<string | null>(activeFastInitialValue)
  const [plannedFastStartTime, setPlannedFastStartTime] = useState(plannedFastStartInitialValue)
  const [fastingHistory, setFastingHistory] = useState(storedFastingHistoryInitialValue)
  const [workoutLog, setWorkoutLog] = useState(storedWorkoutLogInitialValue)
  const [liftProgress, setLiftProgress] = useState(storedLiftProgressInitialValue)
  const [mealTimelineByDate, setMealTimelineByDate] = useState(storedMealTimelineInitialValue)
  const [recipeFilter, setRecipeFilter] = useState<(typeof RECIPE_FILTERS)[number]>('All')
  const [recipes, setRecipes] = useState(storedRecipesInitialValue)
  const [editingMealId, setEditingMealId] = useState<string | null>(null)
  const [mealDraft, setMealDraft] = useState<MealDraft>(emptyMealDraft)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(emptyRecipeDraft)
  const [isRecipeSyncing, setIsRecipeSyncing] = useState(false)
  const [recipeSyncMessage, setRecipeSyncMessage] = useState(
    NOTION_SYNC_ENDPOINT
      ? 'Notion auto-sync is ready.'
      : 'Notion auto-sync needs the private API URL. Local saving is active.',
  )
  const [cloudSyncMessage, setCloudSyncMessage] = useState(
    hasSupabaseConfig ? 'Cloud sync ready. Loading shared LifeOS data.' : 'Cloud sync not configured. Using local device storage.',
  )
  const [fitbitBridge, setFitbitBridge] = useState<FitbitBridgeState>({
    connected: false,
    lastSyncedAt: null,
    latestMetrics: null,
  })
  const [fitbitMessage, setFitbitMessage] = useState('Fitbit bridge not connected yet.')
  const [isFitbitSyncing, setIsFitbitSyncing] = useState(false)
  const hasHydratedCloudState = useRef(false)
  const isApplyingCloudState = useRef(false)
  const cloudHydrationInFlight = useRef(false)
  const mealEditorRef = useRef<HTMLFormElement | null>(null)
  const recipeEditorRef = useRef<HTMLFormElement | null>(null)
  const storedCustomPlan = useMemo(() => storedCustomPlanInitialValue(), [])
  const [customFastingHours, setCustomFastingHours] = useState(storedCustomPlan.fastingHours)
  const [customEatingHours, setCustomEatingHours] = useState(storedCustomPlan.eatingHours)
  const customPlan = useMemo<FastingPlan>(
    () => ({
      id: `custom-${customFastingHours}-${customEatingHours}`,
      protocol: 'Custom',
      title: customEatingHours > 0 ? `${customFastingHours}:${customEatingHours}` : `${customFastingHours}h`,
      fastingHours: customFastingHours,
      eatingHours: customEatingHours,
      level: 'Custom',
      note: 'Custom LifeOS plan',
    }),
    [customEatingHours, customFastingHours],
  )
  const todayPlan = useMemo(
    () => getPlanForDate(selectedDate, clock, selectedFastingPlan),
    [selectedDate, clock, selectedFastingPlan],
  )
  const plannedFastStart = useMemo(
    () => dateAtClockTime(selectedDate, plannedFastStartTime),
    [plannedFastStartTime, selectedDate],
  )
  const plannedFastEnd = useMemo(
    () => addHours(plannedFastStart, selectedFastingPlan.fastingHours),
    [plannedFastStart, selectedFastingPlan.fastingHours],
  )
  const plannedEatingEnd = useMemo(
    () => addHours(plannedFastEnd, selectedFastingPlan.eatingHours),
    [plannedFastEnd, selectedFastingPlan.eatingHours],
  )
  const plannedEatingWindow =
    selectedFastingPlan.eatingHours > 0
      ? `${formatClockTime(plannedFastEnd)}-${formatClockTime(plannedEatingEnd)}`
      : 'No eating'
  const timeDraftOptions = useMemo(() => timeOptionsWithValue(timeDraftTime), [timeDraftTime])
  const timeDraftDateOptions = useMemo(
    () =>
      uniqueSortedDates([
        selectedDate,
        shiftDate(selectedDate, 1),
        shiftDate(selectedDate, 2),
        isoFromLocalDate(plannedFastStart),
        isoFromLocalDate(plannedFastEnd),
        timeDraftDate,
      ]),
    [plannedFastEnd, plannedFastStart, selectedDate, timeDraftDate],
  )
  const weekPreview = useMemo(() => getWeekPreview(selectedDate), [selectedDate])
  const { meals, workout, priorities } = todayPlan
  const fitbitMetricsForSelectedDate = useMemo(
    () =>
      fitbitBridge.latestMetrics && fitbitBridge.latestMetrics.date === selectedDate
        ? fitbitBridge.latestMetrics
        : null,
    [fitbitBridge.latestMetrics, selectedDate],
  )
  const log = useMemo(() => {
    if (!fitbitMetricsForSelectedDate) return todayPlan.log

    const merged = {
      ...todayPlan.log,
      sleepHours: fitbitMetricsForSelectedDate.sleep_hours ?? todayPlan.log.sleepHours,
      sleepScore: fitbitMetricsForSelectedDate.sleep_score ?? todayPlan.log.sleepScore,
      restingHeartRate: fitbitMetricsForSelectedDate.resting_heart_rate ?? todayPlan.log.restingHeartRate,
      steps: fitbitMetricsForSelectedDate.steps ?? todayPlan.log.steps,
      activeZoneMinutes: fitbitMetricsForSelectedDate.active_zone_minutes ?? todayPlan.log.activeZoneMinutes,
      caloriesBurned: fitbitMetricsForSelectedDate.calories_burned ?? todayPlan.log.caloriesBurned,
      weightKg: fitbitMetricsForSelectedDate.weight_kg ?? todayPlan.log.weightKg,
    }

    return {
      ...merged,
      readiness: computeReadiness({
        sleepHours: merged.sleepHours,
        restingHeartRate: merged.restingHeartRate,
      }),
    }
  }, [fitbitMetricsForSelectedDate, todayPlan.log])
  const syncMetrics = useMemo<SyncMetric[]>(() => {
    if (!fitbitMetricsForSelectedDate) return todayPlan.syncMetrics

    return [
      {
        label: 'Sleep',
        value:
          fitbitMetricsForSelectedDate.sleep_hours != null
            ? fitbitMetricsForSelectedDate.sleep_hours.toFixed(1)
            : '--',
        unit: 'h',
        status: metricStatus(fitbitMetricsForSelectedDate.sleep_hours, 7, 6),
      },
      {
        label: 'Sleep score',
        value:
          fitbitMetricsForSelectedDate.sleep_score != null
            ? `${fitbitMetricsForSelectedDate.sleep_score}`
            : '--',
        status: fitbitMetricsForSelectedDate.sleep_score != null ? 'Watch' : 'Missing',
      },
      {
        label: 'Resting HR',
        value:
          fitbitMetricsForSelectedDate.resting_heart_rate != null
            ? `${fitbitMetricsForSelectedDate.resting_heart_rate}`
            : '--',
        unit: 'bpm',
        status:
          fitbitMetricsForSelectedDate.resting_heart_rate == null
            ? 'Missing'
            : fitbitMetricsForSelectedDate.resting_heart_rate <= 75
              ? 'Good'
              : 'Watch',
      },
      {
        label: 'Steps',
        value:
          fitbitMetricsForSelectedDate.steps != null
            ? fitbitMetricsForSelectedDate.steps.toLocaleString('en-NG')
            : '--',
        status:
          fitbitMetricsForSelectedDate.steps == null
            ? 'Missing'
            : fitbitMetricsForSelectedDate.steps >= DAILY_STEP_GOAL
              ? 'Good'
              : 'Watch',
      },
      {
        label: 'Zone mins',
        value:
          fitbitMetricsForSelectedDate.active_zone_minutes != null
            ? `${fitbitMetricsForSelectedDate.active_zone_minutes}`
            : '--',
        status:
          fitbitMetricsForSelectedDate.active_zone_minutes == null
            ? 'Missing'
            : fitbitMetricsForSelectedDate.active_zone_minutes >= 20
              ? 'Good'
              : 'Watch',
      },
      {
        label: 'Weight',
        value:
          fitbitMetricsForSelectedDate.weight_kg != null
            ? fitbitMetricsForSelectedDate.weight_kg.toFixed(1)
            : '--',
        unit: 'kg',
        status: fitbitMetricsForSelectedDate.weight_kg != null ? 'Watch' : 'Missing',
      },
    ]
  }, [fitbitMetricsForSelectedDate, todayPlan.syncMetrics])
  const displayedMeals = mealTimelineByDate[selectedDate] ?? meals
  const isTodaySelected = selectedDate === todayIso()
  const isLiveFastActive = Boolean(activeFastStartIso && isTodaySelected)
  const fasting = useMemo<FastingSession>(() => {
    if (!activeFastStartIso || !isTodaySelected) {
      return {
        ...todayPlan.fasting,
        status: 'Eating Window',
        targetEndAt: formatClockTime(plannedFastEnd),
        eatingWindow: plannedEatingWindow,
        elapsedHours: 0,
      }
    }

    const startedAt = new Date(activeFastStartIso)
    const elapsedHours = Math.max(
      0,
      Math.min(FASTING_PHASE_MAX_HOURS, (clock.getTime() - startedAt.getTime()) / (1000 * 60 * 60)),
    )
    const targetEnd = new Date(startedAt.getTime() + selectedFastingPlan.fastingHours * 60 * 60 * 1000)
    const eatingEnd = new Date(targetEnd.getTime() + selectedFastingPlan.eatingHours * 60 * 60 * 1000)

    return {
      protocol: selectedFastingPlan.protocol,
      status: elapsedHours >= selectedFastingPlan.fastingHours ? 'Eating Window' : 'Fasting',
      startedAt: formatClockTime(startedAt),
      targetEndAt: formatClockTime(targetEnd),
      eatingWindow:
        selectedFastingPlan.eatingHours > 0 ? `${formatClockTime(targetEnd)}-${formatClockTime(eatingEnd)}` : 'No eating',
      targetHours: selectedFastingPlan.fastingHours,
      elapsedHours,
    }
  }, [activeFastStartIso, clock, isTodaySelected, plannedEatingWindow, plannedFastEnd, selectedFastingPlan, todayPlan.fasting])
  const fastingPhases = useMemo(() => getFastingPhasesForElapsed(fasting.elapsedHours), [fasting.elapsedHours])
  const progress = isLiveFastActive ? fastingProgress(fasting) : 0
  const activeFastingPhase = fastingPhases.find((phase) => phase.status === 'Active') ?? fastingPhases[0]
  const ringTargetHours = Math.min(fasting.targetHours, FASTING_PHASE_MAX_HOURS)
  const ringPhaseMarkers = fastingPhases.filter((phase) => phase.startsAtHour <= ringTargetHours)
  const phaseMapProgress = isLiveFastActive ? Math.min(100, (fasting.elapsedHours / ringTargetHours) * 100) : 0
  const phasePointerAngle = isLiveFastActive ? progress * 3.6 : 0
  const completedDays = weekPreview.filter((day) => day.type === 'Fasting/Healthy' && day.date <= selectedDate).length
  const recipeCounts = useMemo(
    () =>
      RECIPE_FILTERS.reduce(
        (counts, filter) => ({
          ...counts,
          [filter]: filter === 'All' ? recipes.length : recipes.filter((recipe) => recipe.carbSignal === filter).length,
        }),
        {} as Record<(typeof RECIPE_FILTERS)[number], number>,
      ),
    [recipes],
  )
  const filteredRecipes = useMemo(
    () => recipes.filter((recipe) => recipeFilter === 'All' || recipe.carbSignal === recipeFilter),
    [recipeFilter, recipes],
  )
  const recipeAdvisory = useMemo(() => buildRecipeAdvisory(recipeDraft), [recipeDraft])
  const fastingStats = useMemo(() => {
    const completedSessions = fastingHistory.length
    const longestFast = fastingHistory.reduce((max, session) => Math.max(max, session.actualHours), 0)
    const fastingDays = new Set(fastingHistory.map((session) => session.completedOn)).size
    const averageFast =
      completedSessions > 0
        ? fastingHistory.reduce((sum, session) => sum + session.actualHours, 0) / completedSessions
        : 0
    const currentWeekDates = Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, -index))
    const weeklySessions = fastingHistory.filter((session) => currentWeekDates.includes(session.completedOn)).length
    const currentMonthPrefix = selectedDate.slice(0, 7)
    const monthlySessions = fastingHistory.filter((session) => session.completedOn.startsWith(currentMonthPrefix)).length
    const protocolBreakdown = Object.entries(
      fastingHistory.reduce(
        (breakdown, session) => ({
          ...breakdown,
          [session.protocol]: (breakdown[session.protocol] ?? 0) + 1,
        }),
        {} as Record<string, number>,
      ),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)

    return {
      completedSessions,
      fastingDays,
      longestFast,
      averageFast,
      weeklySessions,
      monthlySessions,
      protocolBreakdown,
    }
  }, [fastingHistory, selectedDate])
  const workoutStats = useMemo(() => {
    const completedSessions = workoutLog.filter((entry) => entry.status === 'Done')
    const skippedSessions = workoutLog.filter((entry) => entry.status === 'Skipped')
    const currentWeekDates = Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, -index))
    const weeklyCompletions = completedSessions.filter((entry) => currentWeekDates.includes(entry.date)).length
    const weeklySkips = skippedSessions.filter((entry) => currentWeekDates.includes(entry.date)).length
    const currentMonthPrefix = selectedDate.slice(0, 7)
    const monthlyCompletions = completedSessions.filter((entry) => entry.date.startsWith(currentMonthPrefix)).length
    const recentSessions = completedSessions.slice(0, 3)
    const planBreakdown = Object.entries(
      completedSessions.reduce(
        (breakdown, entry) => ({
          ...breakdown,
          [entry.plan]: (breakdown[entry.plan] ?? 0) + 1,
        }),
        {} as Record<string, number>,
      ),
    )
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)

    return {
      totalSessions: completedSessions.length,
      weeklyCompletions,
      weeklySkips,
      monthlyCompletions,
      recentSessions,
      skippedSessions: skippedSessions.length,
      planBreakdown,
    }
  }, [selectedDate, workoutLog])
  const progressSummary = useMemo(
    () => ({
      fastingStreak: consecutiveDayCount(fastingHistory.map((session) => session.completedOn)),
      trainingStreak: consecutiveDayCount(
        workoutLog.filter((entry) => entry.status === 'Done').map((entry) => entry.date),
      ),
      topLiftChanges: Object.values(liftProgress)
        .sort((left, right) => right.weight - left.weight)
        .slice(0, 5),
    }),
    [fastingHistory, liftProgress, workoutLog],
  )
  const activeChallengeDefinition = useMemo(
    () => FASTING_CHALLENGES.find((challenge) => challenge.id === activeChallenge?.challengeId) ?? null,
    [activeChallenge],
  )
  const challengeSnapshot = useMemo(() => {
    if (!activeChallengeDefinition || !activeChallenge) return null

    const deadline = shiftDate(activeChallenge.startedOn, activeChallengeDefinition.durationDays - 1)
    const qualifiedFasts = fastingHistory.filter(
      (entry) =>
        entry.actualHours >= activeChallengeDefinition.minimumFastHours &&
        dateIsoToAnchor(entry.completedOn).getTime() >= dateIsoToAnchor(activeChallenge.startedOn).getTime() &&
        dateIsoToAnchor(entry.completedOn).getTime() <= dateIsoToAnchor(deadline).getTime(),
    )
    const progressCount = qualifiedFasts.length
    const completed = progressCount >= activeChallengeDefinition.targetFasts
    const expired = dateIsoToAnchor(selectedDate).getTime() > dateIsoToAnchor(deadline).getTime()
    const status = completed ? 'Completed' : expired ? 'Incomplete' : 'Active'

    return {
      challenge: activeChallengeDefinition,
      startedOn: activeChallenge.startedOn,
      deadline,
      progressCount,
      progressPercent: Math.min(100, (progressCount / activeChallengeDefinition.targetFasts) * 100),
      remaining: Math.max(0, activeChallengeDefinition.targetFasts - progressCount),
      status,
      qualifiedFasts,
    }
  }, [activeChallenge, activeChallengeDefinition, fastingHistory, selectedDate])
  const focusedChallenge = useMemo(
    () =>
      FASTING_CHALLENGES.find(
        (challenge) => challenge.id === (focusedChallengeId ?? activeChallengeDefinition?.id ?? FASTING_CHALLENGES[2].id),
      ) ?? FASTING_CHALLENGES[2],
    [activeChallengeDefinition?.id, focusedChallengeId],
  )
  const focusedPlanProfile = useMemo(() => (focusedPlan ? fastingPlanProfile(focusedPlan) : null), [focusedPlan])
  const mainLiftProgress = useMemo(
    () =>
      workout.lifts
        .filter((lift) => Boolean(liftProgress[lift]))
        .map((lift) => liftProgress[lift]),
    [liftProgress, workout.lifts],
  )
  const loggedWorkoutForSelectedDay = useMemo(
    () => workoutLog.find((entry) => entry.date === selectedDate && entry.plan === workout.plan),
    [selectedDate, workout.plan, workoutLog],
  )
  const healthConnectSetup = useMemo(
    () => [
      {
        step: 'Phone app ready',
        status: 'Done',
        detail: 'Health Connect is already installed on your Android phone.',
      },
      {
        step: 'Fitbit permission handshake',
        status: 'Next',
        detail: 'Fitbit must be allowed to write sleep, heart rate, steps, weight, and workouts into Health Connect.',
      },
      {
        step: 'LifeOS capture layer',
        status: 'Build next',
        detail: 'LifeOS needs either an Android wrapper or a small companion sync service to read Health Connect data safely.',
      },
      {
        step: 'Daily review flow',
        status: 'Then',
        detail: 'Imported signals should land in Sync Inbox first, then feed readiness, fasting review, and workout recovery.',
      },
    ],
    [],
  )
  const nutritionRules = [
    {
      label: 'Plate rule',
      value: 'Protein + soup or stew + low-carb vehicle',
      detail: 'Soups include efo riro, okro, egusi and ewedu. Stew covers pepper/tomato stew.',
    },
    {
      label: 'Protein fallback',
      value: 'Eggs, gizzard, chicken laps',
      detail: 'Use these before expensive croaker or alaran when market price jumps.',
    },
    {
      label: 'Good fat',
      value: 'Avocado, groundnut, olive oil',
      detail: 'Small, deliberate fat portions to make fasting supper satisfying.',
    },
    {
      label: 'Avoid',
      value: 'Prawns, catfish, crayfish',
      detail: 'Also avoid afang, ogbono, oha, nsala, miyan kuka/taushe and tuwo shinkafa.',
    },
  ]

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeFastStartIso) {
      window.localStorage.setItem(ACTIVE_FAST_STORAGE_KEY, activeFastStartIso)
      return
    }

    window.localStorage.removeItem(ACTIVE_FAST_STORAGE_KEY)
  }, [activeFastStartIso])

  useEffect(() => {
    window.localStorage.setItem(FASTING_PLAN_STORAGE_KEY, JSON.stringify(selectedFastingPlan))
  }, [selectedFastingPlan])

  useEffect(() => {
    if (activeChallenge) {
      window.localStorage.setItem(ACTIVE_CHALLENGE_STORAGE_KEY, JSON.stringify(activeChallenge))
      return
    }

    window.localStorage.removeItem(ACTIVE_CHALLENGE_STORAGE_KEY)
  }, [activeChallenge])

  useEffect(() => {
    window.localStorage.setItem(PLANNED_FAST_START_TIME_STORAGE_KEY, plannedFastStartTime)
  }, [plannedFastStartTime])

  useEffect(() => {
    window.localStorage.setItem(
      CUSTOM_PLAN_STORAGE_KEY,
      JSON.stringify({ fastingHours: customFastingHours, eatingHours: customEatingHours }),
    )
  }, [customEatingHours, customFastingHours])

  useEffect(() => {
    window.localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(recipes))
  }, [recipes])

  useEffect(() => {
    window.localStorage.setItem(FASTING_HISTORY_STORAGE_KEY, JSON.stringify(fastingHistory))
  }, [fastingHistory])

  useEffect(() => {
    window.localStorage.setItem(WORKOUT_LOG_STORAGE_KEY, JSON.stringify(workoutLog))
  }, [workoutLog])

  useEffect(() => {
    window.localStorage.setItem(LIFT_PROGRESS_STORAGE_KEY, JSON.stringify(liftProgress))
  }, [liftProgress])

  useEffect(() => {
    window.localStorage.setItem(MEAL_TIMELINE_STORAGE_KEY, JSON.stringify(mealTimelineByDate))
  }, [mealTimelineByDate])

  useEffect(() => {
    if (!editingMealId) return
    window.requestAnimationFrame(() => {
      if (mealEditorRef.current) mealEditorRef.current.scrollTop = 0
    })
  }, [editingMealId])

  useEffect(() => {
    if (!editingRecipeId) return
    window.requestAnimationFrame(() => {
      if (recipeEditorRef.current) recipeEditorRef.current.scrollTop = 0
    })
  }, [editingRecipeId])

  const hydrateCloudState = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!hasSupabaseConfig || cloudHydrationInFlight.current) return

      cloudHydrationInFlight.current = true

      try {
        const cloudState = await fetchLifeOsCloudState()
        if (!cloudState) return

        const cloudHasAnyRows =
          cloudState.fastingSessions.length > 0 ||
          cloudState.workoutLogs.length > 0 ||
          cloudState.mealTimelines.length > 0 ||
          cloudState.recipes.length > 0 ||
          cloudState.liftProgress.length > 0

        if (mode === 'initial' && !cloudHasAnyRows) {
          setCloudSyncMessage('Cloud sync active. Waiting for first shared LifeOS changes.')
          return
        }

        isApplyingCloudState.current = true

        setFastingHistory(cloudState.fastingSessions.map(fastingRowToRecord))
        setWorkoutLog(cloudState.workoutLogs.map(workoutRowToEntry))
        setMealTimelineByDate(rowsToMealTimelineMap(cloudState.mealTimelines))
        setRecipes(cloudState.recipes.map(rowToRecipe))
        setLiftProgress(
          cloudState.liftProgress.length > 0
            ? rowsToLiftProgressMap(cloudState.liftProgress)
            : DEFAULT_LIFT_PROGRESS,
        )

        window.setTimeout(() => {
          isApplyingCloudState.current = false
        }, 0)

        setCloudSyncMessage('Cloud sync active. Mobile and desktop can now share the same LifeOS data.')
      } catch (error) {
        isApplyingCloudState.current = false
        const message = error instanceof Error ? error.message : 'Unknown cloud sync error'
        setCloudSyncMessage(`Cloud sync could not load: ${message}`)
      } finally {
        hasHydratedCloudState.current = true
        cloudHydrationInFlight.current = false
      }
    },
    [],
  )

  useEffect(() => {
    if (!hasSupabaseConfig) {
      hasHydratedCloudState.current = true
      return
    }

    const initialLoadId = window.setTimeout(() => {
      void hydrateCloudState('initial')
    }, 0)

    const stopSubscription = subscribeToLifeOsCloudState(() => {
      void hydrateCloudState('refresh')
    })

    const pollId = window.setInterval(() => {
      void hydrateCloudState('refresh')
    }, 15000)

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        void hydrateCloudState('refresh')
      }
    }

    const handleFocusSync = () => {
      void hydrateCloudState('refresh')
    }

    document.addEventListener('visibilitychange', handleVisibilitySync)
    window.addEventListener('focus', handleFocusSync)

    return () => {
      window.clearTimeout(initialLoadId)
      stopSubscription()
      window.clearInterval(pollId)
      document.removeEventListener('visibilitychange', handleVisibilitySync)
      window.removeEventListener('focus', handleFocusSync)
    }
  }, [hydrateCloudState])

  useEffect(() => {
    if (!hasSupabaseConfig || !hasHydratedCloudState.current || isApplyingCloudState.current) return

    let cancelled = false

    async function pushCloudState() {
      try {
        await syncLifeOsCloudState({
          fastingSessions: fastingHistory.map(fastingRecordToRow),
          workoutLogs: workoutLog.map(workoutLogToRow),
          mealTimelines: mealTimelineMapToRows(mealTimelineByDate),
          recipes: recipes.map(recipeToRow),
          liftProgress: liftProgressToRows(liftProgress),
        })

        if (!cancelled) {
          setCloudSyncMessage('Cloud sync active. Latest LifeOS changes are shared across devices.')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown cloud sync error'
        if (!cancelled) {
          setCloudSyncMessage(`Cloud sync failed: ${message}`)
        }
      }
    }

    void pushCloudState()

    return () => {
      cancelled = true
    }
  }, [fastingHistory, workoutLog, mealTimelineByDate, recipes, liftProgress])

  const loadFitbitBridgeStatus = useCallback(async () => {
    try {
      const response = await fetch(HEALTH_STATUS_ENDPOINT, { method: 'GET' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load Google Health bridge status')
      }

      setFitbitBridge({
        connected: Boolean(payload.connected),
        lastSyncedAt: payload.lastSyncedAt ?? null,
        latestMetrics: payload.latestMetrics ?? null,
      })
      setFitbitMessage(
        payload.connected
          ? formatFitbitSyncStamp(payload.lastSyncedAt ?? payload.latestMetrics?.synced_at ?? null)
          : 'Google Health bridge ready to connect. This will feed Fitbit and other supported health signals into the dashboard.',
      )
    } catch (error) {
      setFitbitMessage(error instanceof Error ? error.message : 'Could not load Google Health bridge status.')
    }
  }, [])

  useEffect(() => {
    const bootLoadId = window.setTimeout(() => {
      void loadFitbitBridgeStatus()
    }, 0)

    const params = new URLSearchParams(window.location.search)
    const fitbitState = params.get('fitbit')
    const fitbitError = params.get('message')
    const callbackLoadId = window.setTimeout(() => {
    if (fitbitState === 'connected') {
        setFitbitMessage('Google Health connected. Pulling the latest dashboard metrics now.')
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
        void loadFitbitBridgeStatus()
      } else if (fitbitState === 'error') {
        setFitbitMessage(fitbitError ?? 'Google Health connection did not complete cleanly.')
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      }
    }, 0)
    return () => {
      window.clearTimeout(bootLoadId)
      window.clearTimeout(callbackLoadId)
    }
  }, [loadFitbitBridgeStatus])

  async function syncFitbitBridgeNow() {
    setIsFitbitSyncing(true)
    try {
      const response = await fetch(HEALTH_SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Google Health sync failed')
      }

      setFitbitBridge({
        connected: true,
        lastSyncedAt: payload.metrics?.synced_at ?? new Date().toISOString(),
        latestMetrics: payload.metrics ?? null,
      })
      setFitbitMessage(formatFitbitSyncStamp(payload.metrics?.synced_at ?? new Date().toISOString()))
    } catch (error) {
      setFitbitMessage(error instanceof Error ? error.message : 'Google Health sync failed.')
    } finally {
      setIsFitbitSyncing(false)
    }
  }

  function connectFitbitBridge() {
    const healthWindow = window.open(HEALTH_CONNECT_ENDPOINT, '_blank', 'noopener,noreferrer')
    if (!healthWindow) {
      window.location.href = HEALTH_CONNECT_ENDPOINT
      return
    }
    setFitbitMessage('Google Health opened in a new tab. Complete sign-in there, then return here.')

    const statusPoll = window.setInterval(() => {
      void loadFitbitBridgeStatus()

      if (healthWindow.closed) {
        window.clearInterval(statusPoll)
        void loadFitbitBridgeStatus()
      }
    }, 2000)
  }

  function handleFastAction() {
    if (isLiveFastActive && activeFastStartIso) {
      const now = new Date()
      const startedAt = new Date(activeFastStartIso)
      const actualHours = Math.max(0, (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60))

      setFastingHistory((history) => [
        {
          id: completedFastId(),
          protocol: selectedFastingPlan.protocol,
          plannedHours: selectedFastingPlan.fastingHours,
          actualHours: Number(actualHours.toFixed(2)),
          startedAtIso: startedAt.toISOString(),
          endedAtIso: now.toISOString(),
          completedOn: isoFromLocalDate(now),
        },
        ...history,
      ])
      setActiveFastStartIso(null)
      setClock(now)
      return
    }

    const now = new Date()
    setSelectedDate(todayIso())
    setClock(now)
    setActiveFastStartIso(now.toISOString())
  }

  function jumpToSection(targetId: SignalCardTarget) {
    const element = document.getElementById(targetId)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openChallengeDetails(challengeId?: string) {
    setFocusedChallengeId(challengeId ?? activeChallengeDefinition?.id ?? FASTING_CHALLENGES[2].id)
  }

  function joinChallenge(challengeId: string) {
    setActiveChallenge({
      challengeId,
      startedOn: todayIso(),
    })
    setFocusedChallengeId(challengeId)
  }

  function restartActiveChallenge() {
    if (!activeChallengeDefinition) return
    setActiveChallenge({
      challengeId: activeChallengeDefinition.id,
      startedOn: todayIso(),
    })
    setFocusedChallengeId(activeChallengeDefinition.id)
  }

  function toggleWorkoutLog(status: WorkoutLogEntry['status'] = 'Done') {
    if (workout.plan === 'Rest') return

    setWorkoutLog((history) => {
      const existing = history.find((entry) => entry.date === selectedDate && entry.plan === workout.plan)

      if (existing && status === 'Done') {
        return history.filter((entry) => entry.id !== existing.id)
      }

      const nextEntry: WorkoutLogEntry = {
        id: existing?.id ?? workoutLogId(),
        date: selectedDate,
        plan: workout.plan,
        focus: workout.focus,
        status,
        completedAtIso: new Date().toISOString(),
      }

      return [nextEntry, ...history.filter((entry) => entry.id !== existing?.id)]
    })
  }

  function adjustLiftProgress(label: string, nextWeight: number) {
    setLiftProgress((history) => ({
      ...history,
      [label]: {
        ...(history[label] ?? DEFAULT_LIFT_PROGRESS[label]),
        label,
        weight: Math.max(45, nextWeight),
        updatedAtIso: new Date().toISOString(),
      },
    }))
  }

  function logLiftSuccess(label: string) {
    const current = liftProgress[label] ?? DEFAULT_LIFT_PROGRESS[label]
    if (!current) return
    setLiftProgress((history) => ({
      ...history,
      [label]: {
        ...current,
        weight: current.weight + current.increment,
        failures: 0,
        updatedAtIso: new Date().toISOString(),
      },
    }))
  }

  function logLiftFailure(label: string) {
    const current = liftProgress[label] ?? DEFAULT_LIFT_PROGRESS[label]
    if (!current) return
    setLiftProgress((history) => ({
      ...history,
      [label]: {
        ...current,
        failures: Math.min(3, current.failures + 1),
        updatedAtIso: new Date().toISOString(),
      },
    }))
  }

  function deloadLift(label: string) {
    const current = liftProgress[label] ?? DEFAULT_LIFT_PROGRESS[label]
    if (!current) return
    const deloadedWeight = Math.max(45, Math.round((current.weight * 0.9) / 5) * 5)
    setLiftProgress((history) => ({
      ...history,
      [label]: {
        ...current,
        weight: deloadedWeight,
        failures: 0,
        updatedAtIso: new Date().toISOString(),
      },
    }))
  }

  function openTimeEditor(field: 'start' | 'end') {
    const date = field === 'start' ? plannedFastStart : plannedFastEnd
    setTimeDraftDate(isoFromLocalDate(date))
    setTimeDraftTime(formatTimeInput(date))
    setEditingTimeField(field)
  }

  function saveTimeEditor() {
    if (!editingTimeField || !isTimeInput(timeDraftTime)) return

    if (editingTimeField === 'start') {
      setSelectedDate(timeDraftDate)
      setPlannedFastStartTime(timeDraftTime)
      setEditingTimeField(null)
      return
    }

    const intendedEnd = dateAtClockTime(timeDraftDate, timeDraftTime)
    const adjustedStart = addHours(intendedEnd, -selectedFastingPlan.fastingHours)
    setSelectedDate(isoFromLocalDate(adjustedStart))
    setPlannedFastStartTime(formatTimeInput(adjustedStart))
    setEditingTimeField(null)
  }

  function openRecipeEditor(recipe?: Recipe) {
    setRecipeDraft(recipe ? recipeToDraft(recipe) : emptyRecipeDraft())
    setEditingRecipeId(recipe?.id ?? 'new')
  }

  function openMealEditor(meal?: MealPlanItem) {
    setMealDraft(meal ? mealToDraft(meal) : emptyMealDraft())
    setEditingMealId(meal?.id ?? 'new')
  }

  function saveMeal() {
    const nextMeal: MealPlanItem = {
      id: editingMealId && editingMealId !== 'new' ? editingMealId : mealItemId(),
      time: mealDraft.time.trim(),
      title: mealDraft.title.trim(),
      role: mealDraft.role,
      status: mealDraft.status,
      carbSignal: mealDraft.carbSignal,
      items: mealDraft.items.filter(Boolean),
      budgetBackup: mealDraft.budgetBackup?.trim() || undefined,
    }

    if (!nextMeal.title || nextMeal.items.length === 0) return

    setMealTimelineByDate((history) => {
      const baseMeals = history[selectedDate] ?? displayedMeals
      const nextMeals =
        editingMealId && editingMealId !== 'new'
          ? baseMeals.map((meal) => (meal.id === editingMealId ? nextMeal : meal))
          : [...baseMeals, nextMeal]

      return {
        ...history,
        [selectedDate]: nextMeals,
      }
    })
    setEditingMealId(null)
  }

  function deleteMeal(mealId: string) {
    setMealTimelineByDate((history) => {
      const baseMeals = history[selectedDate] ?? displayedMeals
      const nextMeals = baseMeals.filter((meal) => meal.id !== mealId)
      if (nextMeals.length === 0) {
        const rest = { ...history }
        delete rest[selectedDate]
        return rest
      }
      return {
        ...history,
        [selectedDate]: nextMeals,
      }
    })
  }

  function resetMealsForDate() {
    setMealTimelineByDate((history) => {
      const rest = { ...history }
      delete rest[selectedDate]
      return rest
    })
    setEditingMealId(null)
  }

  async function syncRecipesToNotion(nextRecipes: Recipe[]) {
    if (!NOTION_SYNC_ENDPOINT) {
      setRecipeSyncMessage('Saved locally. Add VITE_LIFEOS_SYNC_API_URL to enable Notion auto-sync.')
      return
    }

    setIsRecipeSyncing(true)
    setRecipeSyncMessage('Syncing recipes to Notion...')

    try {
      const response = await fetch(NOTION_SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipes: nextRecipes }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || `Notion sync failed with ${response.status}`)
      }

      setRecipeSyncMessage(`Synced ${nextRecipes.length} recipes to Notion.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error'
      setRecipeSyncMessage(`Saved locally, but Notion sync failed: ${message}`)
    } finally {
      setIsRecipeSyncing(false)
    }
  }

  function saveRecipe() {
    const trimmedDraft = {
      ...recipeDraft,
      title: recipeDraft.title.trim(),
      tag: recipeDraft.tag.trim() || 'Custom',
      base: recipeDraft.base.trim(),
      protein: recipeDraft.protein.trim(),
      vehicle: recipeDraft.vehicle.trim(),
    }

    if (!trimmedDraft.title || !trimmedDraft.base) return

    const updatedAt = todayIso()
    const nextRecipes: Recipe[] = (() => {
      if (editingRecipeId && editingRecipeId !== 'new') {
        return recipes.map((recipe) =>
          recipe.id === editingRecipeId
            ? {
                ...recipe,
                ...trimmedDraft,
                source: recipe.source,
                updatedAt,
              }
            : recipe,
        )
      }

      return [
        {
          id: recipeId(),
          ...trimmedDraft,
          source: 'Custom' as const,
          updatedAt,
        },
        ...recipes,
      ]
    })()

    setRecipes(nextRecipes)
    setRecipeSyncMessage('Saved locally. Sending recipe to Notion.')
    setEditingRecipeId(null)
    void syncRecipesToNotion(nextRecipes)
  }

  async function copyRecipesForNotion() {
    try {
      await window.navigator.clipboard.writeText(recipesToNotionMarkdown(recipes))
      setRecipeSyncMessage('Copied Notion packet. Paste it into your Notion Recipes page/database.')
    } catch {
      setRecipeSyncMessage('Copy was blocked by the browser. The recipes are still saved locally.')
    }
  }

  const mealToneBreakdown = useMemo(
    () =>
      displayedMeals.reduce(
        (summary, meal) => ({
          ...summary,
          [meal.carbSignal.toLowerCase()]: summary[meal.carbSignal.toLowerCase() as 'low' | 'medium' | 'relax'] + 1,
        }),
        { low: 0, medium: 0, relax: 0 },
      ),
    [displayedMeals],
  )
  const nextMealSlot = displayedMeals[0]
  const topRecipeCount = recipes.filter((recipe) => recipe.carbSignal === 'Low').length
  const syncStatusLabel = hasSupabaseConfig ? 'Cloud live' : 'Local only'
  const sleepHours = log.sleepHours ?? 0
  const sleepScore = log.sleepScore ?? 0
  const restingHeartRate = log.restingHeartRate ?? 0
  const sleepMetric = syncMetrics.find((metric) => metric.label === 'Sleep')
  const stepsMetric = syncMetrics.find((metric) => metric.label === 'Steps')
  const zoneMetric = syncMetrics.find((metric) => metric.label === 'Zone mins')
  const restingHrMetric = syncMetrics.find((metric) => metric.label === 'Resting HR')
  const currentSteps = Number(String(stepsMetric?.value ?? '0').replace(/,/g, '')) || 0
  const stepGoalHit = currentSteps >= DAILY_STEP_GOAL
  const remainingSteps = Math.max(0, DAILY_STEP_GOAL - currentSteps)
  const stepGoalProgress = Math.min(100, Math.round((currentSteps / DAILY_STEP_GOAL) * 100))
  const formattedStepGoal = DAILY_STEP_GOAL.toLocaleString()
  const recoverySignal = useMemo(() => {
    const workoutStatus = loggedWorkoutForSelectedDay?.status ?? null

    if (log.readiness === 'Green' && workoutStatus === 'Done') {
      return {
        value: 'Trained as planned',
        trend: 'good' as const,
        detail: `${workout.plan} was completed on a green-readiness day.`,
        cta: 'Good day to keep progression moving.',
      }
    }

    if (log.readiness === 'Green' && workoutStatus === 'Skipped') {
      return {
        value: 'Planned training missed',
        trend: 'watch' as const,
        detail: `${workout.plan} was skipped even though readiness was green.`,
        cta: 'Review what blocked the session and reset tomorrow cleanly.',
      }
    }

    if (log.readiness === 'Yellow' && workoutStatus === 'Done') {
      return {
        value: 'Managed load',
        trend: 'neutral' as const,
        detail: `${workout.plan} was completed on a yellow-readiness day.`,
        cta: 'Solid call if form stayed tight and load stayed honest.',
      }
    }

    if (log.readiness === 'Red' && workoutStatus === 'Skipped') {
      return {
        value: 'Recovery respected',
        trend: 'good' as const,
        detail: `${workout.plan} was skipped on a red-readiness day.`,
        cta: 'That is the right kind of discipline. Recover, then come back stronger.',
      }
    }

    if (log.readiness === 'Red' && workoutStatus === 'Done') {
      return {
        value: 'Pushed through recovery',
        trend: 'watch' as const,
        detail: `${workout.plan} was completed despite red readiness.`,
        cta: 'Watch recovery closely before loading hard again.',
      }
    }

    if (log.readiness === 'Yellow' && workoutStatus === 'Skipped') {
      return {
        value: 'Held back today',
        trend: 'neutral' as const,
        detail: `${workout.plan} was skipped on a yellow-readiness day.`,
        cta: 'Okay if fatigue was real. Just avoid turning caution into drift.',
      }
    }

    return {
      value: readinessLabel(log.readiness),
      trend: (log.readiness === 'Red' ? 'watch' : log.readiness === 'Yellow' ? 'neutral' : 'good') as
        | 'watch'
        | 'neutral'
        | 'good',
      detail: `${log.dayType} day with ${sleepHours.toFixed(1)}h sleep and ${sleepScore} sleep score.`,
      cta: priorities[0],
    }
  }, [
    log.dayType,
    log.readiness,
    loggedWorkoutForSelectedDay?.status,
    priorities,
    sleepHours,
    sleepScore,
    workout.plan,
  ])

  const commandSignals = [
    {
      role: 'day',
      label: 'Recovery',
      value: recoverySignal.value,
      detail: recoverySignal.detail,
      trend: recoverySignal.trend,
      targetId: 'day-overview' as const,
      eyebrow: log.readiness,
      metrics: [
        { label: 'Sleep', value: `${sleepHours.toFixed(1)}h` },
        { label: 'Score', value: `${sleepScore}` },
        { label: 'RHR', value: `${restingHeartRate}` },
      ],
      cta: recoverySignal.cta,
    },
    {
      role: 'nutrition',
      label: 'Nutrition',
      value: log.nutritionMode,
      detail:
        nextMealSlot != null
          ? `${nextMealSlot.time || 'Flexible'} ${nextMealSlot.title}`
          : 'No meal slots set yet for this day.',
      trend: mealToneBreakdown.relax > 0 ? 'watch' : 'good',
      targetId: 'nutrition' as const,
      eyebrow: `${displayedMeals.length} eating decisions`,
      metrics: [
        { label: 'Low', value: `${mealToneBreakdown.low}` },
        { label: 'Medium', value: `${mealToneBreakdown.medium}` },
        { label: 'Recipes', value: `${topRecipeCount}` },
      ],
      cta: 'Protein first, soup or stew, then a low-carb vehicle.',
    },
    {
      role: 'training',
      label: 'Training',
      value: workout.plan,
      detail: workout.focus,
      trend: workout.status === 'Optional' ? 'neutral' : 'good',
      targetId: 'fitness' as const,
      eyebrow: loggedWorkoutForSelectedDay?.status ?? workout.status,
      metrics: [
        { label: 'Main lifts', value: `${workout.lifts.length}` },
        { label: 'Accessories', value: `${workout.accessories.length}` },
        { label: 'Logged', value: loggedWorkoutForSelectedDay?.status === 'Done' ? 'Yes' : 'No' },
      ],
      cta:
        log.readiness === 'Green'
          ? 'Load can move today.'
          : log.readiness === 'Yellow'
            ? 'Keep form tight and hold load if needed.'
            : 'Recovery first. Technique or conditioning is enough.',
    },
    {
      role: 'sync',
      label: 'Readiness signals',
      value: syncStatusLabel,
      detail: stepGoalHit
        ? `Step floor cleared through your Google Health movement signal.`
        : `${remainingSteps.toLocaleString()} steps left to hit the ${formattedStepGoal}-step floor.`,
      trend: hasSupabaseConfig ? (stepGoalHit ? 'good' : 'neutral') : 'watch',
      targetId: 'sync' as const,
      eyebrow: 'Google Health / Health Connect',
      metrics: [
        { label: 'Sleep', value: sleepMetric ? `${sleepMetric.value}${sleepMetric.unit ?? ''}` : '--' },
        { label: 'Steps', value: currentSteps > 0 ? currentSteps.toLocaleString() : '--' },
        { label: 'Zone', value: zoneMetric?.value ?? '--' },
      ],
      cta: stepGoalHit
        ? `Daily movement floor achieved. ${restingHrMetric ? `Resting HR is ${restingHrMetric.value}${restingHrMetric.unit ?? ''}.` : ''}`.trim()
        : `Google Health data is now the cleanest web-app path for verifying whether today reaches your step minimum.`,
    },
  ] as const

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="LifeOS navigation">
        <div className="brand-lockup">
          <div className="brand-mark">
            <HeartPulse size={24} aria-hidden="true" />
          </div>
          <div>
            <p>LifeOS</p>
            <span>Health command center</span>
          </div>
        </div>

        <nav>
          <a href="#today" className="active">
            <Gauge size={18} aria-hidden="true" />
            Today
          </a>
          <a href="#fasting">
            <TimerReset size={18} aria-hidden="true" />
            Fasting
          </a>
          <a href="#meals">
            <Utensils size={18} aria-hidden="true" />
            Meals
          </a>
          <a href="#recipes">
            <BookOpen size={18} aria-hidden="true" />
            Recipes
          </a>
          <a href="#fitness">
            <Dumbbell size={18} aria-hidden="true" />
            Fitness
          </a>
          <a href="#progress">
            <CircleCheck size={18} aria-hidden="true" />
            Progress
          </a>
          <a href="#sync">
            <Smartphone size={18} aria-hidden="true" />
            Sync
          </a>
          <a href="#fasting-phases">
            <Flame size={18} aria-hidden="true" />
            Fast Phases
          </a>
          <a href={NOTION_LIFEOS_URL} target="_blank" rel="noreferrer">
            <Database size={18} aria-hidden="true" />
            Notion
            <ExternalLink className="nav-external" size={14} aria-hidden="true" />
          </a>
          <a href={LEARNING_PORTAL_URL}>
            <BookOpen size={18} aria-hidden="true" />
            Portal
            <ExternalLink className="nav-external" size={14} aria-hidden="true" />
          </a>
        </nav>
      </aside>

      <nav className="mobile-tabbar" aria-label="LifeOS mobile navigation">
        <a href="#fasting" className="active">
          <TimerReset size={21} aria-hidden="true" />
          Fasting
        </a>
        <a href="#meals">
          <Utensils size={21} aria-hidden="true" />
          Meals
        </a>
        <a href="#recipes">
          <BookOpen size={21} aria-hidden="true" />
          Recipes
        </a>
        <a href="#fitness">
          <Dumbbell size={21} aria-hidden="true" />
          Training
        </a>
        <a href="#progress">
          <CircleCheck size={21} aria-hidden="true" />
          Track
        </a>
        <a href="#me">
          <HeartPulse size={21} aria-hidden="true" />
          Me
        </a>
      </nav>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Lifelong rhythm</span>
            <h1>Today Command Center</h1>
          </div>
          <div className="topbar-actions">
            <a className="portal-switch" href={LEARNING_PORTAL_URL}>
              <BookOpen size={17} aria-hidden="true" />
              Portal
            </a>
            <div className={`readiness readiness-${log.readiness.toLowerCase()}`}>
              <span>{log.readiness}</span>
              <strong>{readinessLabel(log.readiness)}</strong>
            </div>
          </div>
        </header>

        <section id="day-overview" className="date-console" aria-label="Plan date controls">
          <div>
            <span className="eyebrow">{log.day}</span>
            <strong>{log.date}</strong>
            <p>{log.dayType} · {selectedFastingPlan.title} · {workout.plan}</p>
          </div>
          <div className="date-actions">
            <button type="button" onClick={() => setSelectedDate((date) => shiftDate(date, -1))}>
              Previous
            </button>
            <button type="button" onClick={() => setSelectedDate(todayIso())}>
              Today
            </button>
            <button type="button" onClick={() => setSelectedDate((date) => shiftDate(date, 1))}>
              Next
            </button>
          </div>
        </section>

        <section className="week-strip" aria-label="Seven day rhythm preview">
          {weekPreview.map((day) => (
            <button
              className={day.date === selectedDate ? 'active' : ''}
              type="button"
              key={day.date}
              onClick={() => setSelectedDate(day.date)}
            >
              <span>{day.day}</span>
              <strong>{day.date.slice(5)}</strong>
              <small>{day.type}</small>
            </button>
          ))}
        </section>

        <section id="today" className="hero-grid">
          <article id="fasting" className={`fast-card ${isLiveFastActive ? 'fast-card-live' : 'fast-card-ready'}`}>
            <div className="fast-card-top">
              <div className="card-header">
                <TimerReset size={22} aria-hidden="true" />
                <span>Fasting core</span>
              </div>
              <div className="fast-streak-pill">
                <CircleCheck size={16} aria-hidden="true" />
                <strong>{completedDays}</strong>
              </div>
              <button
                className="fast-add-button"
                type="button"
                aria-label="Choose fasting plan"
                onClick={() => setIsPlanPickerOpen(true)}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="fast-week" aria-label="Weekly fasting rhythm">
              {weekPreview.map((day) => (
                <button
                  type="button"
                  className={day.date === selectedDate ? 'active' : ''}
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                >
                  <span>{day.day}</span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>

            {!isLiveFastActive ? (
              <div className="fast-prep-heading">
                <span>Eating window</span>
                <strong>Get ready to fast</strong>
              </div>
            ) : null}

            <div
              className="fast-ring"
              style={
                {
                  '--fast-progress': `${progress}%`,
                  '--phase-map-progress': `${phaseMapProgress}%`,
                  '--phase-pointer-angle': `${phasePointerAngle}deg`,
                } as CSSProperties
              }
              aria-label={`Fasting progress ${progress} percent`}
            >
              <div className="fast-plan-target" aria-label={`${formatTargetHours(fasting.targetHours)} hour fast`}>
                <strong>{formatTargetHours(fasting.targetHours)}</strong>
                <span>h</span>
              </div>
              <div className="phase-pointer" aria-hidden="true">
                <Flame size={17} />
              </div>
              {ringPhaseMarkers.map((phase) => (
                <a
                  href="#fasting-phases"
                  className={`phase-tick phase-tick-${phase.status.toLowerCase()}`}
                  key={phase.id}
                  style={
                    {
                      '--marker-angle': `${Math.min(360, (phase.startsAtHour / ringTargetHours) * 360)}deg`,
                    } as CSSProperties
                  }
                  title={phase.name}
                  aria-label={`Jump to ${phase.name} fasting phase`}
                >
                  {phase.status === 'Active' ? <Flame size={13} /> : null}
                </a>
              ))}
              <div className="fast-ring-center">
                {isLiveFastActive ? (
                  <>
                    <strong className="ring-progress-label">{progress}%</strong>
                    <Flame size={42} aria-hidden="true" />
                    <span>{formatFastHours(fasting.elapsedHours)}</span>
                    <small>{activeFastingPhase.name}</small>
                  </>
                ) : (
                  <>
                    <button
                      className="fast-protocol-chip"
                      type="button"
                      onClick={() => setIsPlanPickerOpen(true)}
                      aria-label="Choose fasting plan"
                    >
                      {selectedFastingPlan.title}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    <small>Supposed to start at</small>
                    <span className="prep-start-time">{formatClockTime(plannedFastStart)}</span>
                  </>
                )}
              </div>
              {!isLiveFastActive ? (
                <button className="ring-start-action" type="button" onClick={handleFastAction}>
                  Start Fasting
                </button>
              ) : null}
            </div>
            <div className="fast-meta">
              <p>
                <span className="fast-meta-label">Start time</span>
                {isLiveFastActive ? (
                  <strong>{fasting.startedAt}</strong>
                ) : (
                  <div className="fast-time-control">
                    <button
                      type="button"
                      className="fast-time-trigger"
                      aria-expanded={editingTimeField === 'start'}
                      aria-label="Edit intended fast start time"
                      onClick={() => openTimeEditor('start')}
                    >
                      <strong>{formatRelativeDay(plannedFastStart, clock)}, {formatClockTime(plannedFastStart)}</strong>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </p>
              <p>
                <span className="fast-meta-label">End time</span>
                {isLiveFastActive ? (
                  <strong>{fasting.targetEndAt}</strong>
                ) : (
                  <div className="fast-time-control">
                    <button
                      type="button"
                      className="fast-time-trigger"
                      aria-expanded={editingTimeField === 'end'}
                      aria-label="Edit intended fast end time"
                      onClick={() => openTimeEditor('end')}
                    >
                      <strong>{formatRelativeDay(plannedFastEnd, clock)}, {formatClockTime(plannedFastEnd)}</strong>
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </p>
            </div>
            {isLiveFastActive ? <div className="fast-note">
              <strong>{selectedFastingPlan.title}</strong>
              <span>
                {selectedFastingPlan.fastingHours}h fasting
                {selectedFastingPlan.eatingHours > 0 ? ` · ${selectedFastingPlan.eatingHours}h eating` : ' · no eating'}
              </span>
            </div> : null}
            {isLiveFastActive ? <button
                className={`fast-primary-action action-${fasting.status.toLowerCase().replace(' ', '-')}`}
                type="button"
                onClick={handleFastAction}
              >
                {fastActionLabel(fasting.status)}
              </button> : null}
            {isLiveFastActive ? <div className="phase-callout">
              <span>{isLiveFastActive ? 'Current phase' : 'Next fast'}</span>
              <strong>{isLiveFastActive ? activeFastingPhase.name : `Ready for ${selectedFastingPlan.title}`}</strong>
              <p>
                {isLiveFastActive
                  ? activeFastingPhase.essence
                  : `Planned start is ${formatRelativeDayTime(plannedFastStart, clock)}. Expected end is ${formatRelativeDayTime(plannedFastEnd, clock)}.`}
              </p>
            </div> : null}
          </article>

          <div className="signal-grid" aria-label="Daily command dashboard">
            {commandSignals.map((signal) => (
              <button
                className={`signal-card signal-card-button signal-${signal.trend} signal-role-${signal.role}`}
                key={signal.label}
                type="button"
                onClick={() => jumpToSection(signal.targetId)}
              >
                <div className="signal-card-head">
                  <span>{signal.label}</span>
                  <small>{signal.eyebrow}</small>
                </div>
                <strong>{signal.value}</strong>
                <p>{signal.detail}</p>
                <div className="signal-metric-row">
                  {signal.metrics.map((metric) => (
                    <div className="signal-metric-chip" key={`${signal.label}-${metric.label}`}>
                      <small>{metric.label}</small>
                      <span>{metric.value}</span>
                    </div>
                  ))}
                </div>
                <div className="signal-card-footer">
                  <small>{signal.cta}</small>
                  <ChevronRight size={16} aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="content-grid">
          <section className="fitness-log-row">
            <article id="fitness" className="panel workout-panel">
              <div className="panel-title">
                <Dumbbell size={20} aria-hidden="true" />
                <h2>Training</h2>
              </div>
              <div className="workout-status">
                <span>{workout.status}</span>
                <strong>{workout.focus}</strong>
              </div>
              <div className="workout-stack">
                <div className="workout-row">
                  <span>Main work</span>
                  <ul>
                    {workout.lifts.map((lift) => (
                      <li key={lift}>{lift}</li>
                    ))}
                  </ul>
                </div>
                <div className="workout-row">
                  <span>Accessories</span>
                  <ul>
                    {workout.accessories.map((accessory) => (
                      <li key={accessory}>{accessory}</li>
                    ))}
                  </ul>
                  {workout.conditioning ? <p>{workout.conditioning}</p> : null}
                </div>
              </div>
              {mainLiftProgress.length > 0 ? (
                <div className="lift-progress-grid">
                  {mainLiftProgress.map((lift) => (
                    <section className="lift-progress-card" key={lift.label}>
                      <span>{lift.label}</span>
                      <strong>{lift.weight} lb</strong>
                      <p>
                        Next jump: +{lift.increment} lb after a solid session.
                        {lift.failures > 0 ? ` Failed attempts: ${lift.failures}.` : ''}
                      </p>
                      <div className="lift-progress-actions">
                        <button type="button" onClick={() => adjustLiftProgress(lift.label, lift.weight - lift.increment)}>
                          -{lift.increment}
                        </button>
                        <button type="button" onClick={() => logLiftSuccess(lift.label)}>
                          Hit it
                        </button>
                        <button type="button" onClick={() => adjustLiftProgress(lift.label, lift.weight + lift.increment)}>
                          +{lift.increment}
                        </button>
                      </div>
                      <div className="lift-progress-actions secondary-actions">
                        <button type="button" onClick={() => logLiftFailure(lift.label)}>
                          Missed rep
                        </button>
                        <button type="button" onClick={() => deloadLift(lift.label)}>
                          Deload 10%
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
              <div className="workout-action-row">
                <button type="button" className="workout-primary-button" onClick={() => toggleWorkoutLog('Done')}>
                  {loggedWorkoutForSelectedDay?.status === 'Done' ? 'Undo workout log' : 'Mark workout done'}
                </button>
                <button type="button" className="workout-secondary-button" onClick={() => toggleWorkoutLog('Skipped')}>
                  Mark skipped
                </button>
              </div>
              <p className="workout-log-note">
                {loggedWorkoutForSelectedDay
                  ? `${loggedWorkoutForSelectedDay.status} on ${relativeDateLabel(loggedWorkoutForSelectedDay.date, selectedDate)} for ${loggedWorkoutForSelectedDay.plan}.`
                  : 'No training log saved yet for this day.'}
              </p>
            </article>

            <article className="panel compact-panel workout-log-panel">
              <div className="panel-title">
                <CircleCheck size={20} aria-hidden="true" />
                <h2>Workout Log</h2>
              </div>
              <div className="workout-log-stats">
                <section>
                  <span>This week</span>
                  <strong>{workoutStats.weeklyCompletions}</strong>
                </section>
                <section>
                  <span>Total logged</span>
                  <strong>{workoutStats.totalSessions}</strong>
                </section>
              </div>
                <div className="workout-log-list">
                  {workoutStats.recentSessions.length > 0 ? (
                    workoutStats.recentSessions.map((entry) => (
                      <article className="workout-log-entry" key={entry.id}>
                        <strong>{entry.plan}</strong>
                        <span>{relativeDateLabel(entry.date, selectedDate)}</span>
                        <p>{entry.focus}</p>
                      </article>
                    ))
                  ) : (
                  <p className="muted">Your recent completed training sessions will appear here.</p>
                )}
              </div>
            </article>
          </section>

          <article id="meals" className="panel meals-panel">
            <div className="panel-title">
              <Apple size={20} aria-hidden="true" />
              <h2>Meal Timeline</h2>
            </div>
            <div className="meal-actions">
              <button type="button" onClick={() => openMealEditor()}>
                <Plus size={16} aria-hidden="true" />
                Add meal slot
              </button>
              <button type="button" onClick={resetMealsForDate} disabled={!mealTimelineByDate[selectedDate]}>
                Reset this day
              </button>
            </div>
            <p className="meal-timeline-note">
              This timeline is editable per day, so your fast can break in the morning, afternoon, or night depending on the plan.
            </p>
            <div className="meal-stack">
              {displayedMeals.map((meal) => (
                <section className={`meal-row carb-${meal.carbSignal.toLowerCase()}`} key={meal.id}>
                  <div className="meal-time">
                    <strong>{meal.time || 'Flexible'}</strong>
                    <span>{meal.role}</span>
                  </div>
                  <div>
                    <div className="meal-heading">
                      <h3>{meal.title}</h3>
                      <span>{meal.status}</span>
                    </div>
                    <p>{meal.items.join(', ')}</p>
                    {meal.budgetBackup ? <small>{meal.budgetBackup}</small> : null}
                    <div className="meal-row-actions">
                      <button type="button" onClick={() => openMealEditor(meal)}>
                        <Pencil size={14} aria-hidden="true" />
                        Edit
                      </button>
                      <button type="button" onClick={() => deleteMeal(meal.id)}>
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </article>

          <article id="nutrition" className="panel nutrition-command-panel">
            <div className="panel-title">
              <Utensils size={20} aria-hidden="true" />
              <h2>Nutrition Command</h2>
            </div>
            <div className="nutrition-rule-grid">
              {nutritionRules.map((rule) => (
                <section className={`nutrition-rule ${rule.label === 'Avoid' ? 'nutrition-avoid' : ''}`} key={rule.label}>
                  <span>{rule.label}</span>
                  <strong>{rule.value}</strong>
                  <p>{rule.detail}</p>
                </section>
              ))}
            </div>
          </article>

          <article id="challenges" className={`panel compact-panel challenge-panel challenge-${challengeTone((challengeSnapshot?.challenge.accent ?? focusedChallenge.accent))}`}>
            <div className="panel-title">
              <Trophy size={20} aria-hidden="true" />
              <h2>Monthly challenge</h2>
            </div>
            <div className="challenge-card-hero">
              <span>{challengeSnapshot ? challengeSnapshot.status : 'Ready'}</span>
              <strong>{challengeSnapshot?.challenge.title ?? focusedChallenge.title}</strong>
              <p>{challengeSnapshot?.challenge.subtitle ?? focusedChallenge.subtitle}</p>
            </div>
            <div className="challenge-progress-strip">
              <div className="challenge-progress-track">
                <div
                  className="challenge-progress-fill"
                  style={{ width: `${challengeSnapshot?.progressPercent ?? 0}%` }}
                />
              </div>
              <p>
                Progress: {challengeSnapshot?.progressCount ?? 0}/
                {challengeSnapshot?.challenge.targetFasts ?? focusedChallenge.targetFasts}
              </p>
            </div>
            <div className="challenge-summary-grid">
              <section>
                <span>Window</span>
                <strong>{challengeSnapshot?.challenge.durationDays ?? focusedChallenge.durationDays} days</strong>
              </section>
              <section>
                <span>Target</span>
                <strong>{challengeSnapshot?.challenge.targetFasts ?? focusedChallenge.targetFasts} fasts</strong>
              </section>
              <section>
                <span>Reward</span>
                <strong>{challengeSnapshot?.challenge.reward ?? focusedChallenge.reward}</strong>
              </section>
            </div>
            <div className="challenge-card-actions">
              <button type="button" className="challenge-primary-button" onClick={() => openChallengeDetails()}>
                {challengeSnapshot ? 'Open challenge' : 'Browse challenges'}
              </button>
              {challengeSnapshot ? (
                <button type="button" className="challenge-secondary-button" onClick={restartActiveChallenge}>
                  Restart
                </button>
              ) : null}
            </div>
            <a className="challenge-portal-link" href={LEARNING_PORTAL_URL}>
              Portal monthly challenges
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </article>

          <article id="recipes" className="panel recipes-panel">
            <div className="panel-title">
              <BookOpen size={20} aria-hidden="true" />
              <h2>Recipes</h2>
            </div>
            <p className="recipes-intro">
              Low-carb meals first, medium-carb meals controlled, relax foods clearly marked.
            </p>
            <p className="recipe-sync-note">{recipeSyncMessage}</p>
            <div className="recipe-action-row">
              <button type="button" onClick={() => openRecipeEditor()}>
                <Plus size={16} aria-hidden="true" />
                Custom recipe
              </button>
              <button type="button" onClick={() => void syncRecipesToNotion(recipes)} disabled={isRecipeSyncing}>
                <Database size={16} aria-hidden="true" />
                {isRecipeSyncing ? 'Syncing...' : 'Sync Notion'}
              </button>
              <button type="button" onClick={copyRecipesForNotion}>
                <Database size={16} aria-hidden="true" />
                Copy Notion update
              </button>
            </div>
            <div className="recipe-filter-row" aria-label="Recipe filter">
              {RECIPE_FILTERS.map((filter) => (
                <button
                  className={recipeFilter === filter ? 'active' : ''}
                  type="button"
                  key={filter}
                  onClick={() => setRecipeFilter(filter)}
                >
                  <span>{filter}</span>
                  <strong>{recipeCounts[filter]}</strong>
                </button>
              ))}
            </div>
            <div className="recipe-grid">
              {filteredRecipes.map((recipe) => (
                <section className={`recipe-card recipe-${recipe.carbSignal.toLowerCase()}`} key={recipe.title}>
                  <div className="recipe-card-top">
                    <span>{recipe.tag}</span>
                    <strong>{recipe.carbSignal}</strong>
                  </div>
                  <h3>{recipe.title}</h3>
                  <p>{recipe.base}</p>
                  <small>{recipe.protein}</small>
                  <small>{recipe.vehicle}</small>
                  <div className="recipe-advisory-list">
                    {buildRecipeAdvisory(recipe).map((advisory) => (
                      <small className="recipe-advisory" key={advisory}>
                        {advisory}
                      </small>
                    ))}
                  </div>
                  <button className="recipe-edit-button" type="button" onClick={() => openRecipeEditor(recipe)}>
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </button>
                </section>
              ))}
            </div>
          </article>

          <article id="fasting-phases" className="panel fasting-phases-panel">
            <div className="panel-title">
              <Flame size={20} aria-hidden="true" />
              <h2>Fasting Phases 0-96h</h2>
            </div>
            <p className="phase-disclaimer">
              Phase timing is approximate. Food choice, training, sleep, insulin sensitivity, and fast length can move the
              boundaries.
            </p>
            <div className="phase-stack">
              {fastingPhases.map((phase) => (
                <section className={`phase-row phase-${phase.status.toLowerCase()}`} key={phase.id}>
                  <div className="phase-marker">
                    {phase.status === 'Active' ? <ChevronRight size={18} aria-hidden="true" /> : null}
                    <strong>{phase.window}</strong>
                    <span>{phase.status}</span>
                  </div>
                  <div>
                    <h3>{phase.name}</h3>
                    <p>{phase.essence}</p>
                    <small>{phase.healthNote}</small>
                    <small className="phase-source">{phase.sourceNote}</small>
                  </div>
                </section>
              ))}
            </div>
          </article>

          <article className="panel compact-panel fasting-records-panel">
            <div className="panel-title">
              <TimerReset size={20} aria-hidden="true" />
              <h2>Fasting Records</h2>
            </div>
            <div className="fasting-records-stats">
              <section>
                <span>Longest</span>
                <strong>{formatTargetHours(fastingStats.longestFast)}h</strong>
              </section>
              <section>
                <span>Days logged</span>
                <strong>{fastingStats.fastingDays}</strong>
              </section>
              <section>
                <span>Completed</span>
                <strong>{fastingStats.completedSessions}</strong>
              </section>
            </div>
            <div className="fasting-trend-grid">
              <section className="fasting-trend-card">
                <span>This week</span>
                <strong>{fastingStats.weeklySessions}</strong>
                <p>Completed fasts across the last 7 days.</p>
              </section>
              <section className="fasting-trend-card">
                <span>This month</span>
                <strong>{fastingStats.monthlySessions}</strong>
                <p>Completed fasts in the current month.</p>
              </section>
            </div>
            <div className="protocol-breakdown-list">
              {fastingStats.protocolBreakdown.length > 0 ? (
                fastingStats.protocolBreakdown.map(([protocol, count]) => (
                  <article className="protocol-breakdown-entry" key={protocol}>
                    <span>{protocol}</span>
                    <strong>{count}</strong>
                  </article>
                ))
              ) : (
                <p className="muted">Protocol mix will appear once you complete a few fasts.</p>
              )}
            </div>
            <div className="fasting-record-list">
              {fastingHistory.slice(0, 4).map((entry) => (
                <article className="fasting-record-entry" key={entry.id}>
                  <span>{relativeDateLabel(entry.completedOn, selectedDate)}</span>
                  <strong>{entry.protocol}</strong>
                  <p>Actual {formatTargetHours(entry.actualHours)}h · Planned {formatTargetHours(entry.plannedHours)}h</p>
                </article>
              ))}
              {fastingHistory.length === 0 ? <p className="muted">Completed fasts will start building your record here.</p> : null}
            </div>
          </article>

          <article id="sync" className="panel sync-panel">
            <div className="panel-title">
              <Smartphone size={20} aria-hidden="true" />
              <h2>Health Sync Inbox</h2>
            </div>
            <p className="sync-roadmap-note">{cloudSyncMessage}</p>
            <div className="sync-summary">
              <section className="sync-summary-card">
                <span>Google Health bridge</span>
                <strong>{fitbitBridge.connected ? 'Connected' : 'Not connected'}</strong>
                <p>{fitbitMessage}</p>
                <div className="fitbit-action-row">
                  <button type="button" className="fitbit-primary-button" onClick={connectFitbitBridge}>
                    {fitbitBridge.connected ? 'Reconnect Google Health' : 'Connect Google Health'}
                  </button>
                  <button
                    type="button"
                    className="fitbit-secondary-button"
                    onClick={() => void syncFitbitBridgeNow()}
                    disabled={!fitbitBridge.connected || isFitbitSyncing}
                  >
                    {isFitbitSyncing ? 'Syncing…' : 'Sync latest'}
                  </button>
                </div>
              </section>
              <section className="sync-summary-card">
                <span>Bridge status</span>
                <strong>{hasSupabaseConfig ? 'Cloud sync connected' : 'Cloud sync not configured'}</strong>
                <p>
                  Shared data now depends on Supabase env keys plus the tables you already created for LifeOS.
                </p>
              </section>
              <section className="sync-summary-card">
                <span>Recipe sync</span>
                <strong>Ready to retest</strong>
                <p>Current target is the LifeOS Recipes Notion database through the Vercel API bridge.</p>
              </section>
            </div>
            <div className="metric-grid">
              {syncMetrics.map((metric) => (
                <div className={`metric-card metric-${metric.status.toLowerCase()}`} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>
                    {metric.value}
                    {metric.unit ? <small>{metric.unit}</small> : null}
                  </strong>
                </div>
              ))}
            </div>
            <section className={`step-goal-card ${stepGoalHit ? 'step-goal-hit' : 'step-goal-chasing'}`}>
              <div className="step-goal-head">
                <div>
                  <span>Daily step floor</span>
                  <strong>{formattedStepGoal} steps</strong>
                </div>
                <p>{stepGoalHit ? 'Achieved' : 'In progress'}</p>
              </div>
              <div className="step-goal-progress" aria-hidden="true">
                <div className="step-goal-fill" style={{ width: `${stepGoalProgress}%` }} />
              </div>
              <div className="step-goal-meta">
                <strong>{currentSteps.toLocaleString()}</strong>
                <span>
                  {stepGoalHit
                    ? 'Google Health says the movement floor is done for today.'
                    : `${remainingSteps.toLocaleString()} more steps needed to close the gap.`}
                </span>
              </div>
            </section>
            <div className="health-connect-panel">
              <div className="health-connect-header">
                <h3>Health Connect Path</h3>
                <p>The phone side is partly ready. For this web app, Google Health OAuth is the live path; Health Connect still needs an Android companion layer.</p>
              </div>
              <div className="health-connect-steps">
                {healthConnectSetup.map((item) => (
                  <section className={`health-connect-step step-${item.status.toLowerCase().replace(/\s+/g, '-')}`} key={item.step}>
                    <span>{item.status}</span>
                    <strong>{item.step}</strong>
                    <p>{item.detail}</p>
                  </section>
                ))}
              </div>
              <p className="sync-roadmap-note">
                Practical integration route: Google Health powers the web dashboard path, while Health Connect can still feed a future Android companion layer.
              </p>
            </div>
          </article>

          <article id="me" className="panel compact-panel priorities-panel">
            <div className="panel-title">
              <Moon size={20} aria-hidden="true" />
              <h2>Priorities</h2>
            </div>
            <ul className="rule-list">
              {priorities.map((priority) => (
                <li key={priority}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {priority}
                </li>
              ))}
            </ul>
          </article>

          <article className="panel compact-panel notion-panel">
            <div className="panel-title">
              <CalendarDays size={20} aria-hidden="true" />
              <h2>Notion Backbone</h2>
            </div>
            <p className="muted">
              Command Center captures the day. Notion remains the editable source of truth for the
              Daily Health Log, Fasting Sessions, Meal Plan, Workout Log, Exercise Library, Health
              Sync Inbox, and Weekly Reviews.
            </p>
          </article>

          <article id="progress" className="panel progress-panel">
            <div className="panel-title">
              <CircleCheck size={20} aria-hidden="true" />
              <h2>Progress</h2>
            </div>
            <div className="progress-grid">
              <section className="progress-block progress-fasting">
                <div className="progress-block-heading">
                  <span>Fasting progress</span>
                  <strong>{fastingStats.completedSessions} completed fasts</strong>
                </div>
                <div className="progress-stat-grid">
                  <article className="progress-stat-card">
                    <span>Current streak</span>
                    <strong>{progressSummary.fastingStreak} days</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>Longest fast</span>
                    <strong>{formatTargetHours(fastingStats.longestFast)}h</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>Average fast</span>
                    <strong>{formatTargetHours(fastingStats.averageFast)}h</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>This month</span>
                    <strong>{fastingStats.monthlySessions}</strong>
                  </article>
                </div>
                <div className="progress-subgrid">
                  <section className="progress-list-card">
                    <h3>Recent fasting records</h3>
                    <div className="progress-list">
                      {fastingHistory.slice(0, 5).map((entry) => (
                        <article className="progress-list-row" key={entry.id}>
                          <div>
                            <strong>{entry.protocol}</strong>
                            <p>{relativeDateLabel(entry.completedOn, selectedDate)}</p>
                          </div>
                          <span>{formatTargetHours(entry.actualHours)}h</span>
                        </article>
                      ))}
                      {fastingHistory.length === 0 ? <p className="muted">Your completed fasts will stack here.</p> : null}
                    </div>
                  </section>
                  <section className="progress-list-card">
                    <h3>Protocol mix</h3>
                    <div className="progress-list">
                      {fastingStats.protocolBreakdown.map(([protocol, count]) => (
                        <article className="progress-list-row" key={protocol}>
                          <div>
                            <strong>{protocol}</strong>
                            <p>Completed sessions</p>
                          </div>
                          <span>{count}</span>
                        </article>
                      ))}
                      {fastingStats.protocolBreakdown.length === 0 ? (
                        <p className="muted">Protocol mix will appear once you log a few fasts.</p>
                      ) : null}
                    </div>
                  </section>
                </div>
              </section>

              <section className="progress-block progress-training">
                <div className="progress-block-heading">
                  <span>Training progress</span>
                  <strong>{workoutStats.totalSessions} completed sessions</strong>
                </div>
                <div className="progress-stat-grid">
                  <article className="progress-stat-card">
                    <span>Current streak</span>
                    <strong>{progressSummary.trainingStreak} days</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>This week</span>
                    <strong>{workoutStats.weeklyCompletions}</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>This month</span>
                    <strong>{workoutStats.monthlyCompletions}</strong>
                  </article>
                  <article className="progress-stat-card">
                    <span>Skipped</span>
                    <strong>{workoutStats.skippedSessions}</strong>
                  </article>
                </div>
                <div className="progress-subgrid">
                  <section className="progress-list-card">
                    <h3>Recent workouts</h3>
                    <div className="progress-list">
                      {workoutLog.slice(0, 5).map((entry) => (
                        <article className="progress-list-row" key={entry.id}>
                          <div>
                            <strong>{entry.plan}</strong>
                            <p>
                              {relativeDateLabel(entry.date, selectedDate)} · {entry.focus}
                            </p>
                          </div>
                          <span>{entry.status}</span>
                        </article>
                      ))}
                      {workoutLog.length === 0 ? <p className="muted">Logged training sessions will show here.</p> : null}
                    </div>
                  </section>
                  <section className="progress-list-card">
                    <h3>Current working weights</h3>
                    <div className="progress-list">
                      {progressSummary.topLiftChanges.map((lift) => (
                        <article className="progress-list-row" key={lift.label}>
                          <div>
                            <strong>{lift.label}</strong>
                            <p>{lift.failures > 0 ? `${lift.failures} missed session markers` : 'Clean progression run'}</p>
                          </div>
                          <span>{lift.weight} lb</span>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="progress-list-card">
                    <h3>Workout mix</h3>
                    <div className="progress-list">
                      {workoutStats.planBreakdown.map(([plan, count]) => (
                        <article className="progress-list-row" key={plan}>
                          <div>
                            <strong>{plan}</strong>
                            <p>Completed sessions</p>
                          </div>
                          <span>{count}</span>
                        </article>
                      ))}
                      {workoutStats.planBreakdown.length === 0 ? (
                        <p className="muted">Once you log workouts, your plan mix will show up here.</p>
                      ) : null}
                    </div>
                  </section>
                </div>
                <p className="progress-note">
                  Weekly skips this cycle: {workoutStats.weeklySkips}. Use the lift cards in Training to mark wins,
                  missed reps, and deloads as they happen.
                </p>
              </section>
            </div>
          </article>
        </section>
      </section>

      {editingMealId ? (
        <section className="recipe-editor-backdrop" aria-label="Meal timeline editor">
          <form
            className="recipe-editor-sheet meal-editor-sheet"
            ref={mealEditorRef}
            onSubmit={(event) => {
              event.preventDefault()
              saveMeal()
            }}
          >
            <header className="recipe-editor-header">
              <div>
                <span className="eyebrow">{editingMealId === 'new' ? 'Meal slot' : 'Edit meal slot'}</span>
                <h2>{editingMealId === 'new' ? 'Add meal timeline slot' : 'Update meal timeline slot'}</h2>
              </div>
              <button type="button" onClick={() => setEditingMealId(null)} aria-label="Close meal editor">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="recipe-editor-grid">
              <label>
                Time
                <input
                  value={mealDraft.time}
                  onChange={(event) => setMealDraft((draft) => ({ ...draft, time: event.target.value }))}
                  placeholder="07:30 or Flexible"
                />
              </label>
              <label>
                Role
                <select
                  value={mealDraft.role}
                  onChange={(event) =>
                    setMealDraft((draft) => ({
                      ...draft,
                      role: event.target.value as MealPlanItem['role'],
                    }))
                  }
                >
                  {['Break fast', 'Main meal', 'Supper', 'Snack', 'Hydration'].map((role) => (
                    <option value={role} key={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={mealDraft.status}
                  onChange={(event) =>
                    setMealDraft((draft) => ({
                      ...draft,
                      status: event.target.value as MealPlanItem['status'],
                    }))
                  }
                >
                  {['Flexible', 'Planned', 'Done', 'Skipped'].map((status) => (
                    <option value={status} key={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Carb signal
                <select
                  value={mealDraft.carbSignal}
                  onChange={(event) =>
                    setMealDraft((draft) => ({
                      ...draft,
                      carbSignal: event.target.value as MealPlanItem['carbSignal'],
                    }))
                  }
                >
                  {RECIPE_CARB_SIGNALS.map((signal) => (
                    <option value={signal} key={signal}>
                      {signal}
                    </option>
                  ))}
                </select>
              </label>
              <label className="recipe-editor-wide">
                Title
                <input
                  value={mealDraft.title}
                  onChange={(event) => setMealDraft((draft) => ({ ...draft, title: event.target.value }))}
                  placeholder="Example: Afternoon break-fast bowl"
                  required
                />
              </label>
              <label className="recipe-editor-wide">
                Meal items
                <textarea
                  value={mealDraft.items.join(', ')}
                  onChange={(event) =>
                    setMealDraft((draft) => ({
                      ...draft,
                      items: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="Eggs, avocado, cucumber, okro soup"
                  required
                />
              </label>
              <label className="recipe-editor-wide">
                Budget backup / note
                <textarea
                  value={mealDraft.budgetBackup ?? ''}
                  onChange={(event) => setMealDraft((draft) => ({ ...draft, budgetBackup: event.target.value }))}
                  placeholder="Fallback or note for this meal slot"
                />
              </label>
            </div>

            <div className="recipe-editor-actions">
              <button type="button" onClick={() => setEditingMealId(null)}>
                Cancel
              </button>
              <button type="submit">Save meal slot</button>
            </div>
          </form>
        </section>
      ) : null}

      {editingRecipeId ? (
        <section className="recipe-editor-backdrop" aria-label="Recipe editor">
          <form
            className="recipe-editor-sheet"
            ref={recipeEditorRef}
            onSubmit={(event) => {
              event.preventDefault()
              saveRecipe()
            }}
          >
            <header className="recipe-editor-header">
              <div>
                <span className="eyebrow">{editingRecipeId === 'new' ? 'Custom option' : 'Edit recipe'}</span>
                <h2>{editingRecipeId === 'new' ? 'Add what you actually ate' : 'Update recipe'}</h2>
              </div>
              <button type="button" onClick={() => setEditingRecipeId(null)} aria-label="Close recipe editor">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="recipe-editor-grid">
              <label>
                Recipe name
                <input
                  value={recipeDraft.title}
                  onChange={(event) => setRecipeDraft((draft) => ({ ...draft, title: event.target.value }))}
                  placeholder="Example: ayamase eggs bowl"
                  required
                />
              </label>
              <label>
                Type
                <input
                  value={recipeDraft.tag}
                  onChange={(event) => setRecipeDraft((draft) => ({ ...draft, tag: event.target.value }))}
                  placeholder="Soup, Stew, Bowl..."
                />
              </label>
              <label>
                Carb signal
                <select
                  value={recipeDraft.carbSignal}
                  onChange={(event) =>
                    setRecipeDraft((draft) => ({
                      ...draft,
                      carbSignal: event.target.value as RecipeCarbSignal,
                    }))
                  }
                >
                  {RECIPE_CARB_SIGNALS.map((signal) => (
                    <option value={signal} key={signal}>
                      {signal}
                    </option>
                  ))}
                </select>
              </label>
              <label className="recipe-editor-wide">
                Base
                <textarea
                  value={recipeDraft.base}
                  onChange={(event) => setRecipeDraft((draft) => ({ ...draft, base: event.target.value }))}
                  placeholder="What is the main dish?"
                  required
                />
              </label>
              <label className="recipe-editor-wide">
                Protein
                <textarea
                  value={recipeDraft.protein}
                  onChange={(event) => setRecipeDraft((draft) => ({ ...draft, protein: event.target.value }))}
                  placeholder="Eggs, chicken, gizzard, alaran..."
                />
              </label>
              <label className="recipe-editor-wide">
                Vehicle / note
                <textarea
                  value={recipeDraft.vehicle}
                  onChange={(event) => setRecipeDraft((draft) => ({ ...draft, vehicle: event.target.value }))}
                  placeholder="Cauliflower rice, cabbage swallow, relax day..."
                />
              </label>
              <section className="recipe-editor-advisory">
                <span className="eyebrow">Advisory</span>
                <h3>How LifeOS will treat this recipe</h3>
                <ul className="recipe-editor-advisory-list">
                  {recipeAdvisory.length > 0 ? (
                    recipeAdvisory.map((advisory) => <li key={advisory}>{advisory}</li>)
                  ) : (
                    <li>This recipe fits the current rules cleanly.</li>
                  )}
                </ul>
              </section>
            </div>

            <div className="recipe-editor-actions">
              <button type="button" onClick={() => setEditingRecipeId(null)}>
                Cancel
              </button>
              <button type="submit">Save recipe</button>
            </div>
          </form>
        </section>
      ) : null}

      {isPlanPickerOpen ? (
        <section
          className="plan-picker-backdrop"
          aria-label="Fasting plan picker"
          onClick={() => {
            if (focusedPlan) {
              setFocusedPlan(null)
              return
            }
            setIsPlanPickerOpen(false)
          }}
        >
          <div className="plan-picker" onClick={(event) => event.stopPropagation()}>
            <header className="plan-picker-header">
              <div>
                <span className="eyebrow">Fasting type</span>
                <h2>Choose fasting plan</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFocusedPlan(null)
                  setIsPlanPickerOpen(false)
                }}
                aria-label="Close fasting plan picker"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <section className="tailored-plan">
              <div>
                <strong>Tailored Plan</strong>
                <p>Use your LifeOS rhythm, workout days, and usual meals to choose the fast you can repeat.</p>
              </div>
              <button type="button" onClick={() => setFocusedPlan(DEFAULT_FASTING_PLAN)}>
                Check
              </button>
            </section>

            <section className="custom-plan-builder">
              <div>
                <span className="eyebrow">Custom plan</span>
                <strong>{customPlan.title}</strong>
              </div>
              <label>
                Fast
                <input
                  min="1"
                  max="96"
                  type="number"
                  value={customFastingHours}
                  onChange={(event) => setCustomFastingHours(clampNumber(Number(event.target.value), 1, 96))}
                />
              </label>
              <label>
                Eat
                <input
                  min="0"
                  max="23"
                  type="number"
                  value={customEatingHours}
                  onChange={(event) => setCustomEatingHours(clampNumber(Number(event.target.value), 0, 23))}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSelectedFastingPlan(customPlan)
                  setFocusedPlan(null)
                  setIsPlanPickerOpen(false)
                }}
              >
                Apply
              </button>
            </section>

            <section className="fasting-stats-panel">
              <div className="plan-section-title">
                <h3>Advanced fasting records</h3>
                <p>Saved in this browser for now, until we wire a proper backend log.</p>
              </div>
              <div className="fasting-stats-grid">
                <article className="fasting-stat-card">
                  <span>Current plan</span>
                  <strong>{selectedFastingPlan.fastingHours}h</strong>
                </article>
                <article className="fasting-stat-card">
                  <span>Longest fast</span>
                  <strong>{formatTargetHours(fastingStats.longestFast)}h</strong>
                </article>
                <article className="fasting-stat-card">
                  <span>Fasting days</span>
                  <strong>{fastingStats.fastingDays}</strong>
                </article>
                <article className="fasting-stat-card">
                  <span>Completed fasts</span>
                  <strong>{fastingStats.completedSessions}</strong>
                </article>
              </div>
              <p className="fasting-stats-note">
                Average completed fast: {formatTargetHours(fastingStats.averageFast)}h. Current fast state,
                selected plan, custom plan, recipes, and completed fast records are being saved in local browser storage.
              </p>
            </section>

            <div className="plan-picker-body">
              {(['Hot', 'Basic', 'Intermediate', 'Advanced', 'Custom'] as const).map((level) => (
                <section className="plan-section" key={level}>
                  <div className="plan-section-title">
                    <h3>{level === 'Custom' ? 'Customized plans' : `${level} plans`}</h3>
                    <p>
                      {level === 'Hot'
                        ? 'Popular fasts'
                        : level === 'Basic'
                          ? 'Easy to get started'
                          : level === 'Intermediate'
                            ? 'Most people can build toward these'
                            : level === 'Advanced'
                              ? 'Challenging fasting windows'
                              : 'Create or test longer protocols'}
                    </p>
                  </div>
                  <div className="plan-grid">
                    {FASTING_PLANS.filter((plan) => plan.level === level).map((plan) => (
                      <button
                        type="button"
                        className={`plan-card plan-${planTone(plan.level)} ${
                          selectedFastingPlan.id === plan.id ? 'selected' : ''
                        }`}
                        key={plan.id}
                        onClick={() => {
                          setFocusedPlan(plan)
                        }}
                      >
                        <span>{plan.title}</span>
                        <p>{plan.fastingHours}h fasting</p>
                        <p>{plan.eatingHours > 0 ? `${plan.eatingHours}h eating` : 'No eating'}</p>
                        <strong>{plan.note}</strong>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          {focusedPlan ? (
            <div
              className="plan-detail-backdrop"
              onClick={(event) => {
                event.stopPropagation()
                setFocusedPlan(null)
              }}
            >
              <section
                className="plan-detail-sheet"
                aria-label={`${focusedPlan.title} fasting plan details`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="plan-detail-top">
                  <button type="button" className="plan-detail-back" onClick={() => setFocusedPlan(null)}>
                    <ChevronRight size={18} aria-hidden="true" />
                    Back
                  </button>
                  <span className={`plan-detail-follow ${selectedFastingPlan.id === focusedPlan.id ? 'is-following' : ''}`}>
                    {selectedFastingPlan.id === focusedPlan.id ? 'Following' : focusedPlan.level}
                  </span>
                </div>
                <div className="plan-detail-hero">
                  <h3>{focusedPlan.title}</h3>
                  <div className="plan-detail-window">
                    <p>{focusedPlan.fastingHours} h fasting</p>
                    <p>{focusedPlan.eatingHours > 0 ? `${focusedPlan.eatingHours} h eating` : 'No eating window'}</p>
                  </div>
                </div>
                <section className="plan-detail-section">
                  <h4>Benefits</h4>
                  <div className="plan-detail-list">
                    {focusedPlanProfile?.benefits.map((item) => (
                      <article className="plan-detail-item" key={`benefit-${item}`}>
                        <CheckCircle2 size={18} aria-hidden="true" />
                        <span>{item}</span>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="plan-detail-section plan-detail-dual">
                  <div className="plan-detail-box">
                    <h4>Suitable for</h4>
                    <ul>
                      {focusedPlanProfile?.suitableFor.map((item) => (
                        <li key={`suitable-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="plan-detail-box plan-detail-box-caution">
                    <h4>Not suitable for</h4>
                    <ul>
                      {focusedPlanProfile?.notSuitableFor.map((item) => (
                        <li key={`not-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </section>
                <section className="plan-detail-section">
                  <h4>Practical advice</h4>
                  <div className="plan-detail-list">
                    {focusedPlanProfile?.advice.map((item) => (
                      <article className="plan-detail-item" key={`advice-${item}`}>
                        <Flame size={18} aria-hidden="true" />
                        <span>{item}</span>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="plan-detail-section">
                  <h4>Health precautions</h4>
                  <div className="plan-detail-list">
                    {focusedPlanProfile?.precautions.map((item) => (
                      <article className="plan-detail-item plan-detail-item-caution" key={`precaution-${item}`}>
                        <Flame size={18} aria-hidden="true" />
                        <span>{item}</span>
                      </article>
                    ))}
                  </div>
                </section>
                <div className="plan-detail-actions">
                  <button
                    type="button"
                    className={`plan-detail-apply ${selectedFastingPlan.id === focusedPlan.id ? 'is-following' : ''}`}
                    onClick={() => {
                      setSelectedFastingPlan(focusedPlan)
                      setFocusedPlan(null)
                      setIsPlanPickerOpen(false)
                    }}
                  >
                    {selectedFastingPlan.id === focusedPlan.id ? 'Following' : 'Start plan'}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}

      {focusedChallengeId ? (
        <section
          className="challenge-detail-backdrop"
          aria-label="Fasting challenge details"
          onClick={() => setFocusedChallengeId(null)}
        >
          <div
            className={`challenge-detail-sheet challenge-${challengeTone(focusedChallenge.accent)}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="challenge-detail-header">
              <div>
                <span className="eyebrow">Challenge</span>
                <h2>{focusedChallenge.title}</h2>
              </div>
              <button type="button" onClick={() => setFocusedChallengeId(null)} aria-label="Close challenge details">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <section className="challenge-detail-hero">
              <div>
                <span>{focusedChallenge.durationDays} days</span>
                <strong>{focusedChallenge.subtitle}</strong>
                <p>
                  Log {focusedChallenge.targetFasts} fasts of {focusedChallenge.minimumFastHours}h or longer within the
                  challenge window.
                </p>
              </div>
              <div className="challenge-hero-badge">
                <Award size={22} aria-hidden="true" />
                <span>{focusedChallenge.reward}</span>
              </div>
            </section>

            <section className="challenge-detail-section">
              <h3>How to challenge</h3>
              <ol className="challenge-rule-list">
                <li>Join the challenge to start the timer.</li>
                <li>Complete {focusedChallenge.targetFasts} fasts of at least {focusedChallenge.minimumFastHours}h.</li>
                <li>Keep the fasting window clean and log each finished fast in LifeOS.</li>
              </ol>
            </section>

            <section className="challenge-detail-section">
              <h3>What you will get</h3>
              <div className="challenge-benefit-list">
                {focusedChallenge.benefits.map((benefit) => (
                  <article className="challenge-benefit" key={benefit}>
                    <Flag size={16} aria-hidden="true" />
                    <span>{benefit}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="challenge-detail-section">
              <h3>Progress</h3>
              <div className="challenge-progress-card">
                <div className="challenge-progress-track large">
                  <div
                    className="challenge-progress-fill"
                    style={{
                      width: `${
                        activeChallenge?.challengeId === focusedChallenge.id && challengeSnapshot ? challengeSnapshot.progressPercent : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="challenge-summary-grid">
                  <section>
                    <span>Progress</span>
                    <strong>
                      {activeChallenge?.challengeId === focusedChallenge.id && challengeSnapshot ? challengeSnapshot.progressCount : 0}/
                      {focusedChallenge.targetFasts}
                    </strong>
                  </section>
                  <section>
                    <span>Status</span>
                    <strong>
                      {activeChallenge?.challengeId === focusedChallenge.id && challengeSnapshot ? challengeSnapshot.status : 'Not joined'}
                    </strong>
                  </section>
                  <section>
                    <span>Reward</span>
                    <strong>{focusedChallenge.reward}</strong>
                  </section>
                </div>
              </div>
            </section>

            <section className="challenge-detail-section">
              <h3>Challenge ladder</h3>
              <div className="challenge-option-grid">
                {FASTING_CHALLENGES.map((challenge) => (
                  <button
                    type="button"
                    key={challenge.id}
                    className={`challenge-option challenge-${challengeTone(challenge.accent)} ${
                      challenge.id === focusedChallenge.id ? 'selected' : ''
                    }`}
                    onClick={() => setFocusedChallengeId(challenge.id)}
                  >
                    <strong>{challenge.title}</strong>
                    <span>
                      {challenge.targetFasts} fasts / {challenge.durationDays} days
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <div className="challenge-detail-actions">
              <button
                type="button"
                className="challenge-primary-button"
                onClick={() => joinChallenge(focusedChallenge.id)}
              >
                {activeChallenge?.challengeId === focusedChallenge.id && challengeSnapshot?.status === 'Completed'
                  ? 'Restart challenge'
                  : activeChallenge?.challengeId === focusedChallenge.id
                    ? 'Joined'
                    : 'Join'}
              </button>
              <a className="challenge-portal-link" href={LEARNING_PORTAL_URL}>
                Open in Portal
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {editingTimeField ? (
        <section className="time-picker-backdrop" aria-label={`Set ${editingTimeField} time`}>
          <div className="time-picker-sheet">
            <button
              className="time-picker-close"
              type="button"
              onClick={() => setEditingTimeField(null)}
              aria-label="Close time picker"
            >
              <X size={22} aria-hidden="true" />
            </button>
            <h2>Set {editingTimeField} time</h2>
            <div className="time-picker-grid">
              <label>
                Day
                <select value={timeDraftDate} onChange={(event) => setTimeDraftDate(event.target.value)}>
                  {timeDraftDateOptions.map((date) => (
                    <option value={date} key={date}>
                      {formatRelativeDay(dateAtClockTime(date, timeDraftTime), clock)} · {formatPickerDate(date)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Time
                <select value={timeDraftTime} onChange={(event) => setTimeDraftTime(event.target.value)}>
                  {timeDraftOptions.map((time) => (
                    <option value={time} key={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="time-picker-preview">
              <span>{formatPickerDate(timeDraftDate)}</span>
              <strong>{timeDraftTime}</strong>
            </div>
            <button className="time-picker-save" type="button" onClick={saveTimeEditor}>
              Save
            </button>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default App
