import { HashRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { TitleBar } from '@/components/TitleBar'
import { Toasts } from '@/components/Toasts'
import { useEventBridge } from '@/hooks/useEventBridge'
import { HomePage } from '@/pages/HomePage'
import { SourcesPage } from '@/pages/SourcesPage'
import { AddSourceWizard } from '@/pages/AddSourceWizard'
import { DevicesPage } from '@/pages/DevicesPage'
import { DownloadsPage } from '@/pages/DownloadsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  useEventBridge()

  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-surface-500">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/sources/add" element={<AddSourceWizard />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
        <Toasts />
      </div>
    </HashRouter>
  )
}
