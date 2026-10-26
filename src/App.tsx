import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const FireMapPage = lazy(() => import('@/pages/FireMapPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const HarmonizationPage = lazy(() => import('@/pages/HarmonizationPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const MethodologyPage = lazy(() => import('@/pages/MethodologyPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <div className="size-8 animate-spin rounded-full border-2 border-line border-t-ember-500" />
      <span className="text-xs font-medium text-fg-muted">Loading…</span>
    </div>
  )
}

const page = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={page(<DashboardPage />)} />
        <Route path="map" element={page(<FireMapPage />)} />
        <Route path="calendar" element={page(<CalendarPage />)} />
        <Route path="harmonization" element={page(<HarmonizationPage />)} />
        <Route path="reports" element={page(<ReportsPage />)} />
        <Route path="methodology" element={page(<MethodologyPage />)} />
        <Route path="explorer" element={<Navigate to="/map" replace />} />
        <Route path="insights" element={<Navigate to="/reports" replace />} />
        <Route path="*" element={page(<NotFoundPage />)} />
      </Route>
    </Routes>
  )
}
