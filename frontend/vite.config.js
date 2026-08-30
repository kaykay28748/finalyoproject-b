import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()], 
  
  server: {
    host: '0.0.0.0',  
    port: 5173,
    watch: {
      // Playwright writes these directories during E2E; watching+locking them
      // crashed the Vite dev server (EBUSY). Ignore them.
      ignored: ['**/playwright-report/**', '**/test-results/**', '**/tmp-*.png'],
    },
    proxy: {
      '/api/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nominatim/, ''),
      },
    },
  },
  
  build: {
    // Disable minification for now to avoid the production-only module initialization bug
    // seen in the deployed bundle. The app remains fully functional and this is safer
    // than shipping a minified chunk that can fail during module evaluation.
    minify: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/leaflet')) {
            return 'leaflet';
          }
          if (id.includes('node_modules/react-leaflet')) {
            return 'leaflet';
          }
          if (id.includes('node_modules/react')) {
            return 'vendor';
          }

        }
      }
    },
    // Keep identifiers readable to avoid the minifier-generated initialization ordering issue
    minifyIdentifiers: false,
    // Ensure sourcemaps for debugging (optional)
    sourcemap: false
  },
  
  // Optimize deps to pre-bundle and avoid circular issues
  optimizeDeps: {
    include: [
      'react', 
  'react-dom', 
  'react-router-dom',
      'leaflet', 
      'react-leaflet'
    ],
    exclude: []
  }
})