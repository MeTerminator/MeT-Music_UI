import { defineStore } from "pinia";
import useSiteStatusStore from "./siteStatus";
import useMusicDataStore from "./musicData";
import useSiteDataStore from "./siteData";

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

      // Save userInfo explicitly
      this.userInfo = {
        nickname: isAnonymousVal ? "Anonymous" : (nickname || "").trim() || "Anonymous",
        avatar: userAvatar || "/images/pic/avatar.jpg",
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
            payload.room.receivedAt = Date.now();
            this.roomState = payload.room;
            this.roomUuid = payload.room.uuid;
            statusStore.roomUuid = payload.room.uuid;
            this.syncPlayerState(payload.event);
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

        // Switch to the correct song if different
        if (localPlaySong?.id !== currentRoomSong.id) {
          musicStore.playSongData = currentRoomSong;
          await player.initPlayer(room.is_playing);
          const elapsed = room.is_playing ? (Date.now() - (room.receivedAt || Date.now())) / 1000 : 0;
          const targetSeek = room.seek_position + elapsed;
          player.setSeek(targetSeek, true);
        } else {
          // Play/Pause sync
          if (room.is_playing && !statusStore.playState) {
            player.fadePlayOrPause("play");
          } else if (!room.is_playing && statusStore.playState) {
            player.fadePlayOrPause("pause");
          }

          // Seek sync if out of alignment by > 1.5s or if explicit seek event
          const elapsed = room.is_playing ? (Date.now() - (room.receivedAt || Date.now())) / 1000 : 0;
          const targetSeek = room.seek_position + elapsed;
          const localSeek = player.getSeek();
          if (eventType === "seek" || Math.abs(localSeek - targetSeek) > 1.5) {
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
        musicStore.playSongData = currentRoomSong;
        
        await player.initPlayer(true);
        const elapsed = room.is_playing ? (Date.now() - (room.receivedAt || Date.now())) / 1000 : 0;
        const targetSeek = room.seek_position + elapsed;
        player.setSeek(targetSeek, true);
        if (room.is_playing) {
          player.fadePlayOrPause("play");
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
        ? "/images/pic/avatar.jpg" 
        : loggedInQQ 
          ? `https://q1.qlogo.cn/g?b=qq&nk=${loggedInQQ}&s=640`
          : siteDataStore.userData?.detail?.profile?.avatarUrl || "/images/pic/avatar.jpg";

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
    },
  },
});

export default useListenTogetherStore;
