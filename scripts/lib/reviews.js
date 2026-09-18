import { reviews, REVIEW_FLOOR } from '../../content/reviews.js'
import { escape } from './layout.js'

// The build writes these cards, and /api/reviews replaces them at runtime with
// live Place Details where a key is configured. Both sources agree on this
// markup, so the two are indistinguishable on the page and nothing shifts when
// the fetch lands.
export function reviewCard(review) {
  return `<article class="review">
            <p>${escape(review.text)}</p>
            <p class="review-attr">${escape(review.attr)}${review.src ? ' <span class="src">' + escape(review.src) + '</span>' : ''}</p>
          </article>`
}

export function reviewsSection() {
  if (reviews.length < REVIEW_FLOOR) return ''

  return `<section id="reviews" class="proof" aria-labelledby="reviews-heading">
  <div class="container">
    <div class="section-head">
      <span class="eyebrow">Real clients. Real results.</span>
      <h2 id="reviews-heading" class="h-section">Details make the difference.</h2>
      <p class="lede">Most of our work comes from a neighbour who watched the last job, or a client whose previous roofer did not come back.</p>
    </div>
    <div class="carousel" aria-label="Client feedback" data-reviews>
      <div class="carousel-track">
          ${reviews.map(reviewCard).join('\n          ')}
      </div>
    </div>
  </div>
</section>`
}

export function reviewCount() {
  return reviews.length
}
