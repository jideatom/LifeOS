import type {
  DailyCommandPlan,
  DayType,
  FastingPhase,
  FastingProtocol,
  FastingSession,
  MealPlanItem,
  NutritionMode,
  WorkoutPlan,
  WorkoutSession,
} from '../domain/lifeos'
import { computeReadiness } from '../domain/lifeos'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const FASTING_PHASE_MAX_HOURS = 96

export type FastingPlan = {
  id: string
  protocol: FastingProtocol
  title: string
  fastingHours: number
  eatingHours: number
  level: 'Hot' | 'Basic' | 'Intermediate' | 'Advanced' | 'Custom'
  note: string
}

export const FASTING_PLANS: FastingPlan[] = [
  { id: '16-8-hot', protocol: '16:8', title: '16:8', fastingHours: 16, eatingHours: 8, level: 'Hot', note: 'Most popular' },
  { id: '23-1-hot', protocol: '23:1', title: '23:1', fastingHours: 23, eatingHours: 1, level: 'Hot', note: 'OMAD' },
  { id: '20-4-hot', protocol: '20:4', title: '20:4', fastingHours: 20, eatingHours: 4, level: 'Hot', note: 'Warrior diet' },
  { id: '14-10-hot', protocol: '14:10', title: '14:10', fastingHours: 14, eatingHours: 10, level: 'Hot', note: 'Easy to start' },
  { id: '18-6-hot', protocol: '18:6', title: '18:6', fastingHours: 18, eatingHours: 6, level: 'Hot', note: 'Fat burning' },
  { id: '72h-hot', protocol: '72h', title: '72h', fastingHours: 72, eatingHours: 0, level: 'Hot', note: 'Extended fast' },
  { id: '12-12-basic', protocol: '12:12', title: '12:12', fastingHours: 12, eatingHours: 12, level: 'Basic', note: 'Beginner reset' },
  { id: '13-11-basic', protocol: '13:11', title: '13:11', fastingHours: 13, eatingHours: 11, level: 'Basic', note: 'Gentle rhythm' },
  { id: '14-10-basic', protocol: '14:10', title: '14:10', fastingHours: 14, eatingHours: 10, level: 'Basic', note: 'Easy weekday fast' },
  { id: '15-9-basic', protocol: '15:9', title: '15:9', fastingHours: 15, eatingHours: 9, level: 'Basic', note: 'Bridge to 16:8' },
  { id: '16-8-mid', protocol: '16:8', title: '16:8', fastingHours: 16, eatingHours: 8, level: 'Intermediate', note: 'Daily default' },
  { id: '17-7-mid', protocol: '17:7', title: '17:7', fastingHours: 17, eatingHours: 7, level: 'Intermediate', note: 'Slightly tighter' },
  { id: '18-6-mid', protocol: '18:6', title: '18:6', fastingHours: 18, eatingHours: 6, level: 'Intermediate', note: 'Fat burning' },
  { id: '19-5-mid', protocol: '19:5', title: '19:5', fastingHours: 19, eatingHours: 5, level: 'Intermediate', note: 'Small window' },
  { id: '20-4-advanced', protocol: '20:4', title: '20:4', fastingHours: 20, eatingHours: 4, level: 'Advanced', note: 'Warrior diet' },
  { id: '21-3-advanced', protocol: '21:3', title: '21:3', fastingHours: 21, eatingHours: 3, level: 'Advanced', note: 'Short window' },
  { id: '22-2-advanced', protocol: '22:2', title: '22:2', fastingHours: 22, eatingHours: 2, level: 'Advanced', note: 'Very tight' },
  { id: '23-1-advanced', protocol: '23:1', title: '23:1', fastingHours: 23, eatingHours: 1, level: 'Advanced', note: 'OMAD' },
  { id: 'custom', protocol: 'Custom', title: 'Customize', fastingHours: 16, eatingHours: 8, level: 'Custom', note: 'Create your own' },
  { id: '24h-custom', protocol: '24h', title: '24h', fastingHours: 24, eatingHours: 0, level: 'Custom', note: '1 day fasting' },
  { id: '30h-custom', protocol: '30h', title: '30h', fastingHours: 30, eatingHours: 0, level: 'Custom', note: '1.25 days fasting' },
  { id: '48h-custom', protocol: '48h', title: '48h', fastingHours: 48, eatingHours: 0, level: 'Custom', note: '2 days fasting' },
  { id: '72h-custom', protocol: '72h', title: '72h', fastingHours: 72, eatingHours: 0, level: 'Custom', note: '3 days fasting' },
  { id: '96h-custom', protocol: '96h', title: '96h', fastingHours: 96, eatingHours: 0, level: 'Custom', note: '4 days fasting' },
]

export const DEFAULT_FASTING_PLAN = FASTING_PLANS[0]

const FASTING_PHASE_LIBRARY: Omit<FastingPhase, 'status'>[] = [
  {
    id: 'fed',
    name: 'Fed state',
    window: '0-4h',
    startsAtHour: 0,
    endsAtHour: 4,
    essence: 'Meal energy is still available and insulin is usually higher than later in the fast.',
    healthNote: 'Keep this window calm: protein first at supper and no accidental second dinner.',
    sourceNote: 'Based on standard post-meal glucose and insulin handling described in fasting physiology reviews.',
  },
  {
    id: 'blood-sugar',
    name: 'Blood sugar settling',
    window: '4-8h',
    startsAtHour: 4,
    endsAtHour: 8,
    essence: 'Insulin trends down and the body starts leaning more on stored fuel between meals.',
    healthNote: 'This is where late-night snacking usually breaks the plan. Water, tea, and sleep protect the fast.',
    sourceNote: 'StatPearls notes gluconeogenesis begins several hours into fasting as blood glucose is maintained.',
  },
  {
    id: 'glycogen',
    name: 'Glycogen shift',
    window: '8-12h',
    startsAtHour: 8,
    endsAtHour: 12,
    essence: 'Liver glycogen becomes more important for keeping blood glucose stable.',
    healthNote: 'Good zone for morning focus. Electrolytes help if you feel flat or headachy.',
    sourceNote: 'NCBI material describes glycogenolysis and gluconeogenesis supporting glucose during fasting.',
  },
  {
    id: 'fat-burning',
    name: 'Fat-burning phase',
    window: '12-16h',
    startsAtHour: 12,
    endsAtHour: 16,
    essence: 'Fat oxidation tends to rise as fasting lengthens and insulin remains lower.',
    healthNote: 'This is the practical 16:8 sweet spot: strong enough for consistency without wrecking training.',
    sourceNote: 'Clinical fasting guidance commonly frames 14-18h time-restricted eating as the daily fasting range.',
  },
  {
    id: 'ketone',
    name: 'Ketone ramp',
    window: '16-24h',
    startsAtHour: 16,
    endsAtHour: 24,
    essence: 'Ketone production may start becoming more noticeable, especially when carbs have been low.',
    healthNote: 'Useful for appetite control, but heavy lifting may need load discipline if readiness is low.',
    sourceNote: 'Ketogenesis sources describe the shift toward fat-derived ketone production during fasting.',
  },
  {
    id: 'glycogen-low',
    name: 'Glycogen low',
    window: '24-36h',
    startsAtHour: 24,
    endsAtHour: 36,
    essence: 'Stored liver glycogen is usually much lower, so gluconeogenesis and fat metabolism carry more load.',
    healthNote: 'This is no longer an ordinary weekday fast. Training, sleep, and stress should decide whether to continue.',
    sourceNote: 'StatPearls describes gluconeogenesis peaking after about 24h as hepatic glycogen is depleted.',
  },
  {
    id: 'autophagy-support',
    name: 'Autophagy support',
    window: '36-48h',
    startsAtHour: 36,
    endsAtHour: 48,
    essence: 'Cell cleanup pathways may increase, but human timing varies and is not guaranteed by the clock.',
    healthNote: 'Treat this as an advanced occasional fast, not a daily goal.',
    sourceNote: 'Cleveland Clinic summarizes animal evidence suggesting autophagy may begin around 24-48h.',
  },
  {
    id: 'deep-ketosis',
    name: 'Deep ketosis',
    window: '48-72h',
    startsAtHour: 48,
    endsAtHour: 72,
    essence: 'Ketones can become a larger fuel source as carbohydrate availability stays low.',
    healthNote: 'This level needs caution: pause if dizziness, weakness, palpitations, or poor sleep shows up.',
    sourceNote: 'NCBI ketogenesis and fasting reviews describe ketones rising during prolonged carbohydrate scarcity.',
  },
  {
    id: 'extended-fast',
    name: 'Extended fast caution',
    window: '72-96h',
    startsAtHour: 72,
    endsAtHour: 96,
    essence: 'The body is deep into prolonged fasting physiology; ketone use is higher and recovery matters more.',
    healthNote: 'Use this only with serious caution. Refeeding, medication, blood pressure, and training all matter here.',
    sourceNote: 'Fasting physiology reviews describe several-day fasting as a different metabolic state from daily IF.',
  },
]

function dateFromIso(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`)
}

function isoFromDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIso() {
  return isoFromDate(new Date())
}

export function shiftDate(dateIso: string, days: number) {
  const date = dateFromIso(dateIso)
  date.setDate(date.getDate() + days)
  return isoFromDate(date)
}

function dayName(dateIso: string) {
  return DAY_NAMES[dateFromIso(dateIso).getDay()]
}

function isRelaxDay(dateIso: string) {
  const day = dateFromIso(dateIso).getDay()
  return day === 0 || day === 6
}

function formatHumanDate(dateIso: string) {
  return new Intl.DateTimeFormat('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateFromIso(dateIso))
}

function signalsForDate(dateIso: string) {
  const dayOfMonth = dateFromIso(dateIso).getDate()
  const relax = isRelaxDay(dateIso)

  return {
    sleepHours: relax ? 7.2 : 6.5 + ((dayOfMonth % 4) * 0.18),
    sleepScore: relax ? 81 : 74 + (dayOfMonth % 8),
    restingHeartRate: relax ? 66 : 68 + (dayOfMonth % 5),
    steps: relax ? 6200 + dayOfMonth * 35 : 7800 + dayOfMonth * 42,
    activeZoneMinutes: relax ? 18 + (dayOfMonth % 10) : 28 + (dayOfMonth % 16),
    caloriesBurned: relax ? 2150 + dayOfMonth * 7 : 2380 + dayOfMonth * 9,
    weightKg: 101.5,
  }
}

function dateTimeFromIsoAndTime(dateIso: string, time: string) {
  return new Date(`${dateIso}T${time}:00`)
}

function calculateElapsedHours({
  dateIso,
  startedAt,
  targetHours,
  now,
}: {
  dateIso: string
  startedAt: string
  targetHours: number
  now: Date
}) {
  const startDate = shiftDate(dateIso, -1)
  const start = dateTimeFromIsoAndTime(startDate, startedAt)
  const selected = dateFromIso(dateIso)
  const today = dateFromIso(todayIso())

  if (selected.getTime() < today.getTime()) return targetHours
  if (selected.getTime() > today.getTime()) return 0
  if (now.getTime() <= start.getTime()) return 0

  const elapsedMs = now.getTime() - start.getTime()
  return Math.max(0, Math.min(FASTING_PHASE_MAX_HOURS, elapsedMs / (1000 * 60 * 60)))
}

function fastingStatusForElapsed(elapsedHours: number, targetHours: number): FastingSession['status'] {
  if (elapsedHours <= 0) return 'Planned'
  if (elapsedHours >= targetHours) return 'Eating Window'
  return 'Fasting'
}

export function fastingForDateWithPlan(dateIso: string, now: Date, plan: FastingPlan): FastingSession {
  const eatingStartHour = (20 + plan.fastingHours) % 24
  const eatingWindow =
    plan.eatingHours > 0
      ? `${`${eatingStartHour}`.padStart(2, '0')}:00-20:00`
      : 'No eating window'

  if (isRelaxDay(dateIso)) {
    const elapsedHours = calculateElapsedHours({
      dateIso,
      startedAt: '21:00',
      targetHours: plan.fastingHours,
      now,
    })

    return {
      protocol: plan.protocol,
      status: fastingStatusForElapsed(elapsedHours, plan.fastingHours),
      startedAt: '21:00',
      targetEndAt: '11:00',
      eatingWindow,
      targetHours: plan.fastingHours,
      elapsedHours,
    }
  }

  const elapsedHours = calculateElapsedHours({
    dateIso,
    startedAt: '20:00',
    targetHours: plan.fastingHours,
    now,
  })

  return {
    protocol: plan.protocol,
    status: fastingStatusForElapsed(elapsedHours, plan.fastingHours),
    startedAt: '20:00',
    targetEndAt: `${`${eatingStartHour}`.padStart(2, '0')}:00`,
    eatingWindow,
    targetHours: plan.fastingHours,
    elapsedHours,
  }
}

export function getFastingPhasesForElapsed(elapsedHours: number): FastingPhase[] {
  return FASTING_PHASE_LIBRARY.map((phase) => {
    const isActive =
      elapsedHours >= phase.startsAtHour &&
      elapsedHours < phase.endsAtHour

    return {
      ...phase,
      status: isActive ? 'Active' : elapsedHours >= phase.startsAtHour ? 'Completed' : 'Upcoming',
    }
  })
}

function fastingPhasesForSession(session: FastingSession): FastingPhase[] {
  return getFastingPhasesForElapsed(session.elapsedHours)
}

function mealsForDate(dateIso: string): MealPlanItem[] {
  if (isRelaxDay(dateIso)) {
    return [
      {
        id: 'break-fast',
        time: '11:00',
        title: 'Eggs, avocado and sauteed greens',
        role: 'Break fast',
        status: 'Planned',
        carbSignal: 'Low',
        items: ['Eggs', 'Avocado', 'Ugu or spinach', 'Olive oil or small butter'],
        budgetBackup: 'Eggs plus cabbage stir-fry if avocado price is high.',
      },
      {
        id: 'main-meal',
        time: '15:00',
        title: 'Alaran soup bowl with cauliflower rice',
        role: 'Main meal',
        status: 'Planned',
        carbSignal: 'Low',
        items: ['Alaran/mackerel', 'Soup: efo riro, okro or egusi without crayfish', 'Cauliflower rice', 'Cucumber'],
        budgetBackup: 'Swap fish for eggs, gizzard or turkey offcuts when fish price jumps.',
      },
      {
        id: 'relax-snack',
        time: '17:30',
        title: 'Seasonal controlled snack',
        role: 'Snack',
        status: 'Flexible',
        carbSignal: 'Relax',
        items: ['Small mango portion', 'Local walnut', 'Water'],
        budgetBackup: 'Use local walnut only if mango pushes cravings.',
      },
      {
        id: 'supper',
        time: '19:30',
        title: 'Pepper stew with croaker and cabbage rice',
        role: 'Supper',
        status: 'Planned',
        carbSignal: 'Low',
        items: ['Croaker', 'Pepper stew', 'Cabbage rice', 'Side vegetables'],
        budgetBackup: 'Use alaran, eggs or grilled chicken instead of croaker.',
      },
    ]
  }

  return [
    {
      id: 'break-fast',
      time: '12:00',
      title: 'Protein-first fast breaker',
      role: 'Break fast',
      status: 'Planned',
      carbSignal: 'Low',
      items: ['Boiled eggs', 'Avocado or groundnut', 'Cucumber', 'Water'],
      budgetBackup: 'Eggs plus groundnut when avocado is expensive.',
    },
    {
      id: 'main-meal',
      time: '15:30',
      title: 'Yoruba soup bowl, no swallow default',
      role: 'Main meal',
      status: 'Planned',
      carbSignal: 'Low',
      items: ['Soup: ewedu, efo riro, okro or egusi', 'Alaran or gizzard', 'Cabbage swallow', 'Pepper stew'],
      budgetBackup: 'Use eggs, chicken laps or gizzard when fish price is high.',
    },
    {
      id: 'supper',
      time: '19:15',
      title: 'Pepper stew with low-carb rice swap',
      role: 'Supper',
      status: 'Planned',
      carbSignal: 'Low',
      items: ['Pepper stew', 'Cauliflower rice or cabbage rice', 'Eggs or mackerel', 'Vegetables'],
      budgetBackup: 'Cabbage rice is the default backup if cauliflower is unavailable.',
    },
  ]
}

function workoutForDate(dateIso: string): WorkoutSession {
  const day = dateFromIso(dateIso).getDay()
  const weekParity = Math.floor(dateFromIso(dateIso).getTime() / (7 * 24 * 60 * 60 * 1000)) % 2

  if (day === 1 || day === 5) {
    return {
      plan: weekParity === 0 ? 'StrongLifts A' : 'StrongLifts B',
      status: 'Planned',
      focus: weekParity === 0 ? 'Squat, bench, row progression' : 'Squat, press, hinge progression',
      lifts:
        weekParity === 0
          ? ['Back Squat 5x5', 'Bench Press 5x5', 'Barbell Row 5x5']
          : ['Back Squat 5x5', 'Overhead Press 5x5', 'Deadlift 1x5 or Trap Bar 3x3-5'],
      accessories:
        weekParity === 0
          ? ['Dips', 'Plank', 'Elliptical cooldown']
          : ['Lat pulldown', 'Leg curl', 'Hip mobility'],
    }
  }

  if (day === 3) {
    return {
      plan: weekParity === 0 ? 'StrongLifts B' : 'StrongLifts A',
      status: 'Planned',
      focus: weekParity === 0 ? 'Press and hinge day' : 'Bench and row day',
      lifts:
        weekParity === 0
          ? ['Back Squat 5x5', 'Overhead Press 5x5', 'Trap Bar Deadlift 3x3-5']
          : ['Back Squat 5x5', 'Bench Press 5x5', 'Barbell Row 5x5'],
      accessories: ['Lat pulldown', 'Leg curl', 'Loaded carries'],
    }
  }

  if (isRelaxDay(dateIso)) {
    return {
      plan: 'Conditioning',
      status: 'Optional',
      focus: 'Relax-day movement without draining recovery',
      lifts: ['Elliptical Zone 2 for 25-35 min', 'Skipping rope technique 6 x 45 sec'],
      accessories: ['Hip mobility', 'Shoulder dislocates', 'Easy core carries'],
      conditioning: 'Keep nasal-breathing pace. Save heavy squats for the next lift day.',
    }
  }

  return {
    plan: 'Mobility/Recovery',
    status: 'Optional',
    focus: 'Recovery, steps and joints',
    lifts: ['Walk or elliptical Zone 2 for 20-30 min'],
    accessories: ['Shoulder mobility', 'Hip airplanes', 'Light core'],
  }
}

function prioritiesForDate(dateIso: string) {
  if (isRelaxDay(dateIso)) {
    return [
      'Keep the relax day controlled, not chaotic.',
      'Use cauliflower or cabbage rice before any real rice.',
      'Drink to thirst and keep salt/electrolytes sensible.',
      'Prepare the next StrongLifts session before bed.',
    ]
  }

  return [
    'Protect the fasting window.',
    'Make supper Yoruba, low-carb and satisfying.',
    'Choose budget protein backup before buying expensive fish.',
    'Keep carbs deliberate, not accidental.',
  ]
}

export function getPlanForDate(dateIso: string, now = new Date(), fastingPlan = DEFAULT_FASTING_PLAN): DailyCommandPlan {
  const importedSignals = signalsForDate(dateIso)
  const relax = isRelaxDay(dateIso)
  const workout = workoutForDate(dateIso)
  const fasting = fastingForDateWithPlan(dateIso, now, relax ? {
    ...fastingPlan,
    protocol: fastingPlan.protocol === '16:8' ? 'No strict fast' : fastingPlan.protocol,
    title: fastingPlan.protocol === '16:8' ? 'No strict fast' : fastingPlan.title,
  } : fastingPlan)
  const dayType: DayType = relax ? 'Relax' : 'Fasting/Healthy'
  const nutritionMode: NutritionMode = relax ? 'Yoruba relax' : 'Yoruba low-carb'

  return {
    log: {
      id: dateIso,
      day: dayName(dateIso),
      date: dateIso,
      dayType,
      fastingStatus: fasting.status,
      fastProtocol: fasting.protocol,
      eatingWindow: fasting.eatingWindow,
      nutritionMode,
      workoutPlan: workout.plan as WorkoutPlan,
      readiness: computeReadiness(importedSignals),
      ...importedSignals,
    },
    fasting,
    fastingPhases: fastingPhasesForSession(fasting),
    meals: mealsForDate(dateIso),
    workout,
    syncMetrics: [
      { label: 'Sleep', value: importedSignals.sleepHours.toFixed(1), unit: 'h', status: 'Good' },
      { label: 'Sleep score', value: `${importedSignals.sleepScore}`, status: 'Good' },
      { label: 'Resting HR', value: `${importedSignals.restingHeartRate}`, unit: 'bpm', status: 'Good' },
      { label: 'Steps', value: importedSignals.steps.toLocaleString('en-NG'), status: relax ? 'Watch' : 'Good' },
      { label: 'Zone mins', value: `${importedSignals.activeZoneMinutes}`, status: 'Good' },
      { label: 'Weight', value: importedSignals.weightKg.toFixed(1), unit: 'kg', status: 'Watch' },
    ],
    priorities: prioritiesForDate(dateIso),
  }
}

export function getWeekPreview(centerDateIso: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(centerDateIso, index - 3)
    const plan = getPlanForDate(date)

    return {
      date,
      day: plan.log.day.slice(0, 3),
      label: formatHumanDate(date),
      type: plan.log.dayType,
      workout: plan.workout.plan,
    }
  })
}

export const todayPlan = getPlanForDate(todayIso())
