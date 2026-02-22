<!-- 主导航栏 -->
<template>
  <nav :class="{ 'main-nav': true, 'no-sider': !showSider }">
    <div class="left">
      <div :class="['logo', asideMenuCollapsed ? 'collapsed' : null]" @click="router.push('/history')">
        <!-- <n-avatar class="logo-img" src="/images/icons/favicon.png?asset" /> -->
        <n-icon class="logo-img" size="30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 24 24"
          >
            <path 
              d="M12,2 C12.54792,2 13.0856,2.0440704 13.6096096,2.12886272 L14,2.20004 L14,8.53513 C13.4117,8.19479 12.7286,8 12,8 C9.79086,8 8,9.79086 8,12 C8,14.2091 9.79086,16 12,16 C14.1421576,16 15.8910766,14.3159949 15.9951046,12.199637 L16,12 L16,2.83209 C19.5318,4.3752 22,7.89936 22,12 C22,17.5228 17.5228,22 12,22 C6.47715,22 2,17.5228 2,12 C2,6.47715 6.47715,2 12,2 Z M12,10 C13.1046,10 14,10.8954 14,12 C14,13.1046 13.1046,14 12,14 C10.8954,14 10,13.1046 10,12 C10,10.8954 10.8954,10 12,10 Z"
              :fill="themeAutoCover ? 'var(--main-color)' : '#20b170'"
            />
          </svg>
        </n-icon>
        <Transition name="fade" mode="out-in">
          <n-text v-if="!asideMenuCollapsed && showSider" class="site-name">
            {{ siteName }}
          </n-text>
        </Transition>
      </div>
      <n-flex :class="['navigation', { hidden: searchInputFocus }]" :size="6">
        <n-button :focusable="false" class="nav-icon" quaternary @click="router.go(-1)">
          <template #icon>
            <n-icon>
              <SvgIcon icon="chevron-left" />
            </n-icon>
          </template>
        </n-button>
        <n-button :focusable="false" class="nav-icon" quaternary @click="router.go(1)">
          <template #icon>
            <n-icon>
              <SvgIcon icon="chevron-right" />
            </n-icon>
          </template>
        </n-button>
      </n-flex>
      <!-- 搜索框 -->
      <SearchInp />
    </div>
    <div class="right">
      <!-- 全局菜单 -->
      <n-dropdown
        :show="mainMenuShow"
        :show-arrow="true"
        :options="mainMenuOptions"
        placement="bottom-end"
        @clickoutside="mainMenuShow = false"
      >
        <n-button
          :style="{ pointerEvents: mainMenuShow ? 'none' : 'auto' }"
          :class="['main-menu', { show: !showSider }]"
          secondary
          strong
          round
          @click="mainMenuShow = !mainMenuShow"
        >
          <template #icon>
            <n-icon>
              <SvgIcon icon="menu" />
            </n-icon>
          </template>
        </n-button>
      </n-dropdown>
      <!-- 用户信息 -->
      <userData />
    </div>
  </nav>
</template>

<script setup>
import { NScrollbar } from "naive-ui";
import { storeToRefs } from "pinia";
import { siteStatus, siteSettings } from "@/stores";
import { useRouter } from "vue-router";
import Menu from "@/components/Global/Menu";

const router = useRouter();
const status = siteStatus();
const settings = siteSettings();
const { asideMenuCollapsed, searchInputFocus } = storeToRefs(status);
const { showSider, themeAutoCover } = storeToRefs(settings);

// 站点信息
const siteName = "MeT-Music";

// 主菜单渲染
const mainMenuShow = ref(false);
const mainMenuOptions = computed(() => [
  {
    key: "menu",
    type: "render",
    props: {
      onClick: () => (mainMenuShow.value = false),
    },
    render: () => {
      return h(NScrollbar, { style: { maxHeight: "calc(100vh - 200px)", minWidth: "280px" } }, () =>
        h(Menu),
      );
    },
  },
]);
</script>

<style lang="scss" scoped>
.main-nav {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  .left,
  .right {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  .logo {
    width: 224px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    padding-left: 6px;
    box-sizing: border-box;
    transition:
      width 0.3s,
      padding-left 0.3s;
    -webkit-app-region: no-drag;
    cursor: pointer;
    .logo-img {
      width: 30px;
      height: 30px;
      min-width: 30px;
      background-color: transparent;
      transition: transform 0.3s;
      &:hover {
        transform: scale(1.15);
      }
      &:active {
        transform: scale(1);
      }
    }
    .site-name {
      margin-left: 12px;
      font-size: 20px;
      font-weight: bold;
    }
    &.collapsed {
      width: 48px;
      padding-left: 0;
    }
  }
  .navigation {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    height: 34px;
    width: 86px;
    min-width: 86px;
    transition:
      width 0.3s,
      min-width 0.3s,
      opacity 0.3s;
    overflow: hidden;
    -webkit-app-region: no-drag;
    .nav-icon {
      border-radius: 8px;
      padding: 0 8px;
      .n-icon {
        font-size: 24px;
      }
    }
    @media (max-width: 700px) {
      &.hidden {
        opacity: 0;
        width: 0px;
        min-width: 0px;
      }
    }
  }
  .github {
    margin-left: 12px;
    -webkit-app-region: no-drag;
  }
  .main-menu {
    -webkit-app-region: no-drag;
    margin-right: 12px;
    display: none;
    &.show {
      display: flex;
    }
    @media (max-width: 900px) {
      display: flex;
    }
  }

  &.no-sider {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 10vw;
    @media (max-width: 1200px) {
      padding: 0 5vw;
    }
    .logo {
      width: auto;
      padding-left: 0;
      margin-right: 12px;
    }
  }
  @media (max-width: 900px) {
    .left {
      .logo {
        width: auto;
        padding-left: 0;
        margin-right: 12px;
        .site-name {
          display: none;
        }
      }
    }
  }
  @media (max-width: 700px) {
    .left {
      width: 100%;
    }
    .github {
      display: none;
    }
  }
}
</style>
