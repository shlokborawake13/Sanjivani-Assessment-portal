import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import useHeartbeat from './hooks/useHeartbeat'
import useAuthStore from './store/authStore'
import PublicLayout from './layouts/PublicLayout'
import AuthLayout from './layouts/AuthLayout'
import ProtectedRoute from './components/ProtectedRoute'
import LoadingSpinner from './components/LoadingSpinner'

// Lazy-loaded pages
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Performance = lazy(() => import('./pages/Performance'))
const Results = lazy(() => import('./pages/Results'))
const Support = lazy(() => import('./pages/Support'))
const Account = lazy(() => import('./pages/Account'))
const AssessmentDetail = lazy(() => import('./pages/AssessmentDetail'))
const TakeAssessment = lazy(() => import('./pages/TakeAssessment'))
const CodingAssessment = lazy(() => import('./pages/CodingAssessment'))
const CommunicationTest = lazy(() => import('./pages/CommunicationTest'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))

// Admin pages
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const AdminAssessments = lazy(() => import('./pages/AdminAssessments'))
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements'))
const AdminSupport = lazy(() => import('./pages/AdminSupport'))

// Manager pages
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const ManagerStudents = lazy(() => import('./pages/ManagerStudents'))
const ManagerResults = lazy(() => import('./pages/ManagerResults'))
const ManagerAssessments = lazy(() => import('./pages/ManagerAssessments'))

// Role-based dashboard router
function RoleDashboard() {
  const role = useAuthStore((s) => s.role)
  if (role === 'admin') return <AdminDashboard />
  if (role === 'manager') return <ManagerDashboard />
  return <Dashboard />
}

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  // Send heartbeat every 30s for real-time online status
  useHeartbeat()

  useEffect(() => {
    if (isAuthenticated) refreshUser()
  }, [])

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Public Routes */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* ── Protected Routes (Navbar + full-width, no sidebar) ── */}
        <Route
          element={
            <ProtectedRoute>
              <AuthLayout />
            </ProtectedRoute>
          }
        >
          {/* Shared pages — any authenticated user */}
          <Route path="/profile" element={<Account />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />

          {/* Dashboard — shows the right page based on role */}
          <Route path="/dashboard" element={<RoleDashboard />} />
          <Route path="/performance" element={
            <ProtectedRoute allowedRoles={['student']}><Performance /></ProtectedRoute>
          } />
          <Route path="/results" element={
            <ProtectedRoute allowedRoles={['student', 'manager']}><Results /></ProtectedRoute>
          } />
          <Route path="/support" element={<Support />} />
          <Route path="/assessments/:category" element={
            <ProtectedRoute allowedRoles={['student']}><AssessmentDetail /></ProtectedRoute>
          } />

          {/* Admin pages */}
          <Route path="/users" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
          } />
          <Route path="/assessments" element={
            <ProtectedRoute allowedRoles={['admin', 'manager', 'student']}><AdminAssessments /></ProtectedRoute>
          } />
          <Route path="/announcements" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminAnnouncements /></ProtectedRoute>
          } />
          <Route path="/admin/support" element={
            <ProtectedRoute allowedRoles={['admin']}><AdminSupport /></ProtectedRoute>
          } />

          {/* Manager pages */}
          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['manager']}><ManagerResults /></ProtectedRoute>
          } />
          <Route path="/students" element={
            <ProtectedRoute allowedRoles={['manager']}><ManagerStudents /></ProtectedRoute>
          } />
        </Route>

        {/* Standalone assessment pages (no layout — they go fullscreen) */}
        <Route path="/assessment/:id/take" element={
          <ProtectedRoute allowedRoles={['student']}><TakeAssessment /></ProtectedRoute>
        } />
        <Route path="/assessment/:id/code" element={
          <ProtectedRoute allowedRoles={['student']}><CodingAssessment /></ProtectedRoute>
        } />
        <Route path="/assessment/:id/communicate" element={
          <ProtectedRoute allowedRoles={['student']}><CommunicationTest /></ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  )
}
