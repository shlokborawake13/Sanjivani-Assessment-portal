import { AlertCircle, Info, RefreshCw } from 'lucide-react'

const typeConfig = {
  important: { icon: AlertCircle, bg: 'bg-[#fef3c7]', dot: 'bg-accent', text: 'text-[#92400e]' },
  info: { icon: Info, bg: 'bg-primary-fixed', dot: 'bg-primary', text: 'text-primary' },
  update: { icon: RefreshCw, bg: 'bg-[#dcfce7]', dot: 'bg-[#166534]', text: 'text-[#166534]' },
}

export default function AnnouncementCard({ announcement }) {
  const config = typeConfig[announcement.type] || typeConfig.info
  const Icon = config.icon

  return (
    <div className={`${config.bg} rounded-xl p-5 transition-all duration-200 hover:translate-y-[-1px]`}>
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full ${config.dot} mt-2 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className={`text-sm font-semibold ${config.text} truncate`}>
              {announcement.title}
            </h4>
          </div>
          <p className="text-xs text-on-surface-variant leading-relaxed mb-2">
            {announcement.message}
          </p>
          <time className="text-[10px] text-on-surface-variant/60 font-medium uppercase tracking-wider">
            {new Date(announcement.created_at || announcement.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
        </div>
      </div>
    </div>
  )
}
