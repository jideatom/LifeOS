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
import './App.css'
import './TodayDashboard.css'

const NOTION_LIFEOS_URL =
  'https://app.notion.com/p/LifeOS-Command-Center-3544ab8a5f28813d967af856319c8f67?source=copy_link'
const ACTIVE_FAST_STORAGE_KEY = 'lifeos.activeFastStartIso'
const FASTING_PLAN_STORAGE_KEY = 'lifeos.selectedFastingPlan'
const CUSTOM_PLAN_STORAGE_KEY = 'lifeos.customFastingPlan'
const PLANNED_FAST_START_TIME_STORAGE_KEY = 'lifeos.plannedFastStartTime'
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

const recipeLibrary = [
  {
    title: 'Efo riro protein bowl',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Efo riro with spinach/ugu, pepper mix, palm oil in a controlled portion.',
    protein: 'Best with eggs, gizzard, chicken laps, or alaran when budget allows.',
    vehicle: 'Cabbage swallow, eggplant swallow, or cauliflower rice.',
  },
  {
    title: 'Okro soup fast breaker',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Okro cooked light with pepper, greens, and enough protein to make it filling.',
    protein: 'Use boiled eggs, chicken, gizzard, or mackerel. Skip crayfish and prawns.',
    vehicle: 'Cabbage swallow or a small side of sauteed cabbage.',
  },
  {
    title: 'Egusi light supper',
    tag: 'Soup',
    carbSignal: 'Low',
    base: 'Egusi with more greens than seed paste, cooked rich but not heavy.',
    protein: 'Eggs and chicken keep cost down. Croaker only when price makes sense.',
    vehicle: 'Cauliflower rice or eggplant swallow.',
  },
  {
    title: 'Pepper stew cauliflower rice',
    tag: 'Stew',
    carbSignal: 'Low',
    base: 'Tomato and pepper stew over cauliflower rice with sauteed vegetables.',
    protein: 'Eggs, gizzard, chicken laps, or alaran.',
    vehicle: 'Cauliflower rice as the default rice replacement.',
  },
  {
    title: 'Alaran pepper stew plate',
    tag: 'Fish',
    carbSignal: 'Low',
    base: 'Mackerel in pepper stew with cucumber, cabbage, or steamed greens.',
    protein: 'Use alaran as the main fish option. Swap to eggs when fish price is high.',
    vehicle: 'Cabbage rice, cauliflower rice, or no swallow.',
  },
  {
    title: 'Egg avocado greens plate',
    tag: 'Fast breaker',
    carbSignal: 'Low',
    base: 'Eggs with avocado, cucumber, greens, and a small groundnut garnish.',
    protein: 'Eggs carry the plate. Add gizzard if training day hunger is high.',
    vehicle: 'No rice needed. Add soup or stew if you want heat.',
  },
  {
    title: 'Quinoa lentil control bowl',
    tag: 'Bowl',
    carbSignal: 'Medium',
    base: 'Small quinoa portion with lentils, greens, cucumber, and pepper sauce.',
    protein: 'Add eggs or chicken so the bowl does not become carb-led.',
    vehicle: 'Keep quinoa and lentils measured, especially on fasting days.',
  },
  {
    title: 'Garbanzo salad bowl',
    tag: 'Bowl',
    carbSignal: 'Medium',
    base: 'Garbanzo beans with avocado, cucumber, onions, pepper, and olive oil.',
    protein: 'Add eggs, chicken, or gizzard for better satiety.',
    vehicle: 'Best as a planned medium-carb meal, not a casual side.',
  },
  {
    title: 'Cabbage rice stir-fry',
    tag: 'Skillet',
    carbSignal: 'Low',
    base: 'Shredded cabbage stir-fried with pepper, onions, eggs, and a little oil.',
    protein: 'Eggs are the budget version. Add chicken or gizzard for training days.',
    vehicle: 'Use as the rice replacement beside soup or stew.',
  },
  {
    title: 'Roasted corn and ube',
    tag: 'Seasonal',
    carbSignal: 'Relax',
    base: 'May and June seasonal roasted corn with local pear.',
    protein: 'Pair with eggs or fish later so the day is not only carb-led.',
    vehicle: 'Relax-day item. Keep portion deliberate.',
  },
]

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

  function handleFastAction() {
    if (isLiveFastActive) {
      setActiveFastStartIso(null)
      setClock(new Date())
      return
    }

    const now = new Date()
    const start = dateAtClockTime(todayIso(), plannedFastStartTime)
    setSelectedDate(todayIso())
    setClock(now)
    setActiveFastStartIso(start.toISOString())
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

  const commandSignals = [
    {
      label: 'Day type',
      value: log.dayType,
      detail: `${log.day}, ${log.date}`,
      trend: log.dayType === 'Relax' ? 'watch' : 'good',
    },
    {
      label: 'Nutrition',
      value: log.nutritionMode,
      detail: `${meals.length} planned eating decisions`,
      trend: 'good',
    },
    {
      label: 'Workout',
      value: workout.plan,
      detail: workout.focus,
      trend: workout.status === 'Optional' ? 'neutral' : 'good',
    },
    {
      label: 'Sync',
      value: 'Health Connect',
      detail: `${syncMetrics.length} Fitbit signals staged`,
      trend: 'watch',
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

        <section className="date-console" aria-label="Plan date controls">
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
              <article className={`signal-card signal-${signal.trend}`} key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <p>{signal.detail}</p>
              </article>
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
          </article>

          <article className="panel nutrition-command-panel">
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
            <div className="recipe-grid">
              {recipeLibrary.map((recipe) => (
                <section className={`recipe-card recipe-${recipe.carbSignal.toLowerCase()}`} key={recipe.title}>
                  <div className="recipe-card-top">
                    <span>{recipe.tag}</span>
                    <strong>{recipe.carbSignal}</strong>
                  </div>
                  <h3>{recipe.title}</h3>
                  <p>{recipe.base}</p>
                  <small>{recipe.protein}</small>
                  <small>{recipe.vehicle}</small>
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

          <article id="sync" className="panel sync-panel">
            <div className="panel-title">
              <Smartphone size={20} aria-hidden="true" />
              <h2>Fitbit Sync Inbox</h2>
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
          </article>

          <article id="me" className="panel compact-panel">
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

          <article className="panel compact-panel">
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
