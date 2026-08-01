import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Link as LinkIcon, Smartphone, ArrowRight, Zap, Shield, FileCheck } from 'lucide-react'
import { jobService } from '@/services'
import { useAppStore } from '@/stores/appStore'

export function HomePage() {
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { preferredDeviceSerial } = useAppStore()

  const handleInstall = async () => {
    if (!url) return
    
    setIsLoading(true)
    try {
      const jobId = await jobService.create(url, preferredDeviceSerial || undefined)
      navigate('/downloads')
    } catch (error) {
      console.error('Failed to create job', error)
      // Todo: show toast error
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-12 animate-slide-down">
        <h1 className="text-4xl font-bold mb-4">
          <span className="text-gradient">Smart APK Source Engine</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Paste any APK website URL. We'll automatically detect the source, extract the download, and install it to your connected ADB device.
        </p>
      </div>

      <div className="card-glass mb-12 p-8 relative overflow-hidden animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10">
          <label className="label text-base mb-3 text-slate-200 flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-accent" />
            Paste APK URL
          </label>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="input-lg pl-12"
                placeholder="https://apkmirror.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
              />
            </div>
            <button 
              className="btn-primary px-8 text-base font-semibold"
              onClick={handleInstall}
              disabled={!url || isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <>
                  Install
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="card">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">Smart Extraction</h3>
          <p className="text-sm text-slate-400">
            Automatically parses websites, handles redirects, and bypasses timers to get the direct APK file.
          </p>
        </div>
        
        <div className="card">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mb-4">
            <FileCheck className="w-6 h-6 text-success-light" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">Bundle Support</h3>
          <p className="text-sm text-slate-400">
            Natively handles standard APKs, XAPK archives, and split APKS bundles with automatic base sorting.
          </p>
        </div>
        
        <div className="card">
          <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-warning-light" />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">Secure Isolation</h3>
          <p className="text-sm text-slate-400">
            Custom adapters run in a strict JSON-only sandbox. No arbitrary code execution or security risks.
          </p>
        </div>
      </div>
    </div>
  )
}
