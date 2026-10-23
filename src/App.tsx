import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'

const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const FireExplorerPage = lazy(() => import('@/pages/FireExplorerPage'))
const HarmonizationPage = lazy(() => import('@/pages/HarmonizationPage'))
const HistoricalCalendarPage = lazy(() => import('@/pages/HistoricalCalendarPage'))
const InsightsReportsPage = lazy(() => import('@/pages/InsightsReportsPage'))
const MethodologyPage = lazy(() => import('@/pages/MethodologyPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <div className="size-8 animate-spin rounded-full border-2 border-line border-t-ember-500" />
      <span className="text-xs font-medium text-fg-muted">Loading PyroLens Intelligence...</span>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Suspense fallback={<PageFallback />}>
              <OverviewPage />
            </Suspense>
          }
        />
        <Route
          path="explorer"
          element={
            <Suspense fallback={<PageFallback />}>
              <FireExplorerPage />
            </Suspense>
          }
        />
        <Route
          path="harmonization"
          element={
            <Suspense fallback={<PageFallback />}>
              <HarmonizationPage />
            </Suspense>
          }
        />
        <Route
          path="calendar"
          element={
            <Suspense fallback={<PageFallback />}>
              <HistoricalCalendarPage />
            </Suspense>
          }
        />
        <Route
          path="insights"
          element={
            <Suspense fallback={<PageFallback />}>
              <InsightsReportsPage />
            </Suspense>
          }
        />
        <Route
          path="methodology"
          element={
            <Suspense fallback={<PageFallback />}>
              <MethodologyPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<PageFallback />}>
              <NotFoundPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}

