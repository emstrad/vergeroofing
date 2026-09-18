// Copied by hand from the Google Business Profile, and written into the HTML by
// the build. This is the source that matters for AI crawlers: a review that
// only exists after a fetch is a review they never see.
//
// Rules for this file, which the tests enforce:
//   - Reproduce the text exactly, typos included. Tidying somebody's words
//     makes them yours.
//   - No star average and no review count anywhere in visible copy. Google's
//     review snippet guidelines exclude ratings aggregated from another site,
//     so marking up a Google score to win stars in Google's own results is not
//     eligible and risks a manual action. There is no aggregateRating here and
//     there never will be.
//   - Nothing invented. An empty list ships an empty section, which is correct.
export const reviews = []

// Below this the whole section ships empty and hidden. A page with a thin set
// of reviews is worse than a page with none: it reads as a business nobody has
// used yet, which is the opposite of the intended effect.
export const REVIEW_FLOOR = 5
