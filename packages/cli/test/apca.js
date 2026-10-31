// Le contraste en APCA (0.0.98G), chargé dans la page après axe, qui ne sert
// qu'à lire les couleurs, fond composé et opacité compris. Chaque texte visible
// doit atteindre le seuil Bronze : Lc 60, ou Lc 45 en grand (36 px, ou 24 px
// gras) et pour le texte secondaire, celui qui porte la couleur `--text-subtle`
// (séparateurs, comptes de la sidebar, indices). WCAG 2 refusait le blanc sur le vert et l'orange pleins de la maquette,
// à Lc 64 et 65. Les cases des blocs santé hors du focus, au survol ou tant
// qu'un élément est choisi, sont estompées exprès : elles ne sont pas jugées. Rend aussi le nombre de textes lus, pour qu'une page
// où rien n'est lu ne passe pas pour conforme.
globalThis.apca = () => {
  const luminance = ({ red, green, blue }) => {
    const y =
      0.2126729 * (red / 255) ** 2.4 +
      0.7151522 * (green / 255) ** 2.4 +
      0.072175 * (blue / 255) ** 2.4
    return y > 0.022 ? y : y + (0.022 - y) ** 1.414
  }
  const lc = (text, back) => {
    const [t, b] = [luminance(text), luminance(back)]
    const s = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14
    return Math.abs(s) < 0.1 ? 0 : Math.abs(s) * 100 - 2.7
  }
  const { axe } = globalThis
  const probe = document.body.appendChild(document.createElement('span'))
  probe.style.color = 'var(--text-subtle)'
  const subtle = getComputedStyle(probe).color
  probe.remove()
  axe.setup()
  const found = []
  let read = 0
  for (const node of document.body.querySelectorAll('*')) {
    const own = [...node.childNodes].some((one) => one.nodeType === 3 && one.textContent.trim())
    if (!own || node.closest('iframe, .health-blocks [data-dimmed], [disabled]')) continue
    if (!axe.commons.dom.isVisibleOnScreen(node)) continue
    const back = axe.commons.color.getBackgroundColor(node)
    const text = back && axe.commons.color.getForegroundColor(node, false, back)
    if (!back || !text) continue
    read += 1
    const style = getComputedStyle(node)
    const size = parseFloat(style.fontSize)
    const large = size >= 36 || (size >= 24 && Number(style.fontWeight) >= 700)
    const secondary = style.color === subtle
    const value = lc(text, back)
    if (value < (large || secondary ? 45 : 60)) {
      found.push(`apca: ${axe.utils.getSelector(node)} Lc ${Math.round(value)}`)
    }
  }
  axe.teardown()
  return { read, found }
}
