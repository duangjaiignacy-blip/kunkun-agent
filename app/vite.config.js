import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri 一期：clearScreen 关掉（别吃掉 Rust 报错），忽略 src-tauri 目录变更
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5180,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
