/* Replaces the cards the build wrote, where a live source is configured. The
   markup matches exactly, so nothing on the page moves when this lands, and
   every value goes in with textContent because it is other people's writing
   arriving over a network. */
;(function () {
  var holder = document.querySelector('[data-reviews] .carousel-track')
  if (!holder) return

  fetch('/api/reviews').then(function (response) {
    return response.json()
  }).then(function (data) {
    if (!data.reviews || data.reviews.length < 5) return
    var track = document.createElement('div')
    track.className = 'carousel-track'
    data.reviews.forEach(function (review) {
      var card = document.createElement('article')
      card.className = 'review'
      var text = document.createElement('p')
      text.textContent = review.text
      var attr = document.createElement('p')
      attr.className = 'review-attr'
      attr.textContent = review.attr
      card.appendChild(text)
      card.appendChild(attr)
      track.appendChild(card)
    })
    holder.replaceWith(track)
  }).catch(function () {
    /* The cards the build wrote stay exactly where they are. */
  })
})()
