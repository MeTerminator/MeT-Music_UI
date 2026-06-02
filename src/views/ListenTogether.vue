<!-- 一起听歌 Listen Together View -->
<template>
  <div class="listen-together-container">
    <Transition name="fade" mode="out-in">
      <!-- 进房前的登录/配置面板 -->
      <div v-if="!isInRoom" class="setup-panel-container">
        <n-card class="setup-card" :bordered="false">
          <div class="setup-header">
            <n-icon size="48" class="music-icon">
              <MusicalNotesOutline />
            </n-icon>
            <h2 class="title">一起听歌</h2>
            <p class="subtitle">与好友实时分享音乐，心动旋律，实时传递</p>
          </div>

          <!-- 用户设置项 -->
          <div class="setup-form">
            <div class="avatar-preview-section">
              <n-avatar
                round
                :size="80"
                :src="userAvatar"
                fallback-src="/images/pic/avatar.jpg"
                class="avatar-glow"
              />
              <div class="avatar-source-tip">
                <n-text depth="3" v-if="isAnonymous">匿名头像</n-text>
                <n-text depth="3" v-else-if="loggedInQQ">QQ 头像</n-text>
                <n-text depth="3" v-else-if="userLoginStatus">账户头像</n-text>
                <n-text depth="3" v-else>默认头像</n-text>
              </div>
            </div>

            <n-space vertical size="large">
              <n-input
                v-model:value="nickname"
                type="text"
                placeholder="请输入昵称"
                round
                size="large"
                :disabled="isAnonymous"
              >
                <template #prefix>
                  <n-icon><PersonOutline /></n-icon>
                </template>
              </n-input>

              <n-flex justify="space-between" align="center" class="anonymous-flex">
                <n-text>匿名加入</n-text>
                <n-switch v-model:value="isAnonymous" />
              </n-flex>

              <n-divider />

              <!-- 房间操作项 -->
              <div class="room-action-section">
                <n-tabs type="segment" animated>
                  <!-- 加入房间 -->
                  <n-tab-pane name="join" tab="加入房间">
                    <n-space vertical size="large" style="margin-top: 15px">
                      <n-input
                        v-model:value="joinCode"
                        type="text"
                        placeholder="请输入 6 位数房间号"
                        round
                        size="large"
                        maxlength="6"
                        class="code-input"
                      >
                        <template #prefix>
                          <n-icon><EnterOutline /></n-icon>
                        </template>
                      </n-input>
                      <n-button
                        type="primary"
                        round
                        block
                        size="large"
                        :loading="joining"
                        :disabled="!joinCode || joinCode.length !== 6"
                        @click="handleJoinRoom"
                      >
                        立即加入
                      </n-button>
                    </n-space>
                  </n-tab-pane>

                  <!-- 创建房间 -->
                  <n-tab-pane name="create" tab="创建新房间">
                    <div style="margin-top: 15px">
                      <p class="create-tip">创建一个听歌房间，您将成为房主并能邀请好友共同听歌。</p>
                      <n-button
                        type="primary"
                        round
                        block
                        size="large"
                        :loading="creating"
                        @click="handleCreateRoom"
                      >
                        创建房间
                      </n-button>
                    </div>
                  </n-tab-pane>
                </n-tabs>
              </div>
            </n-space>
          </div>
        </n-card>
      </div>

      <!-- 房间面板 -->
      <div v-else class="room-panel-container">
        <!-- 房间页眉 -->
        <div class="room-header-section">
          <div class="room-identity">
            <n-badge color="#18a058" dot processing>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <div class="room-code-tag clickable-code" @click="handleCopyCode">
                    房间号: {{ roomState.code }}
                    <n-icon class="copy-icon-inline"><CopyOutline /></n-icon>
                  </div>
                </template>
                点击复制房间号
              </n-tooltip>
            </n-badge>
            <n-text depth="3" class="room-uuid" @click="handleCopyUuid">
              ID: {{ roomState.uuid }}
              <n-icon class="copy-icon"><CopyOutline /></n-icon>
            </n-text>
          </div>

          <!-- 房间时间与续期 -->
          <div class="room-expiry-controls">
            <n-text class="expiry-time" :type="remainingTime < 600 ? 'error' : 'default'">
              <n-icon><TimeOutline /></n-icon>
              剩余: {{ formattedRemainingTime }}
            </n-text>
            <n-button size="small" secondary round type="info" @click="ltStore.renewRoom">
              手动续期
            </n-button>
            <n-flex align="center" size="small">
              <n-text depth="3">自动续期</n-text>
              <n-switch v-model:value="autoRenew" size="small" />
            </n-flex>
            <n-button size="small" round type="primary" @click="ltStore.syncPlayback">
              立即同步播放
            </n-button>
            <n-button size="small" secondary round type="success" @click="openAirplay">
              打开隔空播放
            </n-button>
            <n-button size="small" round type="error" @click="handleDeleteRoom">
              解散房间
            </n-button>
            <n-button size="small" secondary round @click="ltStore.leaveRoom">
              退出
            </n-button>
          </div>
        </div>

        <div class="room-main-layout">
          <!-- 左侧：共享播放列表 -->
          <div class="playlist-panel">
            <n-card class="glass-card list-card" title="共享播放列表" :bordered="false">
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
                          <n-icon v-else color="#18a058" class="pulse-icon">
                            <VolumeMediumOutline />
                          </n-icon>
                        </div>

                        <!-- 封面 -->
                        <n-avatar
                          size="small"
                          :src="song.cover || '/images/pic/song.jpg'"
                          fallback-src="/images/pic/song.jpg"
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
              <!-- 房间设置 -->
              <n-card class="glass-card settings-card" title="房间播放设置" :bordered="false">
                <n-space vertical size="medium">
                  <n-flex justify="space-between" align="center">
                    <n-text depth="2">播放模式</n-text>
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
                  </n-flex>

                  <n-flex justify="space-between" align="center">
                    <n-text depth="2">播放后自动删除</n-text>
                    <n-switch
                      v-model:value="roomState.delete_after_played"
                      @update:value="handleSettingsChange"
                    />
                  </n-flex>

                  <n-flex justify="space-between" align="center">
                    <n-text depth="2">循环播放列表</n-text>
                    <n-switch
                      v-model:value="roomState.loop_playlist"
                      @update:value="handleSettingsChange"
                    />
                  </n-flex>
                </n-space>
              </n-card>

              <!-- 房间控制抽屉 tabs -->
              <n-card class="glass-card tab-card" :bordered="false">
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
                                :src="member.avatar || '/images/pic/avatar.jpg'"
                                fallback-src="/images/pic/avatar.jpg"
                              />
                            </template>
                            <div class="member-nickname-container">
                              <span class="member-nickname-text" style="font-weight: bold;">{{ member.nickname }}</span>
                              <span class="member-qq-text" style="color: rgba(255, 255, 255, 0.4); font-size: 13px; font-weight: normal; margin-left: 6px;">
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
import { siteData, siteStatus, listenTogether } from "@/stores";
import { copyData } from "@/utils/helper";
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
  VolumeMediumOutline
} from "@vicons/ionicons5";

// Pinia stores
const dataStore = siteData();
const statusStore = siteStatus();
const ltStore = listenTogether();

// Destructure reactive store states
const { isInRoom, roomCode, roomUuid, roomState, remainingTime, autoRenew } = storeToRefs(ltStore);
const { userLoginStatus, userData } = storeToRefs(dataStore);

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
    return "/images/pic/avatar.jpg";
  }
  if (loggedInQQ.value) {
    return `https://q1.qlogo.cn/g?b=qq&nk=${loggedInQQ.value}&s=640`;
  }
  if (userLoginStatus.value && userData.value?.detail?.profile?.avatarUrl) {
    return userData.value.detail.profile.avatarUrl;
  }
  return "/images/pic/avatar.jpg";
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
.listen-together-container {
  position: relative;
  min-height: calc(100vh - 60px);
  padding: 30px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;

  // Setup / Entry Panel CSS
  .setup-panel-container {
    width: 100%;
    max-width: 500px;
    z-index: 1;

    .setup-card {
      background: rgba(25, 25, 25, 0.65);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      padding: 10px;

      .setup-header {
        text-align: center;
        margin-bottom: 25px;

        .music-icon {
          color: var(--n-primary-color);
          margin-bottom: 10px;
          filter: drop-shadow(0 0 10px rgba(24, 160, 88, 0.4));
        }

        .title {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 1px;
          margin: 10px 0 5px 0;
          background: linear-gradient(135deg, #ffffff 0%, #a5a5a5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .subtitle {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.5);
        }
      }

      .setup-form {
        .avatar-preview-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 25px;

          .avatar-glow {
            border: 3px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 0 25px rgba(24, 160, 88, 0.35);
            transition: all 0.3s ease;

            &:hover {
              transform: scale(1.05);
              box-shadow: 0 0 35px rgba(24, 160, 88, 0.65);
            }
          }

          .avatar-source-tip {
            margin-top: 8px;
            font-size: 11px;
          }
        }

        .anonymous-flex {
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .create-tip {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        .code-input {
          :deep(input) {
            text-align: center;
            font-size: 18px;
            letter-spacing: 4px;
            font-weight: bold;
          }
        }
      }
    }
  }

  // Room Dashboard CSS
  .room-panel-container {
    width: 100%;
    max-width: 1150px;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 20px;

    .room-header-section {
      background: rgba(25, 25, 25, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 15px 25px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);

      .room-identity {
        display: flex;
        align-items: center;
        gap: 15px;

        .room-code-tag {
          background: rgba(24, 160, 88, 0.15);
          color: #18a058;
          border: 1px solid rgba(24, 160, 88, 0.3);
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 0.5px;
          display: inline-flex;
          align-items: center;
          gap: 6px;

          &.clickable-code {
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              background: rgba(24, 160, 88, 0.25);
              border-color: rgba(24, 160, 88, 0.5);
            }
          }

          .copy-icon-inline {
            font-size: 14px;
            opacity: 0.8;
          }
        }

        .room-uuid {
          font-size: 12px;
          background: rgba(255, 255, 255, 0.04);
          padding: 6px 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(255, 255, 255, 0.04);

          &:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .copy-icon {
            font-size: 14px;
          }
        }
      }

      .room-expiry-controls {
        display: flex;
        align-items: center;
        gap: 15px;
        flex-wrap: wrap;

        .expiry-time {
          font-weight: bold;
          font-size: 13px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
      }
    }

    .room-main-layout {
      display: grid;
      grid-template-columns: 1fr 380px;
      gap: 20px;

      @media (max-width: 900px) {
        grid-template-columns: 1fr;
      }

      .glass-card {
        background: rgba(20, 20, 20, 0.55);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4);
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
              border-radius: 12px;
              padding: 10px 14px;
              box-sizing: border-box;
              cursor: grab;
              transition: all 0.2s;
              user-select: none;
              -webkit-user-select: none;

              &.is-dragging {
                opacity: 0.4;
                border: 1px dashed var(--n-primary-color);
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
                background: rgba(24, 160, 88, 0.08);
                border-color: rgba(24, 160, 88, 0.25);

                .item-name {
                  color: var(--n-primary-color);
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
        .settings-card {
          padding: 10px 15px;
          :deep(.n-card-header) {
            padding: 15px 20px 10px 20px;
          }
        }

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
              border-radius: 10px;
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
                color: rgba(255, 255, 255, 0.35);
                margin-right: 8px;
              }

              .log-user {
                color: var(--n-primary-color);
                font-weight: 500;
                margin-right: 6px;
              }

              .log-action {
                color: rgba(255, 255, 255, 0.7);
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
