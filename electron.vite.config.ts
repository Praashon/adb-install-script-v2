import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve('core'),
        '@source-engine': resolve('source-engine'),
        '@browser-engine': resolve('browser-engine'),
        '@download-engine': resolve('download-engine'),
        '@apk-engine': resolve('apk-engine'),
        '@adb-engine': resolve('adb-engine'),
        '@security-engine': resolve('security-engine'),
        '@adapter-monitor': resolve('adapter-monitor')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src')
      }
    },
    plugins: [react()],
    css: {
      postcss: resolve('postcss.config.js')
    }
  }
})
