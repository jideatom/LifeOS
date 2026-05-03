export type Readiness = 'Green' | 'Yellow' | 'Red'

export type DayType = 'Fasting/Healthy' | 'Relax' | 'Recovery' | 'Travel/Busy'

export type FastingStatus = 'Planned' | 'Fasting' | 'Eating Window' | 'Completed' | 'Skipped'

export type WorkoutPlan =
  | 'StrongLifts A'
  | 'StrongLifts B'
  | 'Accessory'
  | 'Conditioning'
  | 'Mobility/Recovery'
  | 'Rest'

export type NutritionMode =
  | 'Yoruba low-carb'
  | 'Yoruba relax'
  | 'General low-carb'
  | 'Seasonal relax'

export type FastingProtocol = '12:12' | '13:11' | '14:10' | '15:9' | '16:8' | '17:7' | '18:6' | '19:5' | '20:4' | '21:3' | '22:2' | '23:1' | '24h' | '30h' | '48h' | '72h' | '96h' | 'Custom' | 'No strict fast'

export type DailyHealthLog = {
  id: string
  day: string
  date: string
  dayType: DayType
  fastingStatus: FastingStatus
  fastProtocol: FastingProtocol
  eatingWindow: string
  nutritionMode: NutritionMode
  workoutPlan: WorkoutPlan
  readiness: Readiness
  sleepHours?: number
  sleepScore?: number
  restingHeartRate?: number
  steps?: number
  activeZoneMinutes?: number
  caloriesBurned?: number
  weightKg?: number
}

export type HealthConnectDailyImport = {
  date: string
  source: 'Health Connect'
  syncStatus: 'Not synced' | 'Imported' | 'Reviewed' | 'Needs attention' | 'Error'
  sleepHours?: number
  sleepScore?: number
  restingHeartRate?: number
  steps?: number
  activeZoneMinutes?: number
  caloriesBurned?: number
  distanceKm?: number
  workoutMinutes?: number
  weightKg?: number
}

export type MealStatus = 'Planned' | 'Done' | 'Skipped' | 'Flexible'

export type MealPlanItem = {
  id: string
  time: string
  title: string
  role: 'Break fast' | 'Main meal' | 'Supper' | 'Snack' | 'Hydration'
  status: MealStatus
  carbSignal: 'Low' | 'Medium' | 'Relax'
  items: string[]
  budgetBackup?: string
}

export type FastingSession = {
  protocol: FastingProtocol
  status: FastingStatus
  startedAt: string
  targetEndAt: string
  eatingWindow: string
  targetHours: number
  elapsedHours: number
}

export type FastingPhase = {
  id: string
  name: string
  window: string
  startsAtHour: number
  endsAtHour: number
  status: 'Completed' | 'Active' | 'Upcoming'
  essence: string
  healthNote: string
  sourceNote: string
}

export type WorkoutSession = {
  plan: WorkoutPlan
  status: 'Planned' | 'Done' | 'Optional' | 'Rest'
  focus: string
  lifts: string[]
  accessories: string[]
  conditioning?: string
}

export type SyncMetric = {
  label: string
  value: string
  unit?: string
  status: 'Good' | 'Watch' | 'Missing'
}

export type DailyCommandPlan = {
  log: DailyHealthLog
  fasting: FastingSession
  fastingPhases: FastingPhase[]
  meals: MealPlanItem[]
  workout: WorkoutSession
  syncMetrics: SyncMetric[]
  priorities: string[]
}

export function computeReadiness(input: Pick<DailyHealthLog, 'sleepHours' | 'restingHeartRate'>) {
  if (input.sleepHours !== undefined && input.sleepHours < 5) return 'Red' satisfies Readiness
  if (input.sleepHours !== undefined && input.sleepHours < 6.5) return 'Yellow' satisfies Readiness
  if (input.restingHeartRate !== undefined && input.restingHeartRate > 80) {
    return 'Yellow' satisfies Readiness
  }
  return 'Green' satisfies Readiness
}

export function fastingProgress(session: Pick<FastingSession, 'elapsedHours' | 'targetHours'>) {
  return Math.min(100, Math.round((session.elapsedHours / session.targetHours) * 100))
}
