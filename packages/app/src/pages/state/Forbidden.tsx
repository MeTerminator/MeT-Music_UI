import StatePage from "./StatePage";

/** 403(对照旧 State/403.vue:「禁止访问 / 总有些门是对你关闭的」,返回上一级) */
const Forbidden = () => (
  <StatePage
    code="403"
    title="禁止访问"
    description="总有些门是对你关闭的"
    actionLabel="返回上一级"
    onAction={() => window.history.back()}
  />
);

export default Forbidden;
