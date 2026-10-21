import { describe, expect, test } from 'vitest'
import { rendered } from '../src/pages/markdown'

// Une page vient d'un dépôt qu'un build statique publie : rien de ce qu'elle
// écrit ne s'exécute dans le shell.

describe('the markdown of a page', () => {
  test('moves headings one level down, under the title of the page', () => {
    expect(rendered('# Un\n\n## Deux\n\n###### Six\n')).toBe(
      '<h2>Un</h2>\n<h3>Deux</h3>\n<h6>Six</h6>\n',
    )
  })

  test('shows raw HTML as text, in a block and inline', () => {
    expect(rendered('<script>alert(1)</script>\n\nUn <img src=x onerror=alert(1)> mot\n'))
      .toMatchInlineSnapshot(`
        "&lt;script&gt;alert(1)&lt;/script&gt;<p>Un &lt;img src=x onerror=alert(1)&gt; mot</p>
        "
      `)
  })

  test('follows only an http, https, mailto or relative link', () => {
    expect(
      rendered(
        '[a](https://x.dev) [b](mailto:a@x.dev) [c](./Badge.md) [d](javascript:alert(1)) [e](JavaScript:alert(1)) [f](data:text/html,x) [g](&#106;avascript:alert(1)) [h](java&#x09;script:alert(1)) [i](javascript&colon;alert(1)) [j](http://[)\n',
      ),
    ).toMatchInlineSnapshot(`
      "<p><a href="https://x.dev">a</a> <a href="mailto:a@x.dev">b</a> <a href="./Badge.md">c</a> d e f g h i j</p>
      "
    `)
  })

  test('draws an image only from a safe address', () => {
    expect(rendered('![ok](/logo.png) ![no](javascript:x)\n')).toMatchInlineSnapshot(`
      "<p><img src="/logo.png" alt="ok"> no</p>
      "
    `)
  })
})
