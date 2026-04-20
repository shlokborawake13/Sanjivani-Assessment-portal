import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'

dotenv.config()

import authRoutes from './routes/auth.js'
import profileRoutes from './routes/profile.js'
import assessmentsRoutes from './routes/assessments.js'
import resultsRoutes from './routes/results.js'
import announcementsRoutes from './routes/announcements.js'
import supportRoutes from './routes/support.js'
import adminRoutes from './routes/admin.js'
import managerRoutes from './routes/manager.js'
import attemptsRoutes from './routes/attempts.js'
import leaderboardRoutes from './routes/leaderboard.js'
import activityRoutes from './routes/activity.js'
import { verifySmtp } from './config/mailer.js'

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(helmet())
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))
app.use(morgan('dev'))
app.use(express.json())

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/assessments', assessmentsRoutes)
app.use('/api/results', resultsRoutes)
app.use('/api/announcements', announcementsRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/manager', managerRoutes)
app.use('/api/attempts', attemptsRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/activity', activityRoutes)

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

app.listen(PORT, async () => {
  console.log(`🚀 Sanjivani API running on http://localhost:${PORT}`)
  await verifySmtp()
})

export default app
