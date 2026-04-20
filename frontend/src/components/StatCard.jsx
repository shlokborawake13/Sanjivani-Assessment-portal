import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function StatCard({ label, value, change, icon: Icon, color }) {
  const isPositive = change > 0
  const isNeutral = change === 0

  return (
    <div className="bg-surface-lowest rounded-xl p-6 transition-all duration-300 hover:translate-y-[-1px]" style={{ boxShadow: 'var(--shadow-ambient)' }}>
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color || '#1e3a8a'}12` }}
        >
          <Icon size={18} style={{ color: color || '#1e3a8a' }} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            isPositive ? 'bg-[#dcfce7] text-[#166534]' : isNeutral ? 'bg-surface-high text-on-surface-variant' : 'bg-error-container text-error'
          }`}>
            {isPositive ? <TrendingUp size={12} /> : isNeutral ? <Minus size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-on-surface mb-1">{value}</p>
      <p className="text-xs text-on-surface-variant">{label}</p>
    </div>
  )
}
