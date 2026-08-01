import { useEffect, useState } from 'react'
import { Smartphone, RefreshCw, Star, Info, Usb } from 'lucide-react'
import { deviceService } from '@/services'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'

export function DevicesPage() {
  const { devices, setDevices, preferredDeviceSerial, setPreferredDevice } = useAppStore()
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadDevices = async () => {
    setIsRefreshing(true)
    try {
      const data = await deviceService.list()
      setDevices(data as any[])
      
      const preferred = data.find((d: any) => d.isPreferred)
      if (preferred) {
        setPreferredDevice(preferred.serial)
      } else if (data.length > 0 && !preferredDeviceSerial) {
        // Auto-select first if none selected
        handleSetPreferred(data[0].serial)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const handleSetPreferred = async (serial: string) => {
    try {
      await deviceService.setPreferred(serial)
      setPreferredDevice(serial)
      setDevices(devices.map(d => ({ ...d, isPreferred: d.serial === serial })))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 mb-1">Connected Devices</h1>
          <p className="text-slate-400">Manage ADB connections and preferred installation targets</p>
        </div>
        <button 
          className="btn-secondary"
          onClick={loadDevices}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          Refresh Devices
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {devices.map((device, i) => {
          const isPreferred = device.serial === preferredDeviceSerial
          const isOnline = device.status === 'online'

          return (
            <div 
              key={device.serial} 
              className={cn(
                "card relative overflow-hidden transition-all duration-300 animate-slide-up",
                isPreferred && "border-accent/50 shadow-glow"
              )}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              {isPreferred && (
                <div className="absolute top-0 right-0 w-16 h-16 bg-accent/10 rounded-bl-full pointer-events-none" />
              )}
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    isOnline ? "bg-success/10 text-success-light" : "bg-slate-500/10 text-slate-400"
                  )}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-slate-200">
                      {device.model || 'Unknown Device'}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-success shadow-glow-success" : "bg-slate-500")} />
                      <span className="text-xs text-slate-400 font-mono">{device.serial}</span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => handleSetPreferred(device.serial)}
                  className={cn(
                    "btn-icon rounded-full",
                    isPreferred ? "text-accent bg-accent/10 hover:text-accent-300 hover:bg-accent/20" : "hover:text-accent"
                  )}
                  title={isPreferred ? "Preferred device" : "Set as preferred"}
                >
                  <Star className={cn("w-5 h-5", isPreferred && "fill-current")} />
                </button>
              </div>

              <div className="bg-surface-400/50 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm mb-4 border border-white/[0.04]">
                <div>
                  <span className="text-slate-500 block text-xs mb-1">Android Version</span>
                  <span className="text-slate-200 font-medium">{device.androidVersion || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-xs mb-1">Architecture</span>
                  <span className="text-slate-200 font-medium uppercase">{device.architecture || 'Unknown'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block text-xs mb-1">Manufacturer</span>
                  <span className="text-slate-200 font-medium">{device.manufacturer || 'Unknown'}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="btn-secondary flex-1 py-2 text-xs" disabled={!isOnline}>
                  <Info className="w-4 h-4" />
                  Details
                </button>
                <button className="btn-secondary flex-1 py-2 text-xs" disabled={!isOnline}>
                  Installed Apps
                </button>
              </div>
            </div>
          )
        })}

        {devices.length === 0 && !isRefreshing && (
          <div className="col-span-full py-16 text-center card border-dashed">
            <Usb className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-300 mb-2">No Devices Connected</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              Connect an Android device via USB and ensure USB Debugging is enabled in Developer Options.
            </p>
            <button className="btn-primary" onClick={loadDevices}>
              Scan Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
