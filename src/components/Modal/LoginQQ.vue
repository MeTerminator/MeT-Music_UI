<!-- 登录 - 手机号 -->
<template>
  <div class="login-phone">
    <n-form
      ref="qqFormRef"
      :model="qqFormData"
      :rules="qqFormRules"
      :show-label="false"
      class="phone-form"
    >
      <n-form-item path="phone">
        <n-input v-model:value="qqFormData.qq" placeholder="QQ号">
          <template #prefix>
            <n-icon>
              <SvgIcon icon="phone" />
            </n-icon>
          </template>
        </n-input>
      </n-form-item>
      <n-form-item>
        <n-button style="width: 100%" type="primary" @click="qqLogin"> 登录 </n-button>
      </n-form-item>
    </n-form>
  </div>
</template>

<script setup>

import { formRules } from "@/utils/formRules";

const { numberRule } = formRules();

const emit = defineEmits(["setLoginData"]);

// QQ号数据
const qqFormRef = ref(null);
const qqFormData = ref({
  qq: null,
});
const qqFormRules = {
  qq: numberRule,
};


// QQ号登录
const qqLogin = (e) => {
  e.preventDefault();
  qqFormRef.value?.validate(async (errors) => {
    const qq = qqFormData._value.qq;
    const numericQQ = parseInt(qq);
    if ((!errors) && (!isNaN(numericQQ) && typeof numericQQ === 'number')) {
      
      emit("setLoginData", qq);
    } else {
      $message.error("请检查你的输入");
    }
  });
};
</script>

<style lang="scss" scoped>
.login-phone {
  .phone-form {
    margin-top: 20px;
  }
}
</style>
