import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig({
  server: { host: "127.0.0.1", port: 3000, strictPort: true },
  preview: { host: "127.0.0.1", port: 3000, strictPort: true },
  plugins: [
    vinext(),
    (await import("@cloudflare/vite-plugin")).cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: { main: "./worker/index.ts", compatibility_flags: ["nodejs_compat"] },
    }),
  ],
});
