<!-- 主菜单 -->
<template>
  <n-menu ref="mainMenuRef" v-model:value="menuActiveKey" :class="['main-menu', { cover: siderShowCover }]"
    :root-indent="showSider ? 36 : 26" :indent="0" :collapsed="asideMenuCollapsed.value"
    :defaultExpandedKeys="['user-playlists', 'favorite-playlists']" :collapsed-width="64" :collapsed-icon-size="22"
    :options="menuOptions" @contextmenu.stop @update:value="checkMenuItem" />
  <!-- 右键菜单 -->
  <CoverDropdown ref="coverDropdownRef" />
</template>

<script setup>
import { storeToRefs } from "pinia";
import { siteStatus, siteData, siteSettings } from "@/stores";
import { NIcon, NText, NAvatar } from "naive-ui";
import { useRouter, RouterLink } from "vue-router";
import { isLogin } from "@/utils/auth";
import SvgIcon from "@/components/Global/SvgIcon";
import { getAssetUrl } from "@/utils/helper";

const router = useRouter();
const data = siteData();
const status = siteStatus();
const settings = siteSettings();
const { siderShowCover } = storeToRefs(settings);
const { asideMenuCollapsed, showSider } = storeToRefs(status);
const { userLikeData, userLoginStatus } = storeToRefs(data);

// 子组件
const coverDropdownRef = ref(null);

// 图标渲染
const renderIcon = (icon, size) => {
  return () => h(NIcon, { size }, { default: () => h(SvgIcon, { icon }, null) });
};

// 创建的歌单
const userPlaylists = ref({
  label: () =>
    h("div", { class: "user-list" }, [
      h("span", { class: "name" }, ["创建的歌单"])
    ]),
  key: "user-playlists",
  children: [],
});

// 收藏的歌单
const favoritePlaylists = ref({
  label: () => h("div", { class: "user-list" }, [h("span", { class: "name" }, ["收藏的歌单"])]),
  key: "favorite-playlists",
  children: [],
});

// 菜单数据
const mainMenuRef = ref(null);
const menuActiveKey = ref(router.currentRoute.value.name ?? "home");
const menuOptions = computed(() => [
  {
    type: "group",
    label: "我的音乐",
    key: "user",
    children: [],
    show: !asideMenuCollapsed.value,
  },
  {
    label: () =>
      h(
        RouterLink,
        {
          to: {
            path: "/like-songs",
          },
          class: "user-playlist",
        },
        () => [
          h(
            "div",
            {
              style: {
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              },
            },
            [
              h("span", null, ["喜欢的音乐"]),
            ],
          ),
        ],
      ),
    key: "like-songs",
    icon: renderIcon("favorite-rounded"),
  },
  {
    label: () =>
      h(
        RouterLink,
        {
          to: {
            name: "history",
          },
        },
        () => ["最近播放"],
      ),
    key: "history",
    icon: renderIcon("history"),
  },
  {
    key: "divider-2",
    type: "divider",
  },
  { ...userPlaylists.value, show: !asideMenuCollapsed.value },
]);

// 更改用户的歌单
const changeUserPlaylists = (data) => {
  // 未登录
  if (!isLogin() || !data?.length) {
    userPlaylists.value.children = [];
    favoritePlaylists.value.children = [];
    return false;
  }
  // 创建的歌单
  const userPlaylistsData = data;
  // 更改数据
  userPlaylists.value.children = userPlaylistsData.slice(1).map((v) => {
    return {
      label: () =>
        siderShowCover.value
          ? h(
            "div",
            {
              class: "user-pl-cover",
              onclick: () => {
                router.push({
                  path: "/playlist",
                  query: {
                    id: v.id,
                  },
                });
              },
            },
            [
              h(NAvatar, { src: v.coverImgUrl, fallbackSrc: getAssetUrl("/images/pic/album.jpg?assest") }),
              h(NText, null, () => [v.name]),
            ],
          )
          : h(
            RouterLink,
            {
              to: {
                path: "/playlist",
                query: {
                  id: v.id,
                },
              },
              class: "user-playlist",
            },
            () => [h(NText, null, () => [v.name])],
          ),
      key: v.id,
      icon: siderShowCover.value ? null : renderIcon("queue-music-rounded"),
    };
  });
};

// 选中菜单项
const checkMenuItem = async (key) => {
  // 例外路由
  const otherRouter = ["search", "videos-player", "playlist", "like-songs"];
  // 特殊处理
  if (!key) {
    menuActiveKey.value = "home";
  } else if (otherRouter.includes(key)) {
    // 选中正确的歌单
    const choosePlaylist = () => {
      const id = Number(router.currentRoute.value.query.id || 0);
      const matchingPlaylist = userLikeData.value.playlists.find((playlist) => playlist.id === id);
      menuActiveKey.value = matchingPlaylist ? id : "discover";
    };
    switch (key) {
      case "videos-player": {
        menuActiveKey.value = "videos";
        break;
      }
      case "playlist": {
        choosePlaylist();
        break;
      }
      case "like-songs": {
        menuActiveKey.value = "like-songs";
        break;
      }
      default: {
        menuActiveKey.value = "discover";
        break;
      }
    }
  } else {
    menuActiveKey.value = key;
  }
  mainMenuRef.value?.showOption(key);
};


// 监听路由路径变化
watch(
  () => router.currentRoute.value,
  (val) => {
    // 取出路由父项
    const routerFather = val.matched[0]?.name ?? val?.name;
    // 高亮路由项
    checkMenuItem(routerFather);
  },
);

// 监听用户歌单变化
watch(
  [() => userLikeData.value.playlists, () => userLoginStatus.value, () => siderShowCover.value],
  () => changeUserPlaylists(userLikeData.value.playlists),
);

onMounted(() => {
  changeUserPlaylists(userLikeData.value.playlists);
});
</script>

<style lang="scss" scoped>
.main-menu {
  padding-bottom: 14px;

  :deep(.n-menu-item) {
    .n-menu-item-content {
      &.n-menu-item-content--selected {
        &::before {
          border-left: 4px solid var(--n-item-text-color-active);
        }
      }

      .n-text {
        display: inline-block;
        text-overflow: ellipsis;
        overflow: hidden;
      }

      // 普通歌单
      .user-playlist {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      // 带封面歌单
      .user-pl-cover {
        display: flex;
        flex-direction: row;
        align-items: center;

        .n-avatar {
          border-radius: 8px;
          width: 34px;
          height: 34px;
          min-width: 34px;
          margin-right: 12px;
        }
      }
    }
  }

  // 折叠菜单
  :deep(.n-submenu) {
    .n-menu-item-content {
      &:hover {
        .n-base-icon {
          color: var(--n-group-text-color);
        }
      }

      .n-base-icon {
        color: var(--n-group-text-color);
        font-size: 0.93em;
      }

      .user-list {
        color: var(--n-group-text-color);
        font-size: 0.93em;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding-right: 20px;

        .add {
          height: 20px;
          width: 34px;

          .n-icon {
            font-size: 12px;
          }
        }
      }
    }
  }

  &.cover {
    :deep(.n-submenu-children) {
      --n-item-height: 50px;
    }
  }
}
</style>

<!-- 特殊样式 -->
<style lang="scss">
.heart-rate-btn {
  &:hover {
    background-color: var(--main-second-color) !important;
    color: var(--main-color) !important;
  }

  &.collapsed {
    margin-left: 12px;
    background-color: #efefef40;
    color: #efefef;

    &:hover {
      background-color: #efefef60 !important;
      color: #efefef !important;
    }
  }
}
</style>
