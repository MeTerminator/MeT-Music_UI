import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import { VitePWA } from "vite-plugin-pwa";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import viteCompression from "vite-plugin-compression";
import wasm from "vite-plugin-wasm";

export default defineConfig(({ mode }) => {
  // 读取环境变量
  const getEnv = (name) => {
    return loadEnv(mode, process.cwd())[name];
  };

  return {
    base: "/app/",

    resolve: {
      extensions: [".js", ".vue", ".json"],
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },

    plugins: [
      vue(),
      AutoImport({
        imports: [
          "vue",
          {
            "naive-ui": ["useDialog", "useMessage", "useNotification", "useLoadingBar"],
          },
        ],
      }),
      Components({
        resolvers: [NaiveUiResolver()],
      }),
      // viteCompression 启用 gzip/brotli 压缩
      viteCompression(),
      wasm(),
      // PWA 配置
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
              options: {
                cacheName: "file-cache",
              },
            },
            {
              urlPattern: /(.*?)\.(webp|png|jpe?g|svg|gif|bmp|psd|tiff|tga|eps)/,
              handler: "CacheFirst",
              options: {
                cacheName: "image-cache",
              },
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
            {
              src: "/app/images/icons/favicon-32x32.png",
              sizes: "32x32",
              type: "image/png",
            },
            {
              src: "/app/images/icons/favicon-96x96.png",
              sizes: "96x96",
              type: "image/png",
            },
            {
              src: "/app/images/icons/favicon-256x256.png",
              sizes: "256x256",
              type: "image/png",
            },
            {
              src: "/app/images/icons/favicon-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],

    server: {
      port: getEnv("VITE_DEV_PORT") || 3000,
      host: true,
      // 代理配置
      proxy: {
        "/api": {
          target: `https://music.met6.top:444/api`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },

    build: {
      target: "esnext",
      minify: "terser",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
        },
      },
      terserOptions: {
        compress: {
          pure_funcs: ["console.log"],
        },
      },
      sourcemap: false,
    },
  };
});
