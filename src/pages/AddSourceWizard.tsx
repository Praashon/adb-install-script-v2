import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search, Code, CheckCircle, ShieldAlert, ArrowLeft } from 'lucide-react'
import { sourceService } from '@/services'

export function AddSourceWizard() {
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [adapterName, setAdapterName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  
  const navigate = useNavigate()

  const handleAnalyze = async () => {
    if (!url) return
    setIsAnalyzing(true)
    try {
      const result = await sourceService.analyze(url)
      setAnalysisResult(result)
      setAdapterName(result.metadata?.appName || result.title || result.domain)
      setStep(2)
    } catch (err) {
      console.error(err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const rules = {
        version: 1,
        parserType: 'html',
        rules: analysisResult.suggestedRules,
        downloadStrategy: 'html',
        metadata: {
          requiresBrowser: true
        }
      }
      
      await sourceService.create({
        domain: analysisResult.domain,
        name: adapterName,
        url: `https://${analysisResult.domain}`,
        rules,
        isCustom: true
      })
      navigate('/sources')
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <button className="btn-icon" onClick={() => navigate('/sources')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Add Source Adapter</h1>
          <p className="text-slate-400">Create a new plugin to support downloads from a website</p>
        </div>
      </div>

      <div className="flex mb-8">
        <div className="flex-1 border-t-2 border-accent relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-500 px-4 text-accent font-semibold text-sm">
            Step 1: Analyze
          </div>
        </div>
        <div className={`flex-1 border-t-2 relative transition-colors ${step >= 2 ? 'border-accent' : 'border-white/[0.06]'}`}>
          <div className={`absolute -top-3 left-1/2 -translate-x-1/2 bg-surface-500 px-4 font-semibold text-sm transition-colors ${step >= 2 ? 'text-accent' : 'text-slate-500'}`}>
            Step 2: Review & Save
          </div>
        </div>
      </div>

      {step === 1 && (
        <div className="card-glass animate-fade-in p-8 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Scan Website URL</h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Enter a link to a typical app download page on the website. The engine will analyze it and generate an adapter automatically.
          </p>

          <div className="flex gap-4 max-w-xl mx-auto">
            <input 
              className="input flex-1"
              placeholder="https://example.com/app-page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <button 
              className="btn-primary" 
              onClick={handleAnalyze}
              disabled={!url || isAnalyzing}
            >
              {isAnalyzing ? 'Scanning...' : 'Analyze'}
              {!isAnalyzing && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {step === 2 && analysisResult && (
        <div className="animate-fade-in space-y-6">
          <div className="card border-success/30 bg-success/5 flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-success mt-1 shrink-0" />
            <div>
              <h3 className="text-lg font-medium text-success-light mb-1">Analysis Complete</h3>
              <p className="text-slate-300 text-sm">
                Successfully extracted download selectors from {analysisResult.domain} with {analysisResult.confidence}% confidence.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <Code className="w-4 h-4 text-slate-400" />
                Adapter Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="label">Adapter Name</label>
                  <input 
                    className="input" 
                    value={adapterName}
                    onChange={(e) => setAdapterName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Domain</label>
                  <input className="input" value={analysisResult.domain} disabled />
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-medium text-slate-200 mb-4 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-slate-400" />
                Generated Selectors
              </h3>
              
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="text-slate-500 block text-xs">Download Link (Primary)</span>
                  <code className="bg-surface-600 px-2 py-1 rounded text-accent">
                    {analysisResult.suggestedRules.downloadLinkSelector || 'None detected'}
                  </code>
                </div>
                <div className="text-sm">
                  <span className="text-slate-500 block text-xs">Download Button (Fallback)</span>
                  <code className="bg-surface-600 px-2 py-1 rounded text-accent">
                    {analysisResult.suggestedRules.downloadPageSelector || 'None detected'}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-white/[0.06]">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save & Enable Adapter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
