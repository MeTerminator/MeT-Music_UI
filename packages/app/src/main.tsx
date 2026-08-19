import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { initHostGlobals } from "./host";
import { setupPlayer } from "./player/setup";
import { router } from "./router";
import "./styles.css";

// 宿主契约全局与播放引擎装配(必须先于任何 UI 交互)
initHostGlobals();
setupPlayer();

// dev 调试出口
if (import.meta.env.DEV) {
  void Promise.all([import("./stores/music"), import("./stores/status")]).then(
    ([music, status]) => {
      (window as unknown as Record<string, unknown>).__debugStores = {
        music: music.useMusicStore,
        status: status.useStatusStore,
      };
    },
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="top-center" richColors />
    </QueryClientProvider>
  </StrictMode>,
);
