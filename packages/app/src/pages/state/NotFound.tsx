import StatePage from "./StatePage";

/** 404(对照旧 State/404.vue:「页面不存在 / 怎么跑到这来了？」,返回上一级) */
const NotFound = () => (
  <StatePage
    code="404"
    title="页面不存在"
    description="怎么跑到这来了？"
    actionLabel="返回上一级"
    onAction={() => window.history.back()}
  />
);

export default NotFound;
