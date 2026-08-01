import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Globe, Smartphone, Download, Settings, Box } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Sources', path: '/sources', icon: Globe },
  { name: 'Devices', path: '/devices', icon: Smartphone },
  { name: 'Downloads', path: '/downloads', icon: Download },
  { name: 'Settings', path: '/settings', icon: Settings }
]

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="w-64 bg-surface-500 border-r border-white/[0.06] flex flex-col h-full drag-region">
      <div className="h-16 flex items-center px-6 border-b border-white/[0.06] no-drag">
        <div className="flex items-center gap-3 text-accent">
          <Box className="w-6 h-6" />
          <span className="font-semibold text-lg text-slate-100">ADB Installer</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto no-drag">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider px-3 mb-4">
          Main Menu
        </div>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path))

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'text-accent bg-accent/[0.08] shadow-[inset_0_0_20px_rgba(6,182,212,0.05)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </button>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/[0.06]">
        <div className="bg-surface-400 rounded-xl p-4 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">System Status</span>
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          </div>
          <div className="text-sm text-slate-200">All engines online</div>
        </div>
      </div>
    </aside>
  )
}
