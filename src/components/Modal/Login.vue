<!-- 弹窗 - 登录 -->
<template>
  <n-modal
    v-model:show="loginModalShow"
    :auto-focus="false"
    :mask-closable="false"
    :bordered="false"
    :close-on-esc="false"
    :closable="false"
    style="width: 400px"
    preset="card"
    transform-origin="center"
  >
    <div class="login-content">
      <div class="title">
        <img class="logo" src="/images/icons/favicon.png?asset" alt="logo" />
      </div>
      <!-- 登录方式 -->
      <n-tabs class="login-tabs" default-value="login" type="segment" animated>
        <n-tab-pane name="login-qq" tab="QQ号登录">
          <loginQQ @setLoginData="setLoginData" />
        </n-tab-pane>
      </n-tabs>
      <!-- 关闭登录弹窗 -->
      <n-button
        :focusable="false"
        class="close"
        strong
        secondary
        round
        @click="(loginModalShow = false), toLogout(false)"
      >
        <template #icon>
          <n-icon :depth="2">
            <SvgIcon icon="window-close" />
          </n-icon>
        </template>
      </n-button>
    </div>
  </n-modal>
</template>

<script setup>
import { siteData } from "@/stores";
import { toLogout, isLogin } from "@/utils/auth";

const data = siteData();

// 登录数据
const loginModalShow = ref(false);

// 开启登录弹窗
const openLoginModal = () => {
  if (isLogin()) {
    $dialog.warning({
      title: "退出登录",
      content: "确认退出当前用户登录？",
      positiveText: "登出",
      negativeText: "取消",
      onPositiveClick: () => {
        toLogout();
      },
    });
  } else {
    loginModalShow.value = true;
  }
};

// 储存登录信息
const setLoginData = async (qq) => {
  console.log(qq);
  // 设置用户 QQ 号
  data.setUserId(qq);
  // 关闭登录弹窗
  loginModalShow.value = false;
  // 获取用户信息
  await data.setUserProfile();
  // 更改状态
  data.userLoginStatus = true;
  $message.success("登录成功");

};


// 检查登录状态
const checkLoginStatus = async () => {
  try {
    // 获取用户信息
    await data.setUserProfile();
  } catch (error) {
    console.error("检查登录状态失败：", error);
  }
};


defineExpose({
  openLoginModal,
});

onBeforeMount(() => {
  checkLoginStatus();
  // 挂载方法
  window.$changeLogin = openLoginModal;
});
</script>

<style lang="scss">
.login-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  .title {
    width: 60px;
    height: 60px;
    margin: 20px 0 30px 0;
    .logo {
      width: 100%;
      height: 100%;
    }
  }
  .close {
    position: absolute;
    bottom: -58px;
    background-color: var(--n-color-modal);
    &:hover {
      background-color: var(--n-color-embedded);
    }
    &:active {
      background-color: var(--n-color-embedded);
    }
  }
}
</style>
