/** 与 favicon / PWA 共用品牌图标,随明暗主题切换黑白。 */
export const Logo = ({ size = 24 }: { size?: number }) => (
  <img
    src={`${import.meta.env.BASE_URL}images/icons/favicon.svg`}
    width={size}
    height={size}
    alt=""
    aria-hidden
    className="met-logo shrink-0"
  />
);
