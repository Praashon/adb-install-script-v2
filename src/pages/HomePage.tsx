import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Link as LinkIcon,
  ArrowRight,
  Zap,
  Shield,
  FileCheck,
  Smartphone,
  AlertTriangle,
  XCircle,
  DownloadCloud,
  PackageCheck,
  Activity,
  FolderOpen,
  ShieldQuestion
} from 'lucide-react'
import { appService, jobService } from '@/services'
import { useAppStore, notify } from '@/stores/appStore'
import { STEP_LABELS } from '@/types'
import type { AppStats } from '../../electron/preload'
import { cn } from '@/lib/utils'

export function HomePage() {
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stats, setStats] = useState<AppStats | null>(null)
  const navigate = useNavigate()

  const devices = useAppStore((s) => s.devices)
  const jobs = useAppStore((s) => s.jobs)
  const adbAvailable = useAppStore((s) => s.adbAvailable)
  const preferredDevice = useAppStore((s) => s.preferredDevice)()

  const activeJobs = jobs.filter((j) => ['queued', 'running', 'paused'].includes(j.status))
  const unauthorized = devices.find((d) => d.status === 'unauthorized')

  useEffect(() => {
    const load = (): void => {
      appService
        .getStats()
        .then(setStats)
        .catch(() => undefined)
    }

    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [])

  const submit = async (mode: 'install' | 'download'): Promise<void> => {
    const trimmed = url.trim()
    if (!trimmed) return

    if (!/^https?:\/\//i.test(trimmed)) {
      notify.error('That does not look like a link', 'URLs must start with http:// or https://')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'install') {
        await jobService.create(trimmed, preferredDevice?.serial)
        notify.success(
          'Install queued',
          preferredDevice
            ? `Target: ${preferredDevice.model || preferredDevice.serial}`
            : 'The first available device will be used'
        )
      } else {
        await jobService.createDownload(trimmed)
        notify.success('Download queued', 'The APK will be saved without installing')
      }

      setUrl('')
      navigate('/downloads')
    } catch (error) {
      notify.error('Could not start the job', error instanceof Error ? error.message : undefined)
    } finally {
      setIsSubmitting(false)
    }
  }

  const installFromFile = async (): Promise<void> => {
    try {
      const result = await jobService.createFromFile(preferredDevice?.serial)
      if (result.cancelled) return

      notify.success('Installing from file', result.filename)
      navigate('/downloads')
    } catch (error) {
      notify.error('Could not install that file', error instanceof Error ? error.message : undefined)
    }
  }

  const cancelJob = async (id: string): Promise<void> => {
    try {
      await jobService.cancel(id)
      notify.info('Job cancelled')
    } catch (error) {
      notify.error('Could not cancel', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-10 animate-slide-down">
        <h1 className="text-4xl font-bold mb-4">
          <span className="text-gradient">Smart APK Source Engine</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Paste any APK website URL. We&apos;ll automatically detect the source, extract the
          download, and install it to your connected ADB device.
        </p>
      </div>

      <DeviceBanner
        adbAvailable={adbAvailable}
        deviceName={preferredDevice ? preferredDevice.model || preferredDevice.serial : null}
        unauthorizedSerial={unauthorized?.serial ?? null}
        onManage={() => navigate(adbAvailable ? '/devices' : '/settings')}
      />

      <div
        className="card-glass mb-8 p-8 relative overflow-hidden animate-slide-up"
        style={{ animationDelay: '0.1s' }}
      >
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <label htmlFor="apk-url" className="label text-base mb-3 text-slate-200 flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-accent" />
            Paste APK URL
          </label>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-slate-400" />
              </div>
              <input
                id="apk-url"
                type="text"
                className="input-lg pl-12"
                placeholder="https://apkmirror.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit('install')
                }}
                spellCheck={false}
              />
            </div>
            <button
              className="btn-primary px-8 text-base font-semibold"
              onClick={() => void submit('install')}
              disabled={!url.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Queueing…
                </>
              ) : (
                <>
                  Install
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between mt-4 gap-4">
            <p className="text-xs text-slate-500">
              Works with APKMirror, APKPure, APKCombo, and direct .apk / .xapk / .apks links.
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                className="btn-ghost text-xs py-1.5"
                onClick={() => void submit('download')}
                disabled={!url.trim() || isSubmitting}
              >
                <DownloadCloud className="w-4 h-4" />
                Download only
              </button>
              <button
                className="btn-ghost text-xs py-1.5"
                onClick={() => void installFromFile()}
                title="Install an APK, XAPK, or APKS already saved on this PC"
              >
                <FolderOpen className="w-4 h-4" />
                Install from file
              </button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-start gap-2">
            <ShieldQuestion className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">
              Some sites sit behind an anti-bot service and refuse automated requests entirely.
              For those, download the APK in your normal browser, then use{' '}
              <span className="text-slate-400">Install from file</span>.
            </p>
          </div>
        </div>
      </div>

      {activeJobs.length > 0 && (
        <section className="mb-8 animate-fade-in">
          <h2 className="section-title flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            In progress
            <span className="badge-accent">{activeJobs.length}</span>
          </h2>

          <div className="space-y-3">
            {activeJobs.slice(0, 3).map((job) => (
              <div key={job.id} className="card border-accent/20 py-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate" title={job.url}>
                      {job.url}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {job.status === 'paused'
                        ? 'Paused'
                        : STEP_LABELS[job.currentStep ?? ''] ?? 'Starting…'}
                    </p>
                  </div>
                  <button
                    className="btn-icon hover:text-danger hover:bg-danger/10 shrink-0"
                    onClick={() => void cancelJob(job.id)}
                    title="Cancel job"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${Math.max(2, job.progress)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="btn-ghost text-xs mt-3" onClick={() => navigate('/downloads')}>
            View all jobs
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
      )}

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8 animate-slide-up">
          <StatTile label="Installed apps" value={stats.installedApps} icon={PackageCheck} />
          <StatTile label="Downloads" value={stats.totalDownloads} icon={DownloadCloud} />
          <StatTile label="Sources" value={stats.sources} icon={Shield} />
          <StatTile
            label="Devices online"
            value={stats.devicesOnline}
            icon={Smartphone}
            tone={stats.devicesOnline > 0 ? 'success' : 'muted'}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <FeatureCard
          icon={Zap}
          tone="accent"
          title="Smart Extraction"
          body="Automatically parses websites, follows redirects, and falls back to a headless browser to get the direct APK file."
        />
        <FeatureCard
          icon={FileCheck}
          tone="success"
          title="Bundle Support"
          body="Natively handles standard APKs, XAPK archives, and split APKS bundles with automatic base sorting and OBB push."
        />
        <FeatureCard
          icon={Shield}
          tone="warning"
          title="Secure Isolation"
          body="Custom adapters run in a strict JSON-only sandbox. No arbitrary code execution or security risks."
        />
      </div>
    </div>
  )
}

function DeviceBanner({
  adbAvailable,
  deviceName,
  unauthorizedSerial,
  onManage
}: {
  adbAvailable: boolean
  deviceName: string | null
  unauthorizedSerial: string | null
  onManage: () => void
}) {
  if (!adbAvailable) {
    return (
      <Banner
        tone="danger"
        icon={AlertTriangle}
        message="ADB was not found. Set the path to adb.exe in Settings, or install Android platform-tools."
        actionLabel="Open settings"
        onAction={onManage}
      />
    )
  }

  if (unauthorizedSerial) {
    return (
      <Banner
        tone="warning"
        icon={AlertTriangle}
        message={`Device ${unauthorizedSerial} is connected but unauthorized. Accept the USB debugging prompt on the device.`}
        actionLabel="Manage devices"
        onAction={onManage}
      />
    )
  }

  if (!deviceName) {
    return (
      <Banner
        tone="warning"
        icon={Smartphone}
        message="No device connected. You can still download APKs - connect a device to install them."
        actionLabel="Manage devices"
        onAction={onManage}
      />
    )
  }

  return (
    <Banner
      tone="success"
      icon={Smartphone}
      message={`Ready to install to ${deviceName}`}
      actionLabel="Change device"
      onAction={onManage}
    />
  )
}

const BANNER_TONES = {
  success: 'border-success/25 bg-success/[0.06] text-success-light',
  warning: 'border-warning/25 bg-warning/[0.06] text-warning-light',
  danger: 'border-danger/25 bg-danger/[0.06] text-danger-light'
}

function Banner({
  tone,
  icon: Icon,
  message,
  actionLabel,
  onAction
}: {
  tone: keyof typeof BANNER_TONES
  icon: typeof Smartphone
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 mb-6 rounded-xl border animate-fade-in',
        BANNER_TONES[tone]
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-sm flex-1 text-slate-300">{message}</span>
      <button className="text-xs font-medium hover:underline shrink-0" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'accent'
}: {
  label: string
  value: number
  icon: typeof Smartphone
  tone?: 'accent' | 'success' | 'muted'
}) {
  const toneClass =
    tone === 'success' ? 'text-success-light' : tone === 'muted' ? 'text-slate-500' : 'text-accent'

  return (
    <div className="stat-tile">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', toneClass)} />
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  )
}

const FEATURE_TONES = {
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success-light',
  warning: 'bg-warning/10 text-warning-light'
}

function FeatureCard({
  icon: Icon,
  tone,
  title,
  body
}: {
  icon: typeof Zap
  tone: keyof typeof FEATURE_TONES
  title: string
  body: string
}) {
  return (
    <div className="card">
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
          FEATURE_TONES[tone]
        )}
      >
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400">{body}</p>
    </div>
  )
}
