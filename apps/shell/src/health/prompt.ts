import type { StoryEntry } from '@crypte/core/protocol'
import type { Failure, Finding } from './audit'
import type { TokenHealth } from './dashboard'
import { storyName, type HealthComponent } from './health'

// Le prompt qui confie à un agent ce que la vue santé relève. Le shell n'écrit
// jamais le code, DCJ-343 : l'agent connaît la façon dont le projet écrit ses
// composants et ses styles. Le même texte partira en issue GitHub avec le plugin
// editor. Chaque point nomme ses fichiers, pour que l'agent n'ait rien à chercher.

// Seulement ce que la liste du dashboard a coché : chaque section ne reprend
// que ses lignes cochées.
export interface Todo {
  failures: Failure[]
  findings: Finding[]
  unstoried: HealthComponent[]
  undocumented?: HealthComponent[]
  unexercised?: HealthComponent[]
  deprecated?: HealthComponent[]
  unused?: HealthComponent[]
  broken?: TokenHealth[]
  orphans?: TokenHealth[]
}

// Vide quand il ne reste rien : le bouton ne se montre pas.
export function promptOf(
  {
    failures,
    findings,
    unstoried,
    undocumented = [],
    unexercised = [],
    deprecated = [],
    unused = [],
    broken = [],
    orphans = [],
  }: Todo,
  stories: StoryEntry[],
): string {
  const count = [failures, findings, unstoried, undocumented, unexercised, deprecated, unused]
    .map((list) => list.length)
    .concat(broken.length, orphans.length)
    .reduce((sum, one) => sum + one, 0)
  if (count === 0) return ''
  const entry = (id: string) => stories.find((one) => one.id === id)
  const where = (id: string) => {
    const story = entry(id)
    return story
      ? [
          `- Story: \`${story.storyFile}\`, id \`${id}\``,
          `- Component: \`${story.component.file}\``,
        ]
      : [`- Story id: \`${id}\``]
  }
  const themes = (list: string[]) => `- Themes: ${list.length === 2 ? 'light and dark' : list[0]}`

  const sections = [
    'Fix what the Crypte health view reports in this design system. Change the components or their stories, in the way the project already writes them. Each item names its files.',
  ]
  if (failures.length > 0)
    sections.push(
      '## Render errors',
      ...failures.map((one) =>
        [
          `### ${storyName(stories, one.id)}`,
          ...where(one.id),
          themes(one.themes),
          `- Error: ${one.message}`,
          ...(one.stack ? ['', fence(stackOf(one.stack), '')] : []),
        ].join('\n'),
      ),
    )
  if (findings.length > 0)
    sections.push(
      '## Accessibility',
      ...findings.map((one) =>
        [
          `### ${one.violation.rule} in ${storyName(stories, one.id)} (${one.violation.impact})`,
          `- Problem: ${one.violation.help}`,
          `- Elements: ${one.violation.targets.map((target) => `\`${target}\``).join(', ')}`,
          ...where(one.id),
          themes(one.themes),
          `- Rule: ${one.violation.helpUrl}`,
        ].join('\n'),
      ),
    )
  if (unstoried.length > 0)
    sections.push(
      '## Stories to write',
      // Depuis l'usage et non la signature, DCJ-238 : le squelette de la vue
      // n'énumère que des props, le skill que `crypte init` écrit lit les appels.
      'Write them from the places the application uses each component, following `.claude/skills/write-stories/SKILL.md`, which `crypte init` writes (run it again to add it if it is missing): propose the cases found there, and let a person keep and name them.',
      ...unstoried.map((one) =>
        [
          `### ${one.name}`,
          `- Component: \`${one.file}\`, export \`${one.export}\``,
          `- Required props: ${one.required}`,
          ...(one.skeleton ? [`- Story file to create: \`${one.skeleton.file}\``] : []),
        ].join('\n'),
      ),
    )
  const component = (one: HealthComponent) =>
    `- Component: \`${one.file}\`, export \`${one.export}\``
  // Les composants du dossier et les fichiers de l'application qui l'importent.
  const importers = (one: HealthComponent) => [
    ...((one.usedBy?.length ?? 0) > 0 ? [`- Imported by components: ${files(one.usedBy!)}`] : []),
    ...((one.usedIn?.length ?? 0) > 0
      ? [`- Imported by the application: ${one.usedIn!.map((file) => `\`${file}\``).join(', ')}`]
      : []),
  ]
  // Une clé `fichier:export`, ce que `usedBy` et les lecteurs d'un token portent.
  const files = (keys: string[]) =>
    keys.map((key) => `\`${key.slice(0, key.lastIndexOf(':'))}\``).join(', ')
  if (undocumented.length > 0)
    sections.push(
      '## Docs to write',
      // Section 1.1 des contrats : `Badge.md` à côté de `Badge.tsx` appartient au
      // composant de ce fichier de story, et se montre sur sa page.
      "A markdown file beside a story file, with the same name, is that component's page: write it there, as the project's other pages are written.",
      ...undocumented.map((one) => {
        const storyFile = stories.find((story) => one.stories.includes(story.id))?.storyFile
        return [
          `### ${one.name}`,
          component(one),
          ...(storyFile ? [`- Page to create: \`${storyFile.replace(/\.[^./]+$/, '.md')}\``] : []),
        ].join('\n')
      }),
    )
  if (unexercised.length > 0)
    sections.push(
      '## Props never exercised',
      'No story gives these props: add the cases that show them, or say in the component why a prop has no visible effect.',
      ...unexercised.map((one) =>
        [
          `### ${one.name}`,
          component(one),
          `- Props: ${(one.unexercised ?? []).map((prop) => `\`${prop}\``).join(', ')}`,
        ].join('\n'),
      ),
    )
  if (deprecated.length > 0)
    sections.push(
      '## Deprecated components',
      'Move these importers to what replaces each component, then remove the import. One nothing imports any more can go, with its stories.',
      ...deprecated.map((one) =>
        [
          `### ${one.name}`,
          component(one),
          ...importers(one),
          ...((one.usedBy?.length ?? 0) + (one.usedIn?.length ?? 0) === 0
            ? ['- Imported by: nothing left']
            : []),
        ].join('\n'),
      ),
    )
  if (unused.length > 0)
    sections.push(
      '## Components used nowhere',
      // `usedIn` ne compte que l'application : un composant que seul un autre du
      // dossier importe arrive ici, et le supprimer casserait celui-là.
      'No file of the application imports these components: use them where they belong. Remove one with its stories only when no component imports it either.',
      ...unused.map((one) => [`### ${one.name}`, component(one), ...importers(one)].join('\n')),
    )
  if (broken.length > 0)
    sections.push(
      '## Broken aliases',
      // Une cible absente ou un cycle, dans un thème au moins : la chaîne s'arrête
      // sans valeur, sur un nom qui peut exister ailleurs.
      'Each of these custom properties never reaches a value in at least one theme: its chain points at a property that theme does not declare, or loops back. Repair the chain.',
      ...broken.map((one) =>
        [
          `### --${one.name}`,
          ...(one.target ? [`- Chain stops at: \`--${one.target}\``] : []),
          ...(one.readers.length > 0 ? [`- Read by: ${files(one.readers)}`] : []),
        ].join('\n'),
      ),
    )
  if (orphans.length > 0)
    sections.push(
      '## Orphan tokens',
      'No component and no alias reads these custom properties: remove them from the style sheet that declares them, unless something outside the components folder needs them.',
      orphans.map((one) => `- \`--${one.name}\``).join('\n'),
    )
  sections.push(
    'When done, run the audit again from the health view: nothing above should be left.',
  )
  return `${sections.join('\n\n')}\n`
}

// La pile du projet seul : les frames de `node_modules` (le framework, le
// serveur) n'aident pas l'agent, et l'origine du serveur, dev ou build, ne mène
// à aucun fichier.
function stackOf(stack: string): string {
  return stack
    .split('\n')
    .filter((line, at) => at === 0 || !line.includes('/node_modules/'))
    .map((line) => line.replace(/https?:\/\/[^/\s]+\//g, ''))
    .join('\n')
}

// Une clôture plus longue que tout ce que le texte contient de backticks : une
// pile qui en porte ne referme pas le bloc.
function fence(text: string, lang: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${text.trimEnd()}\n${ticks}`
}
