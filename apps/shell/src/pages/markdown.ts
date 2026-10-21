// Le markdown d'une page en HTML. La page vient d'un dépôt qu'un build statique
// publie : le HTML brut s'affiche en texte, et un lien ou une image ne reste qu'en
// adresse absolue http, https ou mailto. Jugés sur le DOM, comme le navigateur les
// lit : sur le texte, `&#106;avascript:` passait pour un chemin relatif. Un chemin
// relatif se résoudrait contre le shell, qui ne sert pas le dossier des stories. Un titre
// descend d'un niveau : celui de la page est le `h2`, son `##` vient dessous.

import { Marked, type Tokens } from 'marked'

const escaped = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const marked = new Marked({
  async: false,
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading) {
      const level = Math.min(depth + 1, 6)
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`
    },
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escaped(text),
  },
})

const SAFE = ['http:', 'https:', 'mailto:']

const safe = (url: string) => {
  try {
    return SAFE.includes(new URL(url).protocol)
  } catch {
    return false
  }
}

// Un `template` : son contenu est inerte, rien n'y charge ni ne s'y exécute.
export function rendered(body: string): string {
  const template = document.createElement('template')
  template.innerHTML = marked.parse(body, { async: false })

  for (const link of template.content.querySelectorAll('a'))
    if (!safe(String(link.getAttribute('href')))) link.replaceWith(...link.childNodes)
  for (const image of template.content.querySelectorAll('img'))
    if (!safe(String(image.getAttribute('src')))) image.replaceWith(image.alt)

  return template.innerHTML
}
