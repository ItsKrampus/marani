import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  // Visible (non-dot) build dir so macOS file pickers can see it when loading unpacked.
  outDir: 'output',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Marani — Safe Solana Wallet',
    description:
      "The Solana wallet that won't let you lose money. Blocks sends of tokens the destination exchange doesn't support and offers a one-tap rescue swap.",
    version: '0.1.0',
    permissions: ['storage'],
    host_permissions: [
      'https://solana.leorpc.com/*',
      'https://solana-rpc.publicnode.com/*',
      'https://api.mainnet-beta.solana.com/*',
      'https://*.helius-rpc.com/*',
      'https://lite-api.jup.ag/*',
      'https://api.jup.ag/*',
      'https://coins.llama.fi/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
