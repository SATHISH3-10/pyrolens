import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import FireExplorerPage from '@/pages/FireExplorerPage'
import HarmonizationPage from '@/pages/HarmonizationPage'
import HistoricalCalendarPage from '@/pages/HistoricalCalendarPage'
import InsightsReportsPage from '@/pages/InsightsReportsPage'
import MethodologyPage from '@/pages/MethodologyPage'
import NotFoundPage from '@/pages/NotFoundPage'
import OverviewPage from '@/pages/OverviewPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="explorer" element={<FireExplorerPage />} />
        <Route path="harmonization" element={<HarmonizationPage />} />
        <Route path="calendar" element={<HistoricalCalendarPage />} />
        <Route path="insights" element={<InsightsReportsPage />} />
        <Route path="methodology" element={<MethodologyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
