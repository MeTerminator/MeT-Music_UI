import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedListenTogether } from "./seed";

/**
 * 一起听歌双实例冒烟(A2):建房 → 加入 → 成员同步 → 退出 → 解散。
 *
 * 依赖生产 room API(dev proxy /api → music.met6.top:444,含 WS),
 * CI 默认跳过,设 E2E_NETWORK=1 显式启用。
 */
test.skip(!process.env.E2E_NETWORK, "依赖生产房间后端,设 E2E_NETWORK=1 启用");

/** 打开一起听页面并填好昵称(种子已关闭匿名,昵称输入框可用) */
const openSetupPanel = async (page: Page, nickname: string): Promise<void> => {
  await seedListenTogether(page);
  await page.goto("/app/#/listen-together");
  const nicknameInput = page.locator('input[placeholder="请输入昵称"]');
  await expect(nicknameInput).toBeEnabled();
  await nicknameInput.fill(nickname);
};

/** 入房态锚点:RoomHeader 的房间号复制按钮(文案「房间号: 123456」) */
const roomCodeButton = (page: Page) => page.locator('button[title="点击复制房间号"]');

/** 侧栏成员标签页按钮(文案「在线成员 (N)」),用于断言成员数 */
const memberTab = (page: Page, count: number) =>
  page.getByRole("button", { name: new RegExp(`在线成员 \\(${count}\\)`) });

test("双实例:创建/加入房间与成员同步", async ({ browser }) => {
  let contextA: BrowserContext | undefined;
  let contextB: BrowserContext | undefined;

  try {
    // ---- A:创建房间 ----
    contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await openSetupPanel(pageA, "测试昵称A");
    await pageA.getByRole("button", { name: "创建新房间" }).click();

    // 入房态(HTTP 建房 + WS join 往返,宽容等待)
    await expect(roomCodeButton(pageA)).toBeVisible({ timeout: 20_000 });

    // 从复制区文本读 6 位房间码(WS 往返后才会填充,expect.poll 宽容等待)
    let roomCode = "";
    await expect
      .poll(
        async () => {
          const text = (await roomCodeButton(pageA).textContent()) ?? "";
          roomCode = /(\d{6})/.exec(text)?.[1] ?? "";
          return roomCode;
        },
        { timeout: 20_000 },
      )
      .toMatch(/^\d{6}$/);

    // ---- B:新 context 加入 ----
    contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await openSetupPanel(pageB, "测试昵称B");
    await pageB.locator('input[placeholder="请输入 6 位数房间号"]').fill(roomCode);
    await pageB.getByRole("button", { name: "立即加入" }).click();
    await expect(roomCodeButton(pageB)).toBeVisible({ timeout: 20_000 });

    // ---- 双方成员列表均显示 2 人 ----
    await expect(memberTab(pageA, 2)).toBeVisible({ timeout: 20_000 });
    await expect(memberTab(pageB, 2)).toBeVisible({ timeout: 20_000 });

    // ---- A 退出:A 回到未入房态,B 收到成员变化(1 人) ----
    await pageA.getByRole("button", { name: "退出", exact: true }).click();
    await expect(pageA.getByRole("button", { name: "创建新房间" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(memberTab(pageB, 1)).toBeVisible({ timeout: 20_000 });

    // ---- 清理:B 解散房间(二次确认),服务端关闭连接后 B 回到未入房态 ----
    await pageB.getByRole("button", { name: "解散房间" }).click();
    await pageB.getByRole("button", { name: "确定" }).click();
    await expect(pageB.getByRole("button", { name: "创建新房间" })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await contextA?.close();
    await contextB?.close();
  }
});
