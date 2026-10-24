import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact'
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [])],
    define: { __EDITION__: JSON.stringify(artifact ? 'artifact' : 'web') },
    build: { outDir: artifact ? 'dist-artifact' : 'dist', emptyOutDir: true },
    test: { environment: 'node', include: ['tests/**/*.test.js'] },
  }
})
