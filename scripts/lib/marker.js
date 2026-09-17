// Writing between markers rather than regenerating a whole page keeps the home
// page hand-written and still lets the build own the parts that must not be
// hand-maintained: the quote form, the phone number, the structured data.
export function fillMarkers(html, name, content) {
  const open = `<!-- ${name}:START -->`
  const close = `<!-- ${name}:END -->`
  const parts = html.split(open)
  if (parts.length === 1) return html

  let out = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf(close)
    if (end === -1) throw new Error(`unclosed marker ${name}`)
    out += open + '\n' + content + '\n' + close + parts[i].slice(end + close.length)
  }
  return out
}

export function countMarkers(html, name) {
  return html.split(`<!-- ${name}:START -->`).length - 1
}
