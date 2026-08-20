import { useListenTogetherStore } from "@/stores/listenTogether";
import SetupPanel from "./listen-together/SetupPanel";
import RoomPanel from "./listen-together/RoomPanel";

/**
 * 一起听歌页面(对应旧 src/views/ListenTogether.vue)。
 * UI 只读 useListenTogetherStore 并调用其 actions;WS 协议与播放器联动均在状态层。
 * 与旧页一致:页面刷新后不自动重连(store 不持久化)。
 */
const ListenTogether = () => {
  const isInRoom = useListenTogetherStore((s) => s.isInRoom);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-8 max-md:px-4">
      <h1 className="mb-4 text-3xl font-bold text-[var(--met-fg)]">一起听歌</h1>
      {isInRoom ? <RoomPanel /> : <SetupPanel />}
    </div>
  );
};

export default ListenTogether;
