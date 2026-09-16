import { useState } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../store'
import { formatTotalRuntime, pluralize } from '@shared/utils'
import ShareCard from '../components/ShareCard'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  CartesianGrid
} from 'recharts'

const PIE_COLORS = [
  '#f5b544',
  '#e84855',
  '#3ecf8e',
  '#5b8def',
  '#b07ce8',
  '#f072a1',
  '#4cc9d8',
  '#f9c74f',
  '#8d99ae',
  '#ef476f',
  '#06d6a0',
  '#118ab2'
]

const tooltipStyle = {
  background: '#12141a',
  border: '1px solid #262b35',
  borderRadius: '10px',
  fontSize: '12px',
  color: '#ececf1'
}

export default function StatsView() {
  const stats = useData(s => s.stats)
  const library = useData(s => s.library)
  const [shareOpen, setShareOpen] = useState(false)

  if (!stats || stats.totalTitles === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-8 py-7">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-12 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-ink-dim">
              <path d="M4 20V11M10 20V4M16 20v-7M22 20H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">No statistics yet</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-soft">
              Add {pluralize(0, 'title')} to your library and your watching patterns will appear here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full px-8 py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-7 flex items-end justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Insights</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Your watching patterns at a glance</p>
        </div>
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v12m0 0l-4-4m4 4l4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Share my stats
        </button>
      </motion.div>

      {shareOpen && <ShareCard onClose={() => setShareOpen(false)} />}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <StatCards stats={stats} />

        <ChartCard title="Watch time by genre" className="md:col-span-2 xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.byGenre} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262b35" vertical={false} />
              <XAxis
                dataKey="genre"
                stroke="#6d7186"
                fontSize={10.5}
                tickLine={false}
                axisLine={{ stroke: '#262b35' }}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={58}
              />
              <YAxis stroke="#6d7186" fontSize={10.5} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                contentStyle={tooltipStyle}
                formatter={v => [formatTotalRuntime(Number(v)), 'Watch time'] as [string, string]}
              />
              <Bar dataKey="minutes" radius={[5, 5, 0, 0]} fill="#f5b544" maxBarSize={46} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Movies vs series">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Movies', value: stats.byKind.movie },
                  { name: 'Series', value: stats.byKind.series }
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={3}
                stroke="none"
              >
                <Cell fill="#f5b544" />
                <Cell fill="#5b8def" />
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rating distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.ratingDistribution} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262b35" vertical={false} />
              <XAxis
                dataKey="rating"
                stroke="#6d7186"
                fontSize={10.5}
                tickLine={false}
                axisLine={{ stroke: '#262b35' }}
              />
              <YAxis stroke="#6d7186" fontSize={10.5} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                contentStyle={tooltipStyle}
                formatter={v => [Number(v), 'Titles rated'] as [number, string]}
              />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} fill="#3ecf8e" maxBarSize={46} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Activity by month" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthlyActivity} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262b35" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#6d7186"
                fontSize={10.5}
                tickLine={false}
                axisLine={{ stroke: '#262b35' }}
              />
              <YAxis stroke="#6d7186" fontSize={10.5} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                contentStyle={tooltipStyle}
                formatter={v => [Number(v), 'Titles finished'] as [number, string]}
              />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} fill="#b07ce8" maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {stats.topPeople.length > 0 && (
          <ChartCard title="Most watched people">
            <div className="flex flex-col gap-2.5">
              {stats.topPeople.slice(0, 8).map(p => (
                <div key={`${p.name}-${p.role}`} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs text-ink-soft">{p.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-dim to-gold"
                      style={{ width: `${(p.count / stats.topPeople[0]!.count) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs text-ink-dim">{p.count}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        )}

        {stats.byDecade.length > 0 && (
          <ChartCard title="By decade">
            <ResponsiveContainer width="100%" height={260}>
              <RadialBarChart
                data={stats.byDecade.map((d, i) => ({
                  name: `${d.decade}s`,
                  count: d.count,
                  fill: PIE_COLORS[i % PIE_COLORS.length]
                }))}
                innerRadius="22%"
                outerRadius="100%"
                dataKey="count"
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar background={{ fill: '#1d2028' }} cornerRadius={6} />
                <Tooltip contentStyle={tooltipStyle} />
              </RadialBarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Footer note about data locality */}
      <p className="mt-8 text-[11px] text-ink-dim">
        All statistics are computed locally from your on-device library · {library.length} tracked titles
      </p>
    </div>
  )
}

function ChartCard({
  title,
  children,
  className = ''
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col rounded-2xl border border-line bg-surface/60 p-5 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

function StatCards({ stats }: { stats: NonNullable<ReturnType<typeof useData.getState>['stats']> }) {
  const cards = [
    { label: 'Total titles', value: String(stats.totalTitles), sub: pluralize(stats.totalTitles, 'title') },
    {
      label: 'Watch time',
      value: formatTotalRuntime(stats.totalRuntimeMinutes),
      sub: 'of completed content'
    },
    { label: 'Average rating', value: stats.averageRating ? stats.averageRating.toFixed(1) : '—', sub: 'across rated titles' },
    { label: 'Completed', value: String(stats.completed), sub: `${stats.watching} watching · ${stats.planned} planned` }
  ]
  return (
    <>
      {cards.map(c => (
        <div
          key={c.label}
          className="flex flex-col justify-between rounded-2xl border border-line bg-gradient-to-br from-surface-2 to-surface p-5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
            {c.label}
          </span>
          <span className="mt-2 font-display text-3xl font-bold text-gradient-gold">{c.value}</span>
          <span className="mt-1 text-xs text-ink-dim">{c.sub}</span>
        </div>
      ))}
    </>
  )
}
