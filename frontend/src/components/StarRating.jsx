const STARS = [1, 2, 3, 4, 5]

export default function StarRating({ value, onRate, submitting }) {
  if (!onRate) {
    return (
      <div className="star-rating" aria-label={`Rated ${value} out of 5`}>
        {STARS.map((n) => (
          <span key={n} className={n <= value ? 'star-filled' : 'star-empty'} aria-hidden="true">
            ★
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="star-rating" role="radiogroup" aria-label="Rate this resolution">
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          className="star-button"
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          disabled={submitting}
          onClick={() => onRate(n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}
