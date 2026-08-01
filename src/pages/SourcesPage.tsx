import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CheckCircle2, XCircle, AlertTriangle, Activity, Database, FileCode } from 'lucide-react'
import { sourceService } from '@/services'
import { cn, formatDate } from '@/lib/utils'

interface Source {
  id: string
  domain: string
  name: string
  status: 'healthy' | 'degraded' | 'broken' | 'disabled'
  isBuiltIn: boolean
}

interface HealthStatus {
  sourceId: string
  successRate: number
  totalAttempts: number
  failureCount: number
  activeAdapterVersion?: number
}

export function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [healthData, setHealthData] = useState<Record<string, HealthStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadSources()
  }, [])

  const loadSources = async () => {
    setIsLoading(true)
    try {
      const data = await sourceService.getAll()
      setSources(data as Source[])
      // In a real app we'd fetch health stats from IPC here too
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="w-5 h-5 text-success-light" />
      case 'broken': return <XCircle className="w-5 h-5 text-danger-light" />
      case 'degraded': return <AlertTriangle className="w-5 h-5 text-warning-light" />
      default: return <AlertTriangle className="w-5 h-5 text-slate-400" />
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Source Adapters</h1>
          <p className="text-slate-400">Manage supported APK websites and custom plugins</p>
        </div>
        <div className="flex gap-3">
          <button className="btn-secondary">
            <FileCode className="w-4 h-4" />
            Import Plugin
          </button>
          <button 
            className="btn-primary"
            onClick={() => navigate('/sources/add')}
          >
            <Plus className="w-4 h-4" />
            Add New Source
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sources.map((source, i) => (
          <div 
            key={source.id} 
            className="card hover:border-accent/30 transition-all cursor-pointer animate-slide-up group"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  source.isBuiltIn ? "bg-accent/10 text-accent" : "bg-purple-500/10 text-purple-400"
                )}>
                  {source.isBuiltIn ? <Database className="w-5 h-5" /> : <FileCode className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">{source.name}</h3>
                  <p className="text-xs text-slate-400">{source.domain}</p>
                </div>
              </div>
              <StatusIcon status={source.status} />
            </div>

            <div className="divider"></div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500 mb-1 text-xs uppercase tracking-wider">Success Rate</div>
                <div className="font-medium text-slate-200">
                  {healthData[source.id]?.successRate ?? 100}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-1 text-xs uppercase tracking-wider">Version</div>
                <div className="font-medium text-slate-200">
                  v{healthData[source.id]?.activeAdapterVersion ?? 1}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.06] flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="btn-secondary flex-1 py-1.5 text-xs">Test</button>
              <button className="btn-secondary flex-1 py-1.5 text-xs">Edit</button>
            </div>
          </div>
        ))}

        {sources.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center card border-dashed">
            <Database className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Sources Found</h3>
            <p className="text-slate-500">Add a new source adapter to start downloading APKs.</p>
          </div>
        )}
      </div>
    </div>
  )
}
