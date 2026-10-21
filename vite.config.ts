import path from "path"
import { exec } from "node:child_process"
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import babel from '@rolldown/plugin-babel'
import { defineConfig, type Plugin } from 'vite'

function sketchCoreWasmWatcher(): Plugin {
  return {
    name: "sketch-core-wasm-watcher",
    configureServer(server) {
      const sketchCorePath = path.resolve(import.meta.dirname, "crates/sketch_core");
      server.watcher.add(path.resolve(sketchCorePath, "src"));
      server.watcher.add(path.resolve(sketchCorePath, "Cargo.toml"));

      let isRebuilding = false;
      let hasQueuedRebuild = false;

      const runWasmBuild = () => {
        if (isRebuilding) {
          hasQueuedRebuild = true;
          return;
        }
        isRebuilding = true;
        console.log("\n⚡ [sketch_core] Rust source modified, recompiling Wasm...");

        exec(
          "wasm-pack build --target web crates/sketch_core --out-dir ../../src/engine/wasm/pkg",
          { env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } },
          (err) => {
            isRebuilding = false;
            if (err) {
              console.error("❌ [sketch_core] Wasm build failed:", err.message);
            } else {
              console.log("✅ [sketch_core] Wasm compiled successfully. Reloading web canvas...");
              server.ws.send({ type: "full-reload" });
            }
            if (hasQueuedRebuild) {
              hasQueuedRebuild = false;
              runWasmBuild();
            }
          }
        );
      };

      server.watcher.on("change", (filePath) => {
        if (filePath.includes("crates/sketch_core")) {
          runWasmBuild();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    sketchCoreWasmWatcher(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    open: false,
  }
})
