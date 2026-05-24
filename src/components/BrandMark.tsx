type BrandMarkProps = {
  className?: string;
  label?: string;
};

export default function BrandMark({ className = "h-9 w-9", label = "Axelrod" }: BrandMarkProps) {
  return (
    <img
      src="/brand/axelrod-face-logo-180.png"
      alt={label}
      className={`${className} rounded-full object-cover`}
      draggable={false}
    />
  );
}
