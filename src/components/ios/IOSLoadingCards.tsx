/** Accessible placeholders for unresolved remote records. Never imply sample users or Quests exist. */
export default function IOSLoadingCards({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <section className="ios-loading-list" role="status" aria-label={label}>
      <p className="ios-loading-list__label">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <div className="ios-loading-card" key={index} aria-hidden="true">
          <span className="ios-loading-card__thumbnail" />
          <span className="ios-loading-card__lines">
            <span />
            <span />
          </span>
        </div>
      ))}
    </section>
  );
}
