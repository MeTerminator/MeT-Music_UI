import { defineStore } from "pinia";
import useSiteStatusStore from "./siteStatus";
import useMusicDataStore from "./musicData";
import useSiteDataStore from "./siteData";
import { getAssetUrl } from "@/utils/helper";

export const useListenTogetherStore = defineStore("listenTogether", {
  state: () => {
    return {
      isInRoom: false,
      roomCode: "",
      roomUuid: "",
      roomState: {
        code: "",
        uuid: "",
        playlist: [],
        members: [],
        current_song_index: -1,
        is_playing: false,
        seek_position: 0,
        play_mode: "normal",
        delete_after_played: false,
        loop_playlist: false,
        expires_at: Date.now() + 3600000,
        logs: [],
      },
      ws: null,
      heartbeatTimer: null,
      countdownTimer: null,
      remainingTime: 3600,
      autoRenew: true,
      renewCooldown: false,
      userId: "", // Session ID
      lastSeekSentTime: 0, // Throttle seek sends to at most 1s once
      userInfo: null,
      serverTimeOffset: 0, // offset = server_time - local_time
      syncTimeTimer: null, // Timer for system time sync
      playbackSyncTimer: null, // Timer for 1s playback drift sync
      _expectingFirstState: false, // Flag to trigger syncPlayback on first room_state after joining
    };
  },
  actions: {
    // Connect to room WebSocket
    async connectRoom(code, nickname, userAvatar, qq, isAnonymousVal) {
      if (this.ws) {
        this.handleLocalExit();
      }

      const statusStore = useSiteStatusStore();
      
      // Get stable userId session
      const { getSessionId } = await import("@/utils/helper");
      this.userId = getSessionId();

      this.roomCode = code;
      this._expectingFirstState = true; // Mark that the next room_state is the first after joining

      // Save userInfo explicitly
      this.userInfo = {
        nickname: isAnonymousVal ? "Anonymous" : (nickname || "").trim() || "Anonymous",
        avatar: userAvatar || getAssetUrl("/images/pic/avatar.jpg"),
        qq: isAnonymousVal ? "" : String(qq || ""),
        is_anonymous: !!isAnonymousVal,
      };
      
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${window.location.host}/api/room/ws/${code}`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[Listen Together Store] Connected to room WS:", code);
        
        // Prepare join message payload
        const joinPayload = {
          action: "join",
          userId: this.userId,
          user: this.userInfo,
        };
        this.ws.send(JSON.stringify(joinPayload));

        // Update siteStatus stores
        statusStore.showPlayBar = true;
        statusStore.isInRoom = true;
        statusStore.roomCode = code;
        this.isInRoom = true;

        // Start heartbeat & countdown timers
        this.startTimers();
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "room_state") {
            const isFirstState = this._expectingFirstState;
            this._expectingFirstState = false;
            payload.room.receivedAt = Date.now();
            payload.room.serverTime = payload.server_time || (Date.now() + this.serverTimeOffset);
            this.roomState = payload.room;
            this.roomUuid = payload.room.uuid;
            statusStore.roomUuid = payload.room.uuid;
            if (isFirstState) {
              // Short delay to allow the player to be ready before syncing
              setTimeout(() => this.syncPlayback(), 300);
            } else {
              this.syncPlayerState(payload.event);
            }
          } else if (payload.type === "error") {
            if (typeof $message !== "undefined") $message.error(payload.message);
          }
        } catch (e) {
          console.error("解析WS消息失败:", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[Listen Together Store] WS Closed:", event);
        this.handleLocalExit();
        if (event.code === 4004) {
          if (typeof $message !== "undefined") $message.warning("房间已过期或被关闭");
        } else if (event.reason) {
          if (typeof $message !== "undefined") $message.info(event.reason);
        }
      };

      this.ws.onerror = (err) => {
        console.error("[Listen Together Store] WS Error:", err);
        if (typeof $message !== "undefined") $message.error("连接网络发生错误");
      };
    },

    // Sync Howler audio playback with room state
    async syncPlayerState(eventType) {
      const room = this.roomState;
      const musicStore = useMusicDataStore();
      const statusStore = useSiteStatusStore();
      const player = await import("@/utils/Player");

      // Update shared playlist and indices
      musicStore.playList = room.playlist;
      statusStore.playIndex = room.current_song_index;

      const currentRoomSong = room.playlist[room.current_song_index];
      if (currentRoomSong) {
        const localPlaySong = musicStore.getPlaySongData;

        // Switch to the correct song if different or if player is not initialized
        if (localPlaySong?.id !== currentRoomSong.id || !window.$player) {
          musicStore.playSongData = currentRoomSong;
          await player.initPlayer(room.is_playing);
        } else {
          // Play/Pause sync
          if (room.is_playing && !statusStore.playState) {
            player.fadePlayOrPause("play");
          } else if (!room.is_playing && statusStore.playState) {
            player.fadePlayOrPause("pause");
          }

          // Seek sync if out of alignment by configured threshold or if explicit seek event
          const now = Date.now();
          const serverNow = now + this.serverTimeOffset;
          const serverTimeGen = room.serverTime || serverNow;
          const elapsed = room.is_playing ? (serverNow - serverTimeGen) / 1000 : 0;
          const targetSeek = room.seek_position + elapsed;
          const localSeek = player.getSeek();

          const settingsStore = (await import("@/stores")).siteSettings();
          const threshold = settingsStore.listenTogetherSyncThreshold ?? 300;
          const thresholdSec = threshold / 1000;

          if (eventType === "seek" || Math.abs(localSeek - targetSeek) > thresholdSec) {
            player.setSeek(targetSeek, true);
          }
        }
      } else {
        // No song playing in room playlist
        if (statusStore.playState || window.$player) {
          player.soundStop();
          statusStore.playState = false;
          statusStore.playTimeData = {
            currentTime: 0,
            duration: 0,
            bar: 0,
            played: "00:00",
            durationTime: "00:00",
          };
        }
      }
    },

    // WS send actions
    sendPlayOrPause() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const action = this.roomState.is_playing ? "pause" : "play";
      this.ws.send(
        JSON.stringify({
          action,
          userId: this.userId,
          user: this.getCurrentUserPayload(),
        })
      );
    },

    sendChangeIndex(type) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const action = type === "next" ? "next" : "prev";
      this.ws.send(
        JSON.stringify({
          action,
          userId: this.userId,
          user: this.getCurrentUserPayload(),
        })
      );
    },

    sendSeek(seek) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "seek",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { currentTime: seek },
        })
      );
    },

    sendNext() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "next",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
        })
      );
    },

    async addSong(song) {
      if (!this.isInRoom) {
        if (typeof $message !== "undefined") $message.warning("当前未加入一起听歌房间");
        return;
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      
      let formattedSong = song;
      // If it doesn't have coverSize or artists, it is a raw song object and needs formatting
      if (!song.coverSize || !song.artists) {
        try {
          const mod = await import("@/utils/formatData");
          const formattedArray = mod.default(song, "song");
          if (formattedArray && formattedArray.length > 0) {
            formattedSong = formattedArray[0];
          }
        } catch (e) {
          console.error("格式化歌曲数据失败:", e);
        }
      }

      this.ws.send(
        JSON.stringify({
          action: "playlist_add",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { song: formattedSong },
        })
      );
      if (typeof $message !== "undefined") {
        $message.success(`已成功添加歌曲到队列: ${formattedSong.name}`);
      }
    },

    removeSong(index) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "playlist_remove",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { index },
        })
      );
    },

    reorderPlaylist(newPlaylist) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "playlist_reorder",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { playlist: newPlaylist },
        })
      );
    },

    setPlayMode(mode) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "set_play_mode",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { play_mode: mode },
        })
      );
    },

    updateSettings(deleteAfterPlayed, loopPlaylist) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "update_settings",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: {
            settings: {
              delete_after_played: deleteAfterPlayed,
              loop_playlist: loopPlaylist,
            },
          },
        })
      );
    },

    playIndex(index) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "play_index",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
          data: { index },
        })
      );
    },

    async syncPlayback() {
      const room = this.roomState;
      const musicStore = useMusicDataStore();
      const statusStore = useSiteStatusStore();
      const player = await import("@/utils/Player");

      const currentRoomSong = room.playlist[room.current_song_index];
      if (currentRoomSong) {
        musicStore.playList = room.playlist;
        statusStore.playIndex = room.current_song_index;
        
        const localPlaySong = musicStore.getPlaySongData;
        // If already the same song and player is active, just force sync state and seek
        if (localPlaySong?.id === currentRoomSong.id && window.$player) {
          if (room.is_playing && !statusStore.playState) {
            player.fadePlayOrPause("play");
          } else if (!room.is_playing && statusStore.playState) {
            player.fadePlayOrPause("pause");
          }
          const now = Date.now();
          const serverNow = now + this.serverTimeOffset;
          const serverTimeGen = room.serverTime || serverNow;
          const elapsed = room.is_playing ? (serverNow - serverTimeGen) / 1000 : 0;
          const targetSeek = (room.seek_position || 0) + elapsed;
          player.setSeek(targetSeek, true);
        } else {
          musicStore.playSongData = currentRoomSong;
          await player.initPlayer(true);
        }
      } else {
        if (typeof $message !== "undefined") $message.warning("共享播放列表为空，无可同步的歌曲");
      }
    },

    // HTTP Room Expiry Renewal
    async renewRoom() {
      if (this.renewCooldown) return;
      try {
        this.renewCooldown = true;
        setTimeout(() => {
          this.renewCooldown = false;
        }, 10000);

        const response = await fetch("/api/room/renew", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: this.roomCode }),
        });
        const data = await response.json();
        if (data && data.status === "ok") {
          this.roomState.expires_at = data.expires_at;
          if (typeof $message !== "undefined") $message.success("房间已成功续期 1 小时");
        } else {
          if (typeof $message !== "undefined") $message.error(data.detail || "续期失败");
        }
      } catch (err) {
        console.error("续期出错:", err);
      }
    },

    // Room Host Deletion
    deleteRoom() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(
        JSON.stringify({
          action: "delete_room",
          userId: this.userId,
          user: this.getCurrentUserPayload(),
        })
      );
    },

    // Leave the Room explicitly
    leaveRoom() {
      if (this.ws) {
        this.ws.close(1000, "User left the room");
      }
      this.handleLocalExit();
    },

    // Sync local client system time with server system time (every 10s)
    async syncSystemTime() {
      try {
        const t0 = Date.now();
        const response = await fetch("/api/room/time");
        if (!response.ok) throw new Error("Fetch server time failed");
        const data = await response.json();
        const t1 = Date.now();
        const serverTime = data.server_time;
        // SNTP: offset = serverTime - (t0 + t1) / 2
        this.serverTimeOffset = serverTime - (t0 + t1) / 2;
        console.log(`[Listen Together] Time synced. RTT: ${t1 - t0}ms, Offset: ${this.serverTimeOffset.toFixed(1)}ms`);
      } catch (err) {
        console.error("[Listen Together] Failed to sync server time:", err);
      }
    },

    // Every 1s playback check
    async checkAndSyncPlayback() {
      if (!this.isInRoom || !this.roomState || !this.roomState.is_playing) return;
      
      const player = await import("@/utils/Player");
      if (!window.$player) return;

      const musicStore = useMusicDataStore();
      const currentRoomSong = this.roomState.playlist[this.roomState.current_song_index];
      if (!currentRoomSong) return;

      const localPlaySong = musicStore.getPlaySongData;
      if (localPlaySong?.id !== currentRoomSong.id) return;

      const now = Date.now();
      const serverNow = now + this.serverTimeOffset;
      const serverTimeGen = this.roomState.serverTime || serverNow;
      const elapsed = (serverNow - serverTimeGen) / 1000;
      const targetSeek = this.roomState.seek_position + elapsed;

      const localSeek = player.getSeek();
      const diffMs = Math.abs(localSeek - targetSeek) * 1000;

      const settingsStore = (await import("@/stores")).siteSettings();
      const threshold = settingsStore.listenTogetherSyncThreshold ?? 300;

      if (diffMs > threshold) {
        console.log(`[Listen Together] Playback drift: ${diffMs.toFixed(1)}ms > threshold: ${threshold}ms. Adjusting local seek from ${localSeek.toFixed(3)}s to target ${targetSeek.toFixed(3)}s.`);
        player.setSeek(targetSeek, true);
      }
    },

    // Handle state cleaning
    async handleLocalExit() {
      const statusStore = useSiteStatusStore();
      const player = await import("@/utils/Player");

      this.isInRoom = false;
      this.roomCode = "";
      this.roomUuid = "";
      
      statusStore.isInRoom = false;
      statusStore.roomCode = "";
      statusStore.roomUuid = "";
      statusStore.showPlayBar = true;

      player.soundStop();

      if (this.ws) {
        try {
          this.ws.close();
        } catch (_) {}
        this.ws = null;
      }

      this.stopTimers();
    },

    // User payload generator
    getCurrentUserPayload() {
      if (this.userInfo && this.userInfo.nickname) {
        return this.userInfo;
      }
      const siteDataStore = useSiteDataStore();
      const isAnonymousVal = localStorage.getItem("listen_together_is_anonymous") === "true";
      const nickname = localStorage.getItem("listen_together_nickname") || "Anonymous";
      
      const loggedInQQ = siteDataStore.userData?.userId || "";
      const avatarUrl = isAnonymousVal 
        ? getAssetUrl("/images/pic/avatar.jpg") 
        : loggedInQQ 
          ? `https://q1.qlogo.cn/g?b=qq&nk=${loggedInQQ}&s=640`
          : siteDataStore.userData?.detail?.profile?.avatarUrl || getAssetUrl("/images/pic/avatar.jpg");

      return {
        nickname: isAnonymousVal ? "Anonymous" : nickname.trim() || "Anonymous",
        avatar: avatarUrl,
        qq: isAnonymousVal ? "" : String(loggedInQQ),
        is_anonymous: isAnonymousVal,
      };
    },

    // Start background heartbeat and countdown timers
    startTimers() {
      this.stopTimers();

      // Sync system time immediately, then every 10 seconds
      this.syncSystemTime();
      this.syncTimeTimer = setInterval(() => {
        this.syncSystemTime();
      }, 10000);

      // Check and sync playback drift every 1 second
      this.playbackSyncTimer = setInterval(() => {
        this.checkAndSyncPlayback();
      }, 1000);

      this.countdownTimer = setInterval(() => {
        const now = Date.now();
        const expiresAt = this.roomState.expires_at || (now + 3600000);
        const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
        this.remainingTime = diff;

        if (diff === 0) {
          if (typeof $message !== "undefined") $message.error("房间到期，连接已断开");
          this.handleLocalExit();
        }

        // Auto-renew if time remaining is less than 30 minutes
        if (this.autoRenew && diff > 0 && diff <= 1800) {
          if (!this.renewCooldown) {
            this.renewRoom();
          }
        }
      }, 1000);

      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "ping", userId: this.userId }));
        }
      }, 30000);
    },

    stopTimers() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      if (this.syncTimeTimer) {
        clearInterval(this.syncTimeTimer);
        this.syncTimeTimer = null;
      }
      if (this.playbackSyncTimer) {
        clearInterval(this.playbackSyncTimer);
        this.playbackSyncTimer = null;
      }
    },
  },
});

export default useListenTogetherStore;
