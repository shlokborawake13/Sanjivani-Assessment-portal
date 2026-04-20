import Leaderboard from '../components/Leaderboard'

export default function LeaderboardPage() {
  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-1">Rankings</p>
        <h1 className="text-2xl md:text-3xl font-bold text-on-surface">Leaderboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          See how you rank against other students across all assessment categories.
        </p>
      </div>
      <Leaderboard />
    </div>
  )
}
