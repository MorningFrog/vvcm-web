import { defineConfig, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const vvcmWasmPrefix = '\0vvcm-wasm-bindgen:'

function vvcmWasmBindgenCompat(): Plugin {
  return {
    name: 'vvcm-wasm-bindgen-compat',
    enforce: 'pre',
    async resolveId(source, importer) {
      const normalizedImporter = importer ? normalizePath(importer) : ''
      const isVvcmWasm =
        source.endsWith('vvcm_rs_bg.wasm') &&
        normalizedImporter.includes('/@morningfrog/vvcm-rs/pkg/vvcm_rs.js')

      if (!isVvcmWasm) {
        return null
      }

      const resolved = await this.resolve(source, importer, { skipSelf: true })
      return resolved ? `${vvcmWasmPrefix}${normalizePath(resolved.id)}` : null
    },
    load(id) {
      if (!id.startsWith(vvcmWasmPrefix)) {
        return null
      }

      const wasmPath = id.slice(vvcmWasmPrefix.length)
      const bgPath = wasmPath.replace(/_bg\.wasm$/, '_bg.js')
      const wasmModule = new WebAssembly.Module(readFileSync(wasmPath))
      const exportBindings = WebAssembly.Module.exports(wasmModule)
        .map(
          ({ name }) =>
            `const ${name} = instance.exports[${JSON.stringify(name)}];\nexport { ${name} };`,
        )
        .join('\n')

      return `
import wasmUrl from ${JSON.stringify(`${wasmPath}?url`)};
import * as imports from ${JSON.stringify(bgPath)};

const response = await fetch(wasmUrl);
const bytes = await response.arrayBuffer();
const { instance } = await WebAssembly.instantiate(bytes, { "./vvcm_rs_bg.js": imports });

${exportBindings}
`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vvcmWasmBindgenCompat(), react()],
  optimizeDeps: {
    exclude: ['@morningfrog/vvcm-rs'],
  },
})
