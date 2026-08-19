import brandMark from "../assets/favicon.svg";

export default function BrandLogo({ className = "", size = 24, alt = "CopTrax logo" }) {
  const dimension = typeof size === "number" ? `${size}px` : size;

  return (
    <img
      src={brandMark}
      alt={alt}
      className={className}
      style={{ width: dimension, height: dimension, objectFit: "contain" }}
    />
  );
}
