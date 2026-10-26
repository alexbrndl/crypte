import type { StoryEntry } from '@crypte/core/protocol'
import type { Failure, Finding } from './audit'
import { storyName, type HealthComponent } from './health'

// Le prompt qui confie à un agent ce que la vue santé relève. Le shell n'écrit
// jamais le code, DCJ-343 : l'agent connaît la façon dont le projet écrit ses
// composants et ses styles. Le même texte partira en issue GitHub avec le plugin
// editor. Chaque point nomme ses fichiers, pour que l'agent n'ait rien à chercher.

export interface Todo {
  failures: Failure[]
  findings: Finding[]
  unstoried: HealthComponent[]
}

// Vide quand il ne reste rien : le bouton ne se montre pas.
export function promptOf({ failures, findings, unstoried }: Todo, stories: StoryEntry[]): string {
  if (failures.length + findings.length + unstoried.length === 0) return ''
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
      'Write them from the places the application uses each component, following `.claude/skills/write-stories/SKILL.md`, which `crypte init` writes and adds when it is missing: propose the cases found there, and let a person keep and name them.',
      ...unstoried.map((one) =>
        [
          `### ${one.name}`,
          `- Component: \`${one.file}\`, export \`${one.export}\``,
          `- Required props: ${one.required}`,
          ...(one.skeleton ? [`- Story file to create: \`${one.skeleton.file}\``] : []),
        ].join('\n'),
      ),
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
