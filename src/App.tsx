import {
  Apple,
  CalendarDays,
  CheckCircle2,
  Database,
  Dumbbell,
  ExternalLink,
  Flame,
  Gauge,
  HeartPulse,
  Moon,
  Smartphone,
  TimerReset,
  Utensils,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { getPlanForDate, getWeekPreview, shiftDate, todayIso } from './data/today'
import { fastingProgress } from './domain/lifeos'
import './App.css'
import './TodayDashboard.css'

const NOTION_LIFEOS_URL =
  'https://app.notion.com/p/3524ab8a5f28809facbee1cf935ebad2?v=f248fa787b3e40f8bb2bb98a4457a342&source=copy_link'

function readinessLabel(readiness: string) {
  if (readiness === 'Green') return 'Train as planned'
  if (readiness === 'Yellow') return 'Train, hold load'
  return 'Recovery day'
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const todayPlan = useMemo(() => getPlanForDate(selectedDate), [selectedDate])
  const weekPreview = useMemo(() => getWeekPreview(selectedDate), [selectedDate])
  const { log, fasting, fastingPhases, meals, workout, syncMetrics, priorities } = todayPlan
  const progress = fastingProgress(fasting)
  const activeFastingPhase = fastingPhases.find((phase) => phase.status === 'Active') ?? fastingPhases[0]

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
            <p>{log.dayType} · {log.fastProtocol} · {workout.plan}</p>
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
          <article id="fasting" className="fast-card">
            <div className="card-header">
              <TimerReset size={22} aria-hidden="true" />
              <span>Fasting core</span>
            </div>
            <div
              className="fast-ring"
              style={{ '--fast-progress': `${progress}%` } as CSSProperties}
              aria-label={`Fasting progress ${progress} percent`}
            >
              <span>{progress}%</span>
              <small>{fasting.status}</small>
            </div>
            <div className="fast-meta">
              <p>
                <strong>{fasting.startedAt}</strong>
                Start
              </p>
              <p>
                <strong>{fasting.targetEndAt}</strong>
                Break fast
              </p>
              <p>
                <strong>{fasting.eatingWindow}</strong>
                Window
              </p>
            </div>
            <div className="fast-note">
              <strong>{fasting.protocol}</strong>
              <span>{fasting.hydrationTargetLiters}L water target</span>
            </div>
            <div className="phase-callout">
              <span>Current phase</span>
              <strong>{activeFastingPhase.name}</strong>
              <p>{activeFastingPhase.essence}</p>
            </div>
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

          <article id="fasting-phases" className="panel fasting-phases-panel">
            <div className="panel-title">
              <Flame size={20} aria-hidden="true" />
              <h2>Fasting Phases</h2>
            </div>
            <div className="phase-stack">
              {fastingPhases.map((phase) => (
                <section className={`phase-row phase-${phase.status.toLowerCase()}`} key={phase.id}>
                  <div className="phase-marker">
                    <strong>{phase.window}</strong>
                    <span>{phase.status}</span>
                  </div>
                  <div>
                    <h3>{phase.name}</h3>
                    <p>{phase.essence}</p>
                    <small>{phase.healthNote}</small>
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

          <article className="panel compact-panel">
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
    </main>
  )
}

export default App
