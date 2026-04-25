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
import aptitudeRoutes from './routes/aptitude.js'
import codingRoutes from './routes/coding.js'
import communicationRoutes from './routes/communication.js'
import proctoringRoutes, { startHeartbeatMonitor } from './routes/proctoring.js'
import technicalRoutes from './routes/technical.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { verifySmtp } from './config/mailer.js'

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow cross-origin requests (Vercel → Render)
}))
// Allowed origins — includes production frontend URL from env
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean)

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' })) // Allow larger payloads for CSV uploads
app.use(securityHeaders())

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
app.use('/api/aptitude', aptitudeRoutes)
app.use('/api/coding', codingRoutes)
app.use('/api/communication', communicationRoutes)
app.use('/api/proctoring', proctoringRoutes)
app.use('/api/technical', technicalRoutes)

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
  // Start server-side heartbeat monitor for proctored exams
  startHeartbeatMonitor()
  console.log('🔒 Proctoring heartbeat monitor started')
})

export default app
