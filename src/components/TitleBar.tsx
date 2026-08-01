import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  const isMac = navigator.userAgent.toLowerCase().includes('mac')
  
  // macOS style traffic lights are handled by electron titleBarStyle: 'hidden' 
  // on the left, so we only need Windows controls on the right for non-macOS
  
  if (isMac) {
    return <div className="h-8 drag-region bg-surface-500 w-full" />
  }

  return (
    <div className="h-8 drag-region bg-surface-500 flex justify-between items-center w-full select-none z-50 relative">
      <div className="pl-4 text-xs font-medium text-slate-400">ADB APK Installer Pro</div>
      
      <div className="flex h-full no-drag">
        <button
          onClick={() => window.electronAPI.window.minimize()}
          className="h-full px-4 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center justify-center"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => window.electronAPI.window.maximize()}
          className="h-full px-4 text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-colors flex items-center justify-center"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.electronAPI.window.close()}
          className="h-full px-4 text-slate-400 hover:text-white hover:bg-danger transition-colors flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
