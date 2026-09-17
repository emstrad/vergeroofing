// FAQ schema is generated from the questions already on the page rather than
// kept in a second list. Marked-up answers that differ from the visible ones
// are a guidelines violation, and the surest way to get there is maintaining
// the two separately.

function text(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function faqPairs(html) {
  const pairs = []
  const blocks = html.match(/<details class="qa">[\s\S]*?<\/details>/g) || []
  for (const block of blocks) {
    const question = block.match(/<summary>([\s\S]*?)<\/summary>/)
    const answer = block.match(/<p>([\s\S]*?)<\/p>/)
    if (!question || !answer) continue
    // The plus sign is the open/close affordance, not part of the question.
    const asked = question[1].replace(/<span class="qa-plus"[\s\S]*?<\/span>/, '')
    pairs.push({ question: text(asked), answer: text(answer[1]) })
  }
  return pairs
}

export function faqSchema(html) {
  const pairs = faqPairs(html)
  if (!pairs.length) return ''
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map((pair) => ({
      '@type': 'Question',
      name: pair.question,
      acceptedAnswer: { '@type': 'Answer', text: pair.answer }
    }))
  }
  return `<script type="application/ld+json">\n${JSON.stringify(data)}\n</script>`
}
