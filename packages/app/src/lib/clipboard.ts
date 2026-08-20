import { toast } from "sonner";

/**
 * 复制文本到剪贴板并 toast 提示(收敛自 PlayerBar / SongList / Setting /
 * listen-together 的重复实现):navigator.clipboard 优先,旧浏览器
 * execCommand 兜底,成功/失败均给出提示。
 */
export const copyText = async (
  text: string,
  successMsg = "复制成功",
): Promise<void> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    toast.success(successMsg);
  } catch (error) {
    console.error("复制出错：", error);
    toast.error("复制失败,请手动复制");
  }
};
