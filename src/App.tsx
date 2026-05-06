import {
  Apple,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Database,
  Dumbbell,
  ExternalLink,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Pencil,
  Plus,
  Smartphone,
  TimerReset,
  Utensils,
  X,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
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
import type { FastingSession } from './domain/lifeos'
import { fastingProgress } from './domain/lifeos'
import './TodayDashboard.css'
import './App.css'

const NOTION_LIFEOS_URL =
  'https://app.notion.com/p/LifeOS-Command-Center-3544ab8a5f28813d967af856319c8f67?source=copy_link'
const DEFAULT_NOTION_SYNC_ENDPOINT = 'https://life-os-jideatoms-projects.vercel.app/api/recipes/upsert'
const NOTION_SYNC_ENDPOINT = import.meta.env.VITE_LIFEOS_SYNC_API_URL ?? DEFAULT_NOTION_SYNC_ENDPOINT
const ACTIVE_FAST_STORAGE_KEY = 'lifeos.activeFastStartIso'
const FASTING_PLAN_STORAGE_KEY = 'lifeos.selectedFastingPlan'
const CUSTOM_PLAN_STORAGE_KEY = 'lifeos.customFastingPlan'
const PLANNED_FAST_START_TIME_STORAGE_KEY = 'lifeos.plannedFastStartTime'
const FASTING_HISTORY_STORAGE_KEY = 'lifeos.fastingHistory'
const WORKOUT_LOG_STORAGE_KEY = 'lifeos.workoutLog'
const LIFT_PROGRESS_STORAGE_KEY = 'lifeos.liftProgress'
const RECIPES_STORAGE_KEY = 'lifeos.recipes'
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

type CompletedFastRecord = {
  id: string
  protocol: FastingPlan['protocol']
  plannedHours: number
  actualHours: number
  startedAtIso: string
  endedAtIso: string
  completedOn: string
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

const DEFAULT_LIFT_PROGRESS: Record<string, LiftProgressEntry> = {
  'Back Squat 5x5': { label: 'Back Squat 5x5', weight: 135, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Bench Press 5x5': { label: 'Bench Press 5x5', weight: 95, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Barbell Row 5x5': { label: 'Barbell Row 5x5', weight: 95, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Overhead Press 5x5': { label: 'Overhead Press 5x5', weight: 65, increment: 5, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Deadlift 1x5 or Trap Bar 3x3-5': { label: 'Deadlift 1x5 or Trap Bar 3x3-5', weight: 185, increment: 10, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
  'Trap Bar Deadlift 3x3-5': { label: 'Trap Bar Deadlift 3x3-5', weight: 185, increment: 10, failures: 0, updatedAtIso: '2026-05-06T00:00:00.000Z' },
}

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

function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [clock, setClock] = useState(() => new Date())
  const [selectedFastingPlan, setSelectedFastingPlan] = useState(storedFastingPlanInitialValue)
  const [isPlanPickerOpen, setIsPlanPickerOpen] = useState(false)
  const [editingTimeField, setEditingTimeField] = useState<'start' | 'end' | null>(null)
  const [timeDraftDate, setTimeDraftDate] = useState(todayIso)
  const [timeDraftTime, setTimeDraftTime] = useState(plannedFastStartInitialValue)
  const [activeFastStartIso, setActiveFastStartIso] = useState<string | null>(activeFastInitialValue)
  const [plannedFastStartTime, setPlannedFastStartTime] = useState(plannedFastStartInitialValue)
  const [fastingHistory, setFastingHistory] = useState(storedFastingHistoryInitialValue)
  const [workoutLog, setWorkoutLog] = useState(storedWorkoutLogInitialValue)
  const [liftProgress, setLiftProgress] = useState(storedLiftProgressInitialValue)
  const [recipeFilter, setRecipeFilter] = useState<(typeof RECIPE_FILTERS)[number]>('All')
  const [recipes, setRecipes] = useState(storedRecipesInitialValue)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [recipeDraft, setRecipeDraft] = useState<RecipeDraft>(emptyRecipeDraft)
  const [isRecipeSyncing, setIsRecipeSyncing] = useState(false)
  const [recipeSyncMessage, setRecipeSyncMessage] = useState(
    NOTION_SYNC_ENDPOINT
      ? 'Notion auto-sync is ready.'
      : 'Notion auto-sync needs the private API URL. Local saving is active.',
  )
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
  const { log, meals, workout, syncMetrics, priorities } = todayPlan
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
    const currentWeekDates = Array.from({ length: 7 }, (_, index) => shiftDate(selectedDate, -index))
    const weeklyCompletions = completedSessions.filter((entry) => currentWeekDates.includes(entry.date)).length
    const recentSessions = completedSessions.slice(0, 4)

    return {
      totalSessions: completedSessions.length,
      weeklyCompletions,
      recentSessions,
    }
  }, [selectedDate, workoutLog])
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

  const commandSignals = [
    {
      role: 'day',
      label: 'Day type',
      value: log.dayType,
      detail: `${log.day}, ${log.date}`,
      trend: log.dayType === 'Relax' ? 'watch' : 'good',
      targetId: 'day-overview' as const,
    },
    {
      role: 'nutrition',
      label: 'Nutrition',
      value: log.nutritionMode,
      detail: `${meals.length} planned eating decisions`,
      trend: 'good',
      targetId: 'nutrition' as const,
    },
    {
      role: 'training',
      label: 'Workout',
      value: workout.plan,
      detail: workout.focus,
      trend: workout.status === 'Optional' ? 'neutral' : 'good',
      targetId: 'fitness' as const,
    },
    {
      role: 'sync',
      label: 'Sync',
      value: 'Health Connect',
      detail: `${syncMetrics.length} Fitbit signals staged`,
      trend: 'watch',
      targetId: 'sync' as const,
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
          <div className={`readiness readiness-${log.readiness.toLowerCase()}`}>
            <span>{log.readiness}</span>
            <strong>{readinessLabel(log.readiness)}</strong>
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

          <div className="signal-grid">
            {commandSignals.map((signal) => (
              <button
                className={`signal-card signal-card-button signal-${signal.trend} signal-role-${signal.role}`}
                key={signal.label}
                type="button"
                onClick={() => jumpToSection(signal.targetId)}
              >
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <p>{signal.detail}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="content-grid">
          <article id="meals" className="panel meals-panel">
            <div className="panel-title">
              <Apple size={20} aria-hidden="true" />
              <h2>Meal Timeline</h2>
            </div>
            <div className="meal-stack">
              {meals.map((meal) => (
                <section className={`meal-row carb-${meal.carbSignal.toLowerCase()}`} key={meal.id}>
                  <div className="meal-time">
                    <strong>{meal.time}</strong>
                    <span>{meal.role}</span>
                  </div>
                  <div>
                    <div className="meal-heading">
                      <h3>{meal.title}</h3>
                      <span>{meal.status}</span>
                    </div>
                    <p>{meal.items.join(', ')}</p>
                    {meal.budgetBackup ? <small>{meal.budgetBackup}</small> : null}
                  </div>
                </section>
              ))}
            </div>
          </article>

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
                    <span>{relativeDateLabel(entry.date, selectedDate)}</span>
                    <strong>{entry.plan}</strong>
                    <p>{entry.focus}</p>
                  </article>
                ))
              ) : (
                <p className="muted">Your recent completed training sessions will appear here.</p>
              )}
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
              <h2>Fitbit Sync Inbox</h2>
            </div>
            <div className="sync-summary">
              <section className="sync-summary-card">
                <span>Bridge status</span>
                <strong>Bridge needs env check</strong>
                <p>
                  Recipe sync depends on the Vercel API route plus valid Notion secrets and allowed origins.
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
            <div className="health-connect-panel">
              <div className="health-connect-header">
                <h3>Health Connect Path</h3>
                <p>The phone side is partly ready. LifeOS now needs the capture layer that can read Android health data safely.</p>
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
                Practical integration route: Fitbit writes to Health Connect on Android, then a LifeOS Android wrapper or companion app reads those records and sends daily summaries into this dashboard.
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
              Daily Health Log, Fasting Sessions, Meal Plan, Workout Log, Exercise Library, Fitbit
              Sync Inbox, and Weekly Reviews.
            </p>
          </article>
        </section>
      </section>

      {editingRecipeId ? (
        <section className="recipe-editor-backdrop" aria-label="Recipe editor">
          <form
            className="recipe-editor-sheet"
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
        <section className="plan-picker-backdrop" aria-label="Fasting plan picker">
          <div className="plan-picker">
            <header className="plan-picker-header">
              <div>
                <span className="eyebrow">Fasting type</span>
                <h2>Choose fasting plan</h2>
              </div>
              <button type="button" onClick={() => setIsPlanPickerOpen(false)} aria-label="Close fasting plan picker">
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <section className="tailored-plan">
              <div>
                <strong>Tailored Plan</strong>
                <p>Use your LifeOS rhythm, workout days, and usual meals to choose the fast you can repeat.</p>
              </div>
              <button type="button" onClick={() => setSelectedFastingPlan(DEFAULT_FASTING_PLAN)}>
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
                        setSelectedFastingPlan(plan)
                        setIsPlanPickerOpen(false)
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
