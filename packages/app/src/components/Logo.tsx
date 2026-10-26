/** 与 favicon / PWA 共用品牌图标,固定使用品牌色 #000000。 */
export const Logo = ({ size = 24 }: { size?: number }) => (
  <img
    src={`${import.meta.env.BASE_URL}images/icons/favicon.svg`}
    width={size}
    height={size}
    alt=""
    aria-hidden
    className="shrink-0"
  />
);
