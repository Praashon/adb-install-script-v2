import { useEffect, useState } from 'react'
import { Folder, Trash2, Search, PlayCircle, PauseCircle, RefreshCw, XCircle } from 'lucide-react'
import { downloadService, jobService } from '@/services'
import { useAppStore } from '@/stores/appStore'
import { cn, formatBytes, formatDuration, formatDate } from '@/lib/utils'

export function DownloadsPage() {
  const { jobs, setJobs, removeJob, updateJob } = useAppStore()
  const [downloads, setDownloads] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadData()
    // In a real app we'd poll or listen to IPC events
    const interval = setInterval(loadData, 2000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const [jobsData, downloadsData] = await Promise.all([
        jobService.getAll(),
        downloadService.getAll()
      ])
      setJobs(jobsData as any[])
      setDownloads(downloadsData as any[])
    } catch (err) {
      console.error(err)
    }
  }

  const activeJobs = jobs.filter(j => ['queued', 'running', 'paused'].includes(j.status))
  const completedJobs = jobs.filter(j => !['queued', 'running', 'paused'].includes(j.status))

  const handlePauseResume = async (jobId: string, status: string) => {
    try {
      if (status === 'paused') {
        await jobService.resume(jobId)
      } else {
        await jobService.pause(jobId)
      }
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const handleCancel = async (jobId: string) => {
    try {
      await jobService.cancel(jobId)
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Downloads & Jobs</h1>
          <p className="text-slate-400">Monitor active downloads and installation progress</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="text"
            className="input pl-9 w-64"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="section-title flex items-center gap-2">
            Active Tasks
            <span className="badge-accent">{activeJobs.length}</span>
          </h2>
          
          <div className="space-y-4">
            {activeJobs.length === 0 ? (
              <div className="card text-center py-8 text-slate-500 border-dashed">
                No active tasks
              </div>
            ) : (
              activeJobs.map(job => (
                <div key={job.id} className="card relative overflow-hidden animate-slide-up border-accent/20">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center">
                        <RefreshCw className={cn("w-5 h-5 text-accent", job.status === 'running' && "animate-spin")} />
                      </div>
                      <div className="max-w-md">
                        <h3 className="font-semibold text-slate-200 truncate" title={job.url}>
                          {job.url.split('/').pop() || job.url}
                        </h3>
                        <p className="text-xs text-slate-400">{job.currentStep || 'Initializing...'}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        className="btn-icon" 
                        onClick={() => handlePauseResume(job.id, job.status)}
                      >
                        {job.status === 'paused' ? <PlayCircle className="w-5 h-5" /> : <PauseCircle className="w-5 h-5" />}
                      </button>
                      <button className="btn-icon hover:text-danger hover:bg-danger/10" onClick={() => handleCancel(job.id)}>
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="progress-bar mt-4">
                    <div 
                      className="progress-bar-fill"
                      style={{ width: `${Math.max(2, job.progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-2 text-slate-500">
                    <span>{job.status.toUpperCase()}</span>
                    <span>{Math.round(job.progress)}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="section-title">History</h2>
          
          <div className="card p-0 overflow-hidden border-white/[0.04]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-surface-400/50 border-b border-white/[0.04]">
                <tr>
                  <th className="px-6 py-4 font-medium">File</th>
                  <th className="px-6 py-4 font-medium">Size</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {downloads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No downloaded files
                    </td>
                  </tr>
                ) : (
                  downloads
                    .filter(d => d.filename.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(download => (
                    <tr key={download.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-300">
                        {download.filename}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {download.fileSize ? formatBytes(download.fileSize) : 'Unknown'}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {formatDate(download.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        {download.status === 'completed' ? (
                          <span className="badge-success">Completed</span>
                        ) : download.status === 'failed' ? (
                          <span className="badge-danger">Failed</span>
                        ) : (
                          <span className="badge-neutral">{download.status}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          className="btn-icon"
                          onClick={() => downloadService.openFolder(download.id)}
                          title="Open Folder"
                        >
                          <Folder className="w-4 h-4" />
                        </button>
                        <button 
                          className="btn-icon hover:text-danger hover:bg-danger/10"
                          onClick={() => {
                            downloadService.remove(download.id)
                            loadData()
                          }}
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
