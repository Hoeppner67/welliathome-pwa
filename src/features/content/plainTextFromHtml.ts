export function plainTextFromHtml(html: string): string {
  if (typeof DOMParser === 'undefined')
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const element of doc.querySelectorAll('script,style,form,template,svg,math'))
    element.remove()
  for (const block of doc.querySelectorAll('p,div,li,br,h1,h2,h3,h4,h5,h6,td,th,blockquote'))
    block.after(' ')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}
