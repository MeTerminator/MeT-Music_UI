import { test, expect } from "@playwright/test";

/**
 * 评论翻页回归:游标(last_seq_no)必须随页码前进,
 * 且第 2 页渲染的是第 2 页的数据(修复前游标错位一位,翻页后仍是第 1 页)。
 */
const makePage = (start: number) => ({
  code: 0,
  req: {
    data: {
      CommentList: {
        Comments: Array.from({ length: 25 }, (_, i) => ({
          SeqNo: `seq-${start + i}`,
          Nick: `用户${start + i}`,
          Content: `第 ${start + i} 条评论`,
          PubTime: 1700000000,
          PraiseNum: 0,
        })),
      },
    },
  },
});

test("评论翻页:游标随页码前进且内容更新", async ({ page }) => {
  const seqNoSeen: (string | null)[] = [];

  await page.route("**/api/web/extra/music/info**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "0039MnYb0qxYhV": {
          track_info: { id: 12345, title: "晴天", album: { title: "叶惠美" }, singer: [{ name: "周杰伦" }] },
        },
      }),
    }),
  );

  await page.route("**/api/web/extra/music/comments**", (route) => {
    const url = new URL(route.request().url());
    const seq = url.searchParams.get("last_seq_no");
    seqNoSeen.push(seq);
    const start = seq === "seq-24" ? 100 : 0;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(makePage(start)) });
  });

  await page.goto("/app/#/comments?id=0039MnYb0qxYhV");
  await expect(page.getByText("第 0 条评论")).toBeVisible();
  await expect(page.getByText("歌曲评论(第 1 页)")).toBeVisible();

  await page.getByRole("button", { name: "下一页" }).click();

  await expect(page.getByText("歌曲评论(第 2 页)")).toBeVisible();
  await expect(page.getByText("第 100 条评论")).toBeVisible();
  await expect(page.getByText("第 0 条评论")).toHaveCount(0);

  // 回上一页应回到第 1 页数据
  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page.getByText("歌曲评论(第 1 页)")).toBeVisible();
  await expect(page.getByText("第 0 条评论")).toBeVisible();

  console.log("last_seq_no 序列 =", JSON.stringify(seqNoSeen));
  expect(seqNoSeen[0]).toBeNull();
  expect(seqNoSeen[1]).toBe("seq-24");
});
