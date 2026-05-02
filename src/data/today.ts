import type {
  DailyCommandPlan,
  DayType,
  FastingPhase,
  FastingSession,
  MealPlanItem,
  NutritionMode,
  WorkoutPlan,
  WorkoutSession,
} from '../domain/lifeos'
import { computeReadiness } from '../domain/lifeos'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const FASTING_PHASE_LIBRARY: Omit<FastingPhase, 'status'>[] = [
  {
    id: 'fed',
    name: 'Fed state',
    window: '0-4h',
    startsAtHour: 0,
    essence: 'Food is still being digested and stored.',
    healthNote: 'Keep this window calm: protein first, hydrate, and avoid turning supper into a second dinner.',
  },
  {
    id: 'blood-sugar',
    name: 'Blood sugar settling',
    window: '4-8h',
    startsAtHour: 4,
    essence: 'Insulin trends down and the body starts using stored fuel between meals.',
    healthNote: 'This is where late-night snacking usually breaks the plan. Water, tea, and sleep protect the fast.',
  },
  {
    id: 'glycogen',
    name: 'Glycogen shift',
    window: '8-12h',
    startsAtHour: 8,
    essence: 'The body leans more on stored glycogen and begins moving toward more fat use.',
    healthNote: 'Good zone for morning focus. Electrolytes help if you feel flat or headachy.',
  },
  {
    id: 'fat-burning',
    name: 'Fat-burning phase',
    window: '12-16h',
    startsAtHour: 12,
    essence: 'Fat oxidation tends to rise as the fast gets longer.',
    healthNote: 'This is the practical 16:8 sweet spot: strong enough for consistency without wrecking training.',
  },
  {
    id: 'ketone',
    name: 'Ketone rise',
    window: '16-20h',
    startsAtHour: 16,
    essence: 'Ketones may become more noticeable, especially when carbs have been low.',
    healthNote: 'Useful for appetite control, but heavy lifting may need load discipline if readiness is low.',
  },
  {
    id: 'autophagy',
    name: 'Autophagy support',
    window: '20h+',
    startsAtHour: 20,
    essence: 'Cell cleanup pathways are thought to increase with longer fasts, but timing varies by person.',
    healthNote: 'Treat this as an occasional advanced phase, not a daily requirement. Recovery still matters.',
  },
]

function dateFromIso(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`)
}

function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10)
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

function fastingForDate(dateIso: string): FastingSession {
  if (isRelaxDay(dateIso)) {
    return {
      protocol: 'No strict fast',
      status: 'Eating Window',
      startedAt: '21:00',
      targetEndAt: '11:00',
      eatingWindow: '11:00-20:00',
      targetHours: 14,
      elapsedHours: 14,
      hydrationTargetLiters: 3,
    }
  }

  return {
    protocol: '16:8',
    status: 'Fasting',
    startedAt: '20:00',
    targetEndAt: '12:00',
    eatingWindow: '12:00-20:00',
    targetHours: 16,
    elapsedHours: 11,
    hydrationTargetLiters: 3.2,
  }
}

function fastingPhasesForSession(session: FastingSession): FastingPhase[] {
  return FASTING_PHASE_LIBRARY.map((phase, index) => {
    const nextPhase = FASTING_PHASE_LIBRARY[index + 1]
    const isActive =
      session.elapsedHours >= phase.startsAtHour &&
      (nextPhase === undefined || session.elapsedHours < nextPhase.startsAtHour)

    return {
      ...phase,
      status: isActive ? 'Active' : session.elapsedHours >= phase.startsAtHour ? 'Completed' : 'Upcoming',
    }
  })
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
        title: 'Alaran with efo riro and cauliflower rice',
        role: 'Main meal',
        status: 'Planned',
        carbSignal: 'Low',
        items: ['Alaran/mackerel', 'Efo riro without crayfish', 'Cauliflower rice', 'Cucumber'],
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
        title: 'Obe ata with croaker and cabbage rice',
        role: 'Supper',
        status: 'Planned',
        carbSignal: 'Low',
        items: ['Croaker', 'Obe ata', 'Cabbage rice', 'Side vegetables'],
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
      items: ['Ewedu or efo riro', 'Alaran or gizzard', 'Cabbage swallow', 'Pepper sauce'],
      budgetBackup: 'Use eggs, chicken laps or gizzard when fish price is high.',
    },
    {
      id: 'supper',
      time: '19:15',
      title: 'Obe ata with low-carb rice swap',
      role: 'Supper',
      status: 'Planned',
      carbSignal: 'Low',
      items: ['Obe ata', 'Cauliflower rice or cabbage rice', 'Eggs or mackerel', 'Vegetables'],
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
      'Hit hydration target before supper.',
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

export function getPlanForDate(dateIso: string): DailyCommandPlan {
  const importedSignals = signalsForDate(dateIso)
  const relax = isRelaxDay(dateIso)
  const workout = workoutForDate(dateIso)
  const fasting = fastingForDate(dateIso)
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
