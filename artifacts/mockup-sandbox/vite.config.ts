import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuração corrigida para usar o plugin nativo do React e passar direto pelo build
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
