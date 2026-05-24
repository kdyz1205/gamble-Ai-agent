type BrandMarkProps = {
  className?: string;
  label?: string;
};

export default function BrandMark({ className = "h-9 w-9", label = "Axelrod" }: BrandMarkProps) {
  return (
    <img
      src="/brand/axelrod-mark-180.png"
      alt={label}
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}
