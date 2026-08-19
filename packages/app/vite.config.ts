import { resolve } from "node:path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import { VitePWA } from "vite-plugin-pwa";

// 与旧 Vue 应用部署参数保持一致:base=/app/、dev 代理 /api、端口 3000
export default defineConfig({
  base: "/app/",

  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },

  plugins: [
    react(),
    // React Compiler(plugin-react v6 经 rolldown babel preset 接入)
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    wasm(),
    // PWA 配置(manifest 与旧应用一致)
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /(.*?)\.(woff2|woff|ttf)/,
            handler: "CacheFirst",
            options: { cacheName: "file-cache" },
          },
          {
            urlPattern: /(.*?)\.(webp|png|jpe?g|svg|gif|bmp|psd|tiff|tga|eps)/,
            handler: "CacheFirst",
            options: { cacheName: "image-cache" },
          },
        ],
      },
      manifest: {
        name: "MeT-Music",
        short_name: "MeT-Music",
        description: "MeT-Music",
        display: "standalone",
        start_url: "/app/#/history",
        theme_color: "#fff",
        background_color: "#efefef",
        icons: [
          { src: "/app/images/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
          { src: "/app/images/icons/favicon-96x96.png", sizes: "96x96", type: "image/png" },
          { src: "/app/images/icons/favicon-256x256.png", sizes: "256x256", type: "image/png" },
          { src: "/app/images/icons/favicon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],

  server: {
    port: Number(process.env.VITE_DEV_PORT) || 3000,
    host: true,
    proxy: {
      "/api": {
        target: "https://music.met6.top:444/api",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },

  build: {
    target: "esnext",
  },
});
