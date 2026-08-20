import StatePage from "./StatePage";

/** 500(对照旧 State/500.vue:「服务器错误 / 服务器寄了，等会再试吧」,重新载入) */
const ServerError = () => (
  <StatePage
    code="500"
    title="服务器错误"
    description="服务器寄了，等会再试吧"
    actionLabel="重新载入"
    onAction={() => window.location.reload()}
  />
);

export default ServerError;
