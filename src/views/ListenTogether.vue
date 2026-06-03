<!-- 一起听歌 Listen Together View -->
<template>
  <div :class="['listen-together', themeType]">
    <n-h1 class="title">
      <n-text>一起听歌</n-text>
    </n-h1>
    
    <Transition name="fade" mode="out-in">
      <!-- 进房前的登录/配置面板 -->
      <div v-if="!isInRoom" class="setup-panel">
        <n-p class="subtitle-tip">与好友实时分享音乐，心动旋律，实时传递</n-p>

        <div class="set-type">
          <n-h3 prefix="bar"> 用户设置 </n-h3>

          <!-- 个人头像 -->
          <n-card class="set-item">
            <div class="name">
              个人头像
              <n-text class="tip">
                <template v-if="isAnonymous">匿名头像</template>
                <template v-else-if="loggedInQQ">QQ 头像</template>
                <template v-else-if="userLoginStatus">账户头像</template>
                <template v-else>默认头像</template>
              </n-text>
            </div>
            <n-avatar
              round
              :size="48"
              :src="userAvatar"
              :fallback-src="getAssetUrl('/images/pic/avatar.jpg')"
            />
          </n-card>

          <!-- 昵称 -->
          <n-card class="set-item">
            <div class="name">
              昵称
              <n-text class="tip">在房间中显示的昵称，匿名加入时该项被禁用</n-text>
            </div>
            <n-input
              v-model:value="nickname"
              type="text"
              placeholder="请输入昵称"
              class="set"
              :disabled="isAnonymous"
            />
          </n-card>

          <!-- 匿名加入 -->
          <n-card class="set-item">
            <div class="name">
              匿名加入
              <n-text class="tip">启用后将以“匿名”身份加入，隐藏您的昵称和头像</n-text>
            </div>
            <n-switch v-model:value="isAnonymous" :round="false" />
          </n-card>
        </div>

        <div class="set-type">
          <n-h3 prefix="bar"> 房间操作 </n-h3>

          <!-- 加入房间 -->
          <n-card class="set-item" :content-style="{ flexDirection: 'column', alignItems: 'flex-start' }">
            <div class="name">
              加入房间
              <n-text class="tip">请输入 6 位数字的房间号加入好友的房间</n-text>
            </div>
            <n-flex align="center" style="width: 100%; margin-top: 15px; gap: 12px;">
              <n-input
                v-model:value="joinCode"
                type="text"
                placeholder="请输入 6 位数房间号"
                maxlength="6"
                style="max-width: 250px;"
              >
                <template #prefix>
                  <n-icon><EnterOutline /></n-icon>
                </template>
              </n-input>
              <n-button
                type="primary"
                :loading="joining"
                :disabled="!joinCode || joinCode.length !== 6"
                @click="handleJoinRoom"
              >
                立即加入
              </n-button>
            </n-flex>
          </n-card>

          <!-- 创建房间 -->
          <n-card class="set-item">
            <div class="name">
              创建房间
              <n-text class="tip">创建一个新的房间，您将成为房主并可以添加共享播放歌曲</n-text>
            </div>
            <n-button
              type="primary"
              :loading="creating"
              @click="handleCreateRoom"
            >
              创建新房间
            </n-button>
          </n-card>
        </div>
      </div>

      <!-- 房间面板 -->
      <div v-else class="room-panel-container">
        <!-- 房间页眉 -->
        <n-card class="header-card">
          <n-flex justify="space-between" align="center" wrap="wrap" :size="[20, 15]">
            <!-- 左侧：房间标识与状态 -->
            <n-flex align="center" :size="15" wrap="wrap">
              <n-badge color="var(--main-color)" dot processing>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-tag
                      type="primary"
                      round
                      size="large"
                      style="cursor: pointer; font-weight: bold;"
                      @click="handleCopyCode"
                    >
                      房间号: {{ roomState.code }}
                      <template #icon>
                        <n-icon><CopyOutline /></n-icon>
                      </template>
                    </n-tag>
                  </template>
                  点击复制房间号
                </n-tooltip>
              </n-badge>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <n-tag
                    :bordered="false"
                    round
                    size="medium"
                    class="room-uuid-tag"
                    @click="handleCopyUuid"
                  >
                    ID: {{ roomState.uuid }}
                    <template #icon>
                      <n-icon><CopyOutline /></n-icon>
                    </template>
                  </n-tag>
                </template>
                点击复制房间 ID
              </n-tooltip>

              <n-tag :bordered="false" :type="remainingTime < 600 ? 'error' : 'warning'" round size="medium">
                <template #icon>
                  <n-icon><TimeOutline /></n-icon>
                </template>
                剩余: {{ formattedRemainingTime }}
              </n-tag>
            </n-flex>

            <!-- 右侧：控制与操作按钮 -->
            <n-flex align="center" :size="15" wrap="wrap">
              <!-- 自动续期 -->
              <n-flex align="center" :size="8" style="margin-right: 5px;">
                <n-text style="font-size: 13px; font-weight: 500;">自动续期</n-text>
                <n-switch v-model:value="autoRenew" size="small" />
              </n-flex>

              <!-- 各种按钮 -->
              <n-space class="action-space" :size="8" wrap>
                <n-button size="small" secondary round type="info" @click="ltStore.renewRoom">
                  <template #icon>
                    <n-icon><RefreshOutline /></n-icon>
                  </template>
                  手动续期
                </n-button>
                
                <n-button size="small" round type="primary" @click="ltStore.syncPlayback">
                  <template #icon>
                    <n-icon><PlayOutline /></n-icon>
                  </template>
                  立即同步播放
                </n-button>

                <n-button size="small" secondary round type="success" @click="openAirplay">
                  <template #icon>
                    <n-icon><PlayForwardOutline /></n-icon>
                  </template>
                  打开隔空播放
                </n-button>

                <n-button size="small" round type="error" @click="handleDeleteRoom">
                  <template #icon>
                    <n-icon><TrashOutline /></n-icon>
                  </template>
                  解散房间
                </n-button>

                <n-button size="small" secondary round @click="ltStore.leaveRoom">
                  <template #icon>
                    <n-icon><LogOutOutline /></n-icon>
                  </template>
                  退出
                </n-button>
              </n-space>
            </n-flex>
          </n-flex>
        </n-card>

        <div class="room-main-layout">
          <!-- 左侧：共享播放列表 -->
          <div class="playlist-panel">
            <n-card class="list-card" title="共享播放列表">
              <div class="playlist-tab">
                <div v-if="!roomState.playlist.length" class="empty-list">
                  <n-empty description="当前播放队列中没有歌曲。可在应用中右键歌曲 '添加到一起听歌'。" />
                </div>
                <div v-else class="playlist-scroller">
                  <n-scrollbar style="max-height: calc(100vh - 290px)" trigger="none">
                    <div
                      class="playlist-items-list"
                      @dragover.prevent
                      @dragenter.prevent
                    >
                      <div
                        v-for="(song, idx) in roomState.playlist"
                        :key="song.id + '-' + idx"
                        :class="[
                          'playlist-item',
                          { 'is-active': idx === roomState.current_song_index },
                          { 'is-dragging': idx === draggedItemIndex }
                        ]"
                        @dragover.prevent
                        @dragenter.prevent
                        @drop="handleDrop(idx, $event)"
                      >
                        <!-- 拖拽手柄 -->
                        <div
                          class="drag-handle"
                          draggable="true"
                          @dragstart="handleDragStart(idx, $event)"
                          @dragend="handleDragEnd($event)"
                        >
                          <n-icon><MenuOutline /></n-icon>
                        </div>
                        
                        <!-- 序号/播放状态 -->
                        <div class="item-index">
                          <span v-if="idx !== roomState.current_song_index">{{ idx + 1 }}</span>
                          <n-icon v-else color="var(--main-color)" class="pulse-icon">
                            <VolumeMediumOutline />
                          </n-icon>
                        </div>

                        <!-- 封面 -->
                        <n-avatar
                          size="small"
                          :src="song.cover || getAssetUrl('/images/pic/song.jpg')"
                          :fallback-src="getAssetUrl('/images/pic/song.jpg')"
                          style="margin-right: 10px"
                          draggable="false"
                        />

                        <!-- 详情 -->
                        <div class="item-meta">
                          <div class="item-name">{{ song.name }}</div>
                          <div class="item-artist-desc">
                            <n-text depth="3" class="item-artist">{{ formatArtist(song.artists) }}</n-text>
                            <n-badge type="info" size="small" class="added-badge">
                              {{ song.added_by || '系统' }}
                            </n-badge>
                          </div>
                        </div>

                        <!-- 操作 -->
                        <div class="item-actions">
                          <n-button quaternary circle size="small" type="primary" @click="handlePlayPlaylistItem(idx)">
                            <template #icon><n-icon><PlayOutline /></n-icon></template>
                          </n-button>
                          <n-button quaternary circle size="small" type="error" @click="ltStore.removeSong(idx)">
                            <template #icon><n-icon><TrashOutline /></n-icon></template>
                          </n-button>
                        </div>
                      </div>
                    </div>
                  </n-scrollbar>
                </div>
              </div>
            </n-card>
          </div>

          <!-- 右侧：成员列表与房间设置 -->
          <div class="sidebar-panel">
            <n-space vertical size="large">
              <!-- 房间播放设置 -->
              <div class="set-type" style="padding-top: 0; margin-bottom: 0;">
                <n-h3 prefix="bar">房间播放设置</n-h3>
                <n-card class="set-item">
                  <div class="name">
                    播放模式
                    <n-text class="tip">列表播放顺序</n-text>
                  </div>
                  <n-tabs
                    v-model:value="roomState.play_mode"
                    type="segment"
                    size="small"
                    @update:value="handleModeChange"
                    style="width: 160px"
                  >
                    <n-tab name="normal">顺序</n-tab>
                    <n-tab name="random">随机</n-tab>
                  </n-tabs>
                </n-card>

                <n-card class="set-item">
                  <div class="name">
                    播放后自动删除
                    <n-text class="tip">从队列播放后自动移出歌曲</n-text>
                  </div>
                  <n-switch
                    v-model:value="roomState.delete_after_played"
                    @update:value="handleSettingsChange"
                  />
                </n-card>

                <n-card class="set-item">
                  <div class="name">
                    循环播放列表
                    <n-text class="tip">播放完队列最后一首是否循环</n-text>
                  </div>
                  <n-switch
                    v-model:value="roomState.loop_playlist"
                    @update:value="handleSettingsChange"
                  />
                </n-card>
              </div>

              <!-- 房间控制抽屉 tabs -->
              <n-card class="tab-card">
                <n-tabs type="line" animated justify-content="space-evenly">
                  <!-- 成员列表 -->
                  <n-tab-pane name="members" tab="在线成员">
                    <div class="tab-content members-tab">
                      <n-scrollbar style="max-height: 250px" trigger="none">
                        <n-list hoverable clickable>
                          <n-list-item
                            v-for="member in roomState.members"
                            :key="member.userId"
                            class="member-list-item"
                          >
                            <template #prefix>
                              <n-avatar
                                round
                                size="medium"
                                :src="member.avatar || getAssetUrl('/images/pic/avatar.jpg')"
                                :fallback-src="getAssetUrl('/images/pic/avatar.jpg')"
                              />
                            </template>
                            <div class="member-nickname-container">
                              <span class="member-nickname-text" style="font-weight: bold;">{{ member.nickname }}</span>
                              <span class="member-qq-text">
                                <template v-if="member.is_anonymous">(匿名访问)</template>
                                <template v-else-if="member.qq">({{ member.qq }})</template>
                                <template v-else>(未绑定)</template>
                              </span>
                              <n-badge v-if="member.userId === ltStore.userId" type="success" size="small" class="self-badge">
                                我
                              </n-badge>
                            </div>
                          </n-list-item>
                        </n-list>
                      </n-scrollbar>
                    </div>
                  </n-tab-pane>

                  <!-- 房间动态 -->
                  <n-tab-pane name="logs" tab="房间动态">
                    <div class="tab-content logs-tab">
                      <n-scrollbar style="max-height: 250px" trigger="none" ref="logScrollbarRef">
                        <div class="log-list">
                          <div
                            v-for="(log, idx) in roomState.logs"
                            :key="idx"
                            class="log-item"
                          >
                            <span class="log-time">[{{ formatLogTime(log.timestamp) }}]</span>
                            <span class="log-user">{{ log.user }}</span>
                            <span class="log-action">{{ log.action }}</span>
                          </div>
                          <div v-if="!roomState.logs.length" class="empty-logs">
                            <n-text depth="3">暂无动态消息</n-text>
                          </div>
                        </div>
                      </n-scrollbar>
                    </div>
                  </n-tab-pane>
                </n-tabs>
              </n-card>
            </n-space>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { siteData, siteStatus, listenTogether, siteSettings } from "@/stores";
import { copyData, getAssetUrl } from "@/utils/helper";
import { Howler } from "howler";
import {
  MusicalNotesOutline,
  PersonOutline,
  EnterOutline,
  TimeOutline,
  PlayOutline,
  PlayBackOutline,
  PlayForwardOutline,
  SettingsOutline,
  TrashOutline,
  CopyOutline,
  MenuOutline,
  VolumeMediumOutline,
  RefreshOutline,
  LogOutOutline
} from "@vicons/ionicons5";

// Pinia stores
const dataStore = siteData();
const statusStore = siteStatus();
const ltStore = listenTogether();
const settingsStore = siteSettings();

// Destructure reactive store states
const { isInRoom, roomCode, roomUuid, roomState, remainingTime, autoRenew } = storeToRefs(ltStore);
const { userLoginStatus, userData } = storeToRefs(dataStore);
const { themeType } = storeToRefs(settingsStore);

// Logged-in user QQ ID
const loggedInQQ = computed(() => dataStore.userData?.userId || "");

// UI Configuration / Setup forms
const nickname = ref(localStorage.getItem("listen_together_nickname") || "");
const isAnonymous = ref(localStorage.getItem("listen_together_is_anonymous") === "true");
const joinCode = ref("");

const creating = ref(false);
const joining = ref(false);

// Logs scroll reference
const logScrollbarRef = ref(null);

// Drag and drop sorting state
const draggedItemIndex = ref(null);

// Computes current avatar based on setup fields
const userAvatar = computed(() => {
  if (isAnonymous.value) {
    return getAssetUrl("/images/pic/avatar.jpg");
  }
  if (loggedInQQ.value) {
    return `https://q1.qlogo.cn/g?b=qq&nk=${loggedInQQ.value}&s=640`;
  }
  if (userLoginStatus.value && userData.value?.detail?.profile?.avatarUrl) {
    return userData.value.detail.profile.avatarUrl;
  }
  return getAssetUrl("/images/pic/avatar.jpg");
});

// Auto-fill logged in user info if fields are empty
onMounted(() => {
  if (!nickname.value && userLoginStatus.value && userData.value?.detail?.profile?.nickname) {
    nickname.value = userData.value.detail.profile.nickname;
  }
  
  // Auto scroll logs when opening the page if inside a room
  if (isInRoom.value) {
    nextTick(() => {
      if (logScrollbarRef.value) {
        logScrollbarRef.value.scrollTo({ position: "bottom", silent: true });
      }
    });
  }
});

// Persist setup settings
watch([nickname, isAnonymous], () => {
  localStorage.setItem("listen_together_nickname", nickname.value);
  localStorage.setItem("listen_together_is_anonymous", isAnonymous.value ? "true" : "false");
});

// Formatters
const formattedRemainingTime = computed(() => {
  const m = Math.floor(remainingTime.value / 60);
  const s = remainingTime.value % 60;
  return `${m}分${s < 10 ? "0" + s : s}秒`;
});

const currentSongCover = computed(() => {
  const playlist = roomState.value.playlist;
  const idx = roomState.value.current_song_index;
  return playlist[idx] ? playlist[idx].cover : "";
});

const formatArtist = (artists) => {
  if (!artists) return "未知歌手";
  if (Array.isArray(artists)) {
    return artists.map((a) => a.name || a.title).join(" / ");
  }
  return artists.name || artists;
};

const formatLogTime = (ts) => {
  const date = new Date(ts);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  const s = date.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
};

// Auto scroll logs on state logs update
watch(
  () => roomState.value.logs.length,
  () => {
    nextTick(() => {
      if (logScrollbarRef.value) {
        logScrollbarRef.value.scrollTo({ position: "bottom", silent: true });
      }
    });
  }
);

// Setup Room Actions
const handleCreateRoom = async () => {
  if (!isAnonymous.value && !nickname.value.trim()) {
    window.$message.warning("请输入昵称");
    return;
  }

  // Unlock audio context on user interaction
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume().catch(err => console.error("Failed to resume audio context:", err));
  }

  try {
    creating.value = true;
    const response = await fetch("/api/room/create", { method: "POST" });
    const data = await response.json();
    if (data && data.code) {
      await ltStore.connectRoom(data.code, nickname.value, userAvatar.value, loggedInQQ.value, isAnonymous.value);
    } else {
      window.$message.error("创建房间失败，服务器未返回房间号");
    }
  } catch (err) {
    console.error("创建房间出错:", err);
    window.$message.error("创建房间出错");
  } finally {
    creating.value = false;
  }
};

const handleJoinRoom = async () => {
  if (!isAnonymous.value && !nickname.value.trim()) {
    window.$message.warning("请输入昵称");
    return;
  }
  if (!joinCode.value || joinCode.value.length !== 6) {
    window.$message.warning("请输入6位数房间号");
    return;
  }

  // Unlock audio context on user interaction
  if (Howler.ctx && Howler.ctx.state === "suspended") {
    Howler.ctx.resume().catch(err => console.error("Failed to resume audio context:", err));
  }

  try {
    joining.value = true;
    const response = await fetch(`/api/room/check?code=${joinCode.value}`);
    const data = await response.json();
    if (data && data.exists) {
      await ltStore.connectRoom(joinCode.value, nickname.value, userAvatar.value, loggedInQQ.value, isAnonymous.value);
    } else {
      window.$message.error("房间不存在或已过期");
    }
  } catch (err) {
    console.error("加入房间出错:", err);
    window.$message.error("加入房间出错");
  } finally {
    joining.value = false;
  }
};

// Room settings changes
const handleModeChange = (mode) => {
  ltStore.setPlayMode(mode);
};

const handleSettingsChange = () => {
  ltStore.updateSettings(roomState.value.delete_after_played, roomState.value.loop_playlist);
};

// Playlist Operations
const handlePlayPlaylistItem = (index) => {
  ltStore.playIndex(index);
};

// Drag and drop events for reordering playlist
const handleDragStart = (index, event) => {
  draggedItemIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", index.toString());
    
    // 用整行作为拖拽时显示的影子图像，提升拖拽手感并避免文本选择冲突
    const dragItem = event.currentTarget.closest(".playlist-item");
    if (dragItem) {
      event.dataTransfer.setDragImage(dragItem, 20, 20);
    }
  }
};

const handleDragEnd = (event) => {
  draggedItemIndex.value = null;
};

const handleDrop = (dropIndex, event) => {
  event.preventDefault();
  let startIndex = draggedItemIndex.value;
  if (startIndex === null && event.dataTransfer) {
    const data = event.dataTransfer.getData("text/plain");
    if (data !== "") {
      startIndex = parseInt(data, 10);
    }
  }
  if (startIndex === null || isNaN(startIndex) || startIndex === dropIndex) return;

  const playlistCopy = [...roomState.value.playlist];
  const draggedItem = playlistCopy.splice(startIndex, 1)[0];
  playlistCopy.splice(dropIndex, 0, draggedItem);

  ltStore.reorderPlaylist(playlistCopy);
  draggedItemIndex.value = null;
};

// Room management actions
const openAirplay = () => {
  const uuid = roomState.value.uuid;
  if (uuid) {
    window.open(`/player/?sid=${uuid}`, "_blank");
  }
};

const handleCopyUuid = () => {
  copyData(roomState.value.uuid, "房间 UUID 复制");
};

const handleCopyCode = () => {
  copyData(roomState.value.code, "房间号复制");
};

const handleDeleteRoom = () => {
  window.$dialog.warning({
    title: "解散房间",
    content: "确定解散当前房间吗？所有成员的连接都将被切断，此操作不可撤销！",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      ltStore.deleteRoom();
    },
  });
};
</script>

<style lang="scss" scoped>
.listen-together {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px;
  box-sizing: border-box;

  .title {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    height: 58px;
    margin: 20px 0;
    font-size: 36px;
    font-weight: bold;
  }

  .subtitle-tip {
    font-size: 14px;
    opacity: 0.65;
    margin-bottom: 24px;
  }

  .setup-panel {
    width: 100%;
  }

  .set-type {
    padding-top: 20px;
    margin-bottom: 20px;

    &:first-of-type {
      padding-top: 10px;
    }

    .set-item {
      width: 100%;
      border-radius: 8px;
      margin-bottom: 12px;

      &:last-child {
        margin-bottom: 0;
      }

      :deep(.n-card__content) {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      .name {
        font-size: 16px;
        display: flex;
        flex-direction: column;
        padding-right: 20px;

        .tip {
          font-size: 12px;
          opacity: 0.6;
          margin-top: 4px;
        }
      }

      .set {
        width: 200px;

        @media (max-width: 768px) {
          width: 140px;
          min-width: 140px;
        }
      }
    }
  }

  // Room Dashboard CSS
  .room-panel-container {
    width: 100%;
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    gap: 20px;

    .header-card {
      border-radius: 8px;
      :deep(.n-card__content) {
        padding: 12px 20px;
      }
    }

    .room-main-layout {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 20px;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }

      .list-card, .tab-card {
        border-radius: 8px;
        height: 100%;
        box-sizing: border-box;
      }

      // Playlist column CSS
      .playlist-panel {
        .list-card {
          padding: 10px 15px;
          
          :deep(.n-card-header) {
            padding: 15px 20px 10px 20px;
            font-weight: bold;
          }
        }

        .playlist-tab {
          padding: 10px;

          .empty-list {
            text-align: center;
            margin-top: 150px;
          }

          .playlist-scroller {
            .playlist-items-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }

            .playlist-item {
              display: flex;
              align-items: center;
              background: rgba(255, 255, 255, 0.02);
              border: 1px solid rgba(255, 255, 255, 0.03);
              border-radius: 8px;
              padding: 10px 14px;
              box-sizing: border-box;
              cursor: grab;
              transition: all 0.2s;
              user-select: none;
              -webkit-user-select: none;

              &.is-dragging {
                opacity: 0.4;
                border: 1px dashed var(--main-color);
              }

              &:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.08);

                .drag-handle {
                  opacity: 0.6;
                }

                .item-actions {
                  opacity: 1;
                }
              }

              &.is-active {
                background: var(--main-boxshadow-hover-color);
                border-color: var(--main-second-color);

                .item-name {
                  color: var(--main-color);
                  font-weight: bold;
                }
              }

              .drag-handle {
                margin-right: 10px;
                cursor: grab;
                opacity: 0.15;
                transition: opacity 0.2s;
                -webkit-user-drag: element !important;
                user-drag: element !important;

                * {
                  pointer-events: none;
                }
              }

              .item-index {
                min-width: 25px;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.3);
                font-weight: bold;

                .pulse-icon {
                  animation: pulse 1.5s infinite;
                }
              }

              .item-meta {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin-right: 15px;

                .item-name {
                  font-size: 14px;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                .item-artist-desc {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-top: 3px;

                  .item-artist {
                    font-size: 12px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 320px;
                  }

                  .added-badge {
                    transform: scale(0.85);
                    transform-origin: left center;
                  }
                }
              }

              .item-actions {
                display: flex;
                gap: 5px;
                opacity: 0;
                transition: opacity 0.2s;
              }
            }
          }
        }
      }

      // Sidebar column CSS (settings, members, logs)
      .sidebar-panel {
        .tab-card {
          padding: 5px;

          .tab-content {
            padding: 10px 0;
            min-height: 250px;
            box-sizing: border-box;
          }

          // Members tab styles
          .members-tab {
            .member-list-item {
              border-radius: 8px;
              margin-bottom: 5px;
              transition: all 0.2s;

              &:hover {
                background: rgba(255, 255, 255, 0.02) !important;
              }

              .member-nickname-container {
                display: flex;
                align-items: center;
                gap: 8px;

                .self-badge {
                  transform: scale(0.8);
                }
              }
            }
          }

          // Logs tab styles
          .logs-tab {
            .log-list {
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding-right: 5px;
            }

            .log-item {
              font-size: 12px;
              line-height: 1.6;
              padding: 6px 12px;
              border-radius: 8px;
              background: rgba(255, 255, 255, 0.015);
              border: 1px solid rgba(255, 255, 255, 0.02);

              .log-time {
                color: rgba(255, 255, 255, 0.5);
                margin-right: 8px;
              }

              .log-user {
                color: var(--main-color);
                font-weight: 500;
                margin-right: 6px;
              }

              .log-action {
                color: rgba(255, 255, 255, 0.75);
              }
            }

            .empty-logs {
              text-align: center;
              margin-top: 80px;
            }
          }
        }
      }
    }

    .room-uuid-tag {
      cursor: pointer;
      font-weight: 500;
    }

    .member-qq-text {
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
      font-weight: normal;
      margin-left: 6px;
    }
  }

  // Light Mode Style Overrides (must be at .listen-together level since .light is on the root)
  &.light {
    :deep(.playlist-item) {
      background: rgba(0, 0, 0, 0.015) !important;
      border: 1px solid rgba(0, 0, 0, 0.02) !important;

      &:hover {
        background: rgba(0, 0, 0, 0.03) !important;
        border-color: rgba(0, 0, 0, 0.05) !important;
      }

      &.is-active {
        background: var(--main-boxshadow-hover-color) !important;
        border-color: var(--main-second-color) !important;
      }

      .item-index {
        color: rgba(0, 0, 0, 0.35) !important;
      }
    }

    :deep(.log-item) {
      background: rgba(0, 0, 0, 0.015) !important;
      border: 1px solid rgba(0, 0, 0, 0.02) !important;
    }
    :deep(.log-item .log-time) {
      color: rgba(0, 0, 0, 0.6) !important;
    }
    :deep(.log-item .log-user) {
      color: var(--main-color) !important;
    }
    :deep(.log-item .log-action) {
      color: rgba(0, 0, 0, 0.85) !important;
    }
    :deep(.member-qq-text) {
      color: rgba(0, 0, 0, 0.4) !important;
    }
    :deep(.item-index) {
      color: rgba(0, 0, 0, 0.35) !important;
    }
    :deep(.empty-logs .n-text) {
      color: rgba(0, 0, 0, 0.45) !important;
    }
  }

  // Mobile Portrait Adaptations
  @media (max-width: 700px) {
    padding: 15px !important;

    .title {
      font-size: 26px !important;
      height: auto !important;
      margin: 10px 0 !important;
    }

    .room-panel-container {
      gap: 15px !important;

      .header-card :deep(.n-card__content) {
        padding: 12px 15px !important;
      }

      .room-uuid-tag {
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .action-space {
      width: 100% !important;
      :deep(> div) {
        flex: 1 1 calc(50% - 8px) !important;
        .n-button {
          width: 100% !important;
          justify-content: center !important;
        }
      }
    }

    .playlist-item {
      padding: 8px 10px !important;
      .item-meta {
        margin-right: 5px !important;
        .item-artist {
          max-width: 140px !important;
        }
      }
      .drag-handle {
        margin-right: 6px !important;
      }
    }
  }

  @media (max-width: 500px) {
    .setup-panel .set-item :deep(.n-card__content) {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 12px !important;
    }
    .setup-panel .set-item .set {
      width: 100% !important;
      max-width: 100% !important;
    }
  }
}

// Fade transition animation
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

// Pulse animation for playing icon
@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.7;
  }
}
</style>
