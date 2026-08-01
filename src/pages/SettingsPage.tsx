import { useEffect, useState } from 'react'
import { settingsService } from '@/services'
import { Save, Terminal, Folder, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showSavedToast, setShowSavedToast] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await settingsService.getAll()
      setSettings(data)
    } catch (err) {
      console.error(err)
    }
  }

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      for (const [key, value] of Object.entries(settings)) {
        await settingsService.set(key, value)
      }
      setShowSavedToast(true)
      setTimeout(() => setShowSavedToast(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Settings</h1>
          <p className="text-slate-400">Configure ADB Installer Pro behavior and preferences</p>
        </div>
        <div className="flex items-center gap-4">
          {showSavedToast && (
            <span className="text-success-light text-sm flex items-center gap-1 animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              Saved successfully
            </span>
          )}
          <button 
            className="btn-primary" 
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <section className="card">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent" />
            ADB Configuration
          </h2>
          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="label">Custom ADB Path</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="input flex-1" 
                  placeholder="Leave empty to auto-detect (e.g. C:\platform-tools\adb.exe)"
                  value={settings['adb.path'] === 'adb' ? '' : settings['adb.path'] || ''}
                  onChange={(e) => handleChange('adb.path', e.target.value || 'adb')}
                />
                <button className="btn-secondary">Browse</button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                If empty, the app will try to find ADB in PATH or standard Android Studio locations.
              </p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-accent" />
            Download Preferences
          </h2>
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="label">Download Directory</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="input flex-1" 
                  placeholder="Default (Downloads/ADB Installer)"
                  value={settings['download.directory'] || ''}
                  onChange={(e) => handleChange('download.directory', e.target.value)}
                />
                <button className="btn-secondary">Browse</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Max Concurrent Downloads</label>
                <select 
                  className="input"
                  value={settings['download.maxConcurrent'] || '2'}
                  onChange={(e) => handleChange('download.maxConcurrent', e.target.value)}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                </select>
              </div>
              <div>
                <label className="label">Max Retries on Failure</label>
                <select 
                  className="input"
                  value={settings['download.maxRetries'] || '3'}
                  onChange={(e) => handleChange('download.maxRetries', e.target.value)}
                >
                  <option value="0">0 (No retries)</option>
                  <option value="1">1</option>
                  <option value="3">3</option>
                  <option value="5">5</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Security & Engines</h2>
          <div className="space-y-4 max-w-2xl">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center h-5">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-white/[0.1] bg-surface-600 text-accent focus:ring-accent/30 focus:ring-offset-surface-500"
                  checked={settings['browser.enabled'] !== 'false'}
                  onChange={(e) => handleChange('browser.enabled', e.target.checked.toString())}
                />
              </div>
              <div className="text-sm">
                <span className="font-medium text-slate-200 group-hover:text-white transition-colors block">
                  Enable Browser Fallback Engine
                </span>
                <span className="text-slate-500 block mt-0.5">
                  Allows downloading from complex websites using Playwright headless browser instead of simple HTML parsing.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center h-5">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-white/[0.1] bg-surface-600 text-accent focus:ring-accent/30 focus:ring-offset-surface-500"
                  checked={settings['adapter.autoUpdate'] !== 'false'}
                  onChange={(e) => handleChange('adapter.autoUpdate', e.target.checked.toString())}
                />
              </div>
              <div className="text-sm">
                <span className="font-medium text-slate-200 group-hover:text-white transition-colors block">
                  Auto-update Built-in Adapters
                </span>
                <span className="text-slate-500 block mt-0.5">
                  Automatically fetch new adapter rules when websites change their layout.
                </span>
              </div>
            </label>
          </div>
        </section>
      </div>
    </div>
  )
}
