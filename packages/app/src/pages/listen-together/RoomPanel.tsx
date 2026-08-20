import RoomHeader from "./RoomHeader";
import RoomPlaylist from "./RoomPlaylist";
import SongPicker from "./SongPicker";
import RoomSidebar from "./RoomSidebar";

/** 已入房面板(对应旧页 .room-panel-container):页眉 + 左列表/点歌 + 右侧栏 */
const RoomPanel = () => (
  <div className="flex flex-col gap-5">
    <RoomHeader />
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <RoomPlaylist />
        <SongPicker />
      </div>
      <RoomSidebar />
    </div>
  </div>
);

export default RoomPanel;
