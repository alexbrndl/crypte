import type { StoryEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import type { Failure, Finding } from '../src/health/audit'
import type { TokenHealth } from '../src/health/dashboard'
import type { HealthComponent } from '../src/health/health'
import { promptOf, type Todo } from '../src/health/prompt'

// Le prompt confié à un agent : chaque point nomme ses fichiers.

const story = (id: string, path: string[], name: string, file: string) =>
  ({
    type: 'story',
    id,
    path,
    name,
    storyFile: `stories/${file}.stories.tsx`,
    component: { file: `src/components/${file}.tsx`, export: file },
  }) as StoryEntry

const stories = [
  story('badge--alerte', ['Badge'], 'Alerte', 'Badge'),
  story('tag--role', ['Tag'], 'Rôle inconnu', 'Tag'),
]

const failure: Failure = {
  key: 'badge--alerte',
  id: 'badge--alerte',
  message: 'boum',
  stack:
    'Error: boum\n    at `Badge` (http://localhost:5173/src/components/Badge.tsx:3:8)\n    at renderWithHooks (http://localhost:5173/node_modules/.crypte/deps/react.js:4211:19)',
  themes: ['light', 'dark'],
}
const finding: Finding = {
  key: 'tag--role:aria-roles',
  id: 'tag--role',
  violation: {
    rule: 'aria-roles',
    impact: 'critical',
    help: 'ARIA roles used must conform to valid values',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-roles',
    targets: ['span[role="nope"]', '.tag'],
  },
  themes: ['dark'],
  colors: {},
}
const select: HealthComponent = {
  name: 'Select',
  file: 'src/components/form/Select.tsx',
  export: 'default',
  stories: [],
  props: 3,
  required: 1,
  skeleton: {
    file: 'src/components/form/Select.stories.tsx',
    source:
      "export default { component: Select }\n\nexport const Default = { args: { value: '```' } }\n",
  },
}

describe('the prompt for an agent', () => {
  test('is empty when nothing is left', () => {
    expect(promptOf({ failures: [], findings: [], unstoried: [] }, stories)).toBe('')
  })

  // Une pile qui porte des backticks ne referme pas son bloc.
  test('names the files of every render error, violation and story to write', () => {
    expect(promptOf({ failures: [failure], findings: [finding], unstoried: [select] }, stories))
      .toMatchInlineSnapshot(`
        "Fix what the Crypte health view reports in this design system. Change the components or their stories, in the way the project already writes them. Each item names its files.

        ## Render errors

        ### Badge / Alerte
        - Story: \`stories/Badge.stories.tsx\`, id \`badge--alerte\`
        - Component: \`src/components/Badge.tsx\`
        - Themes: light and dark
        - Error: boum

        \`\`\`
        Error: boum
            at \`Badge\` (src/components/Badge.tsx:3:8)
        \`\`\`

        ## Accessibility

        ### aria-roles in Tag / Rôle inconnu (critical)
        - Problem: ARIA roles used must conform to valid values
        - Elements: \`span[role="nope"]\`, \`.tag\`
        - Story: \`stories/Tag.stories.tsx\`, id \`tag--role\`
        - Component: \`src/components/Tag.tsx\`
        - Themes: dark
        - Rule: https://dequeuniversity.com/rules/axe/4.10/aria-roles

        ## Stories to write

        Write them from the places the application uses each component, following \`.claude/skills/write-stories/SKILL.md\`, which \`crypte init\` writes (run it again to add it if it is missing): propose the cases found there, and let a person keep and name them.

        ### Select
        - Component: \`src/components/form/Select.tsx\`, export \`default\`
        - Required props: 1
        - Story file to create: \`src/components/form/Select.stories.tsx\`

        When done, run the audit again from the health view: nothing above should be left.
        "
      `)
  })

  // Une story absente du catalogue garde son identifiant ; sans squelette, pas
  // de fichier à créer.
  test('keeps the id of a story the catalogue does not hold', () => {
    expect(
      promptOf(
        {
          failures: [
            { ...failure, id: 'gone--x', key: 'gone--x', stack: undefined, themes: ['light'] },
          ],
          findings: [],
          unstoried: [{ ...select, skeleton: undefined }],
        },
        stories,
      ),
    ).toMatchInlineSnapshot(`
      "Fix what the Crypte health view reports in this design system. Change the components or their stories, in the way the project already writes them. Each item names its files.

      ## Render errors

      ### gone--x
      - Story id: \`gone--x\`
      - Themes: light
      - Error: boum

      ## Stories to write

      Write them from the places the application uses each component, following \`.claude/skills/write-stories/SKILL.md\`, which \`crypte init\` writes (run it again to add it if it is missing): propose the cases found there, and let a person keep and name them.

      ### Select
      - Component: \`src/components/form/Select.tsx\`, export \`default\`
      - Required props: 1

      When done, run the audit again from the health view: nothing above should be left.
      "
    `)
  })

  const badge: HealthComponent = {
    name: 'Badge',
    file: 'src/components/Badge.tsx',
    export: 'Badge',
    stories: ['badge--alerte'],
    props: 4,
    required: 0,
    unexercised: ['onClose', 'size'],
  }
  const token = (name: string, over: Partial<TokenHealth> = {}): TokenHealth => ({
    key: `tokens--x/${name}`,
    name,
    family: 'tokens--x',
    state: 'orphan',
    suspect: false,
    readers: [],
    ...over,
  })

  // Les sections du dashboard, chacune avec les fichiers qu'un agent doit ouvrir.
  test('names the files of the docs, props, deprecated, unused and token items', () => {
    expect(
      promptOf(
        {
          failures: [],
          findings: [],
          unstoried: [],
          undocumented: [badge],
          unexercised: [badge],
          deprecated: [
            {
              ...badge,
              name: 'OldTag',
              status: 'deprecated',
              usedBy: ['src/components/Order.tsx:Order'],
              usedIn: ['src/pages/Home.tsx'],
            },
            { ...badge, name: 'Forgotten', status: 'deprecated' },
          ],
          unused: [
            { ...badge, name: 'Lonely', file: 'src/components/Lonely.tsx', export: 'Lonely' },
            { ...badge, name: 'Icon', usedBy: ['src/components/Button.tsx:Button'] },
          ],
          broken: [
            token('color-chart-3', {
              state: 'broken',
              target: 'teal-450',
              readers: ['src/components/Chart.tsx:Chart'],
            }),
          ],
          orphans: [token('space-7'), token('radius-xl')],
        },
        stories,
      ),
    ).toMatchInlineSnapshot(`
      "Fix what the Crypte health view reports in this design system. Change the components or their stories, in the way the project already writes them. Each item names its files.

      ## Docs to write

      A markdown file beside a story file, with the same name, is that component's page: write it there, as the project's other pages are written.

      ### Badge
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`
      - Page to create: \`stories/Badge.stories.md\`

      ## Props never exercised

      No story gives these props: add the cases that show them, or say in the component why a prop has no visible effect.

      ### Badge
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`
      - Props: \`onClose\`, \`size\`

      ## Deprecated components

      Move these importers to what replaces each component, then remove the import. One nothing imports any more can go, with its stories.

      ### OldTag
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`
      - Imported by components: \`src/components/Order.tsx\`
      - Imported by the application: \`src/pages/Home.tsx\`

      ### Forgotten
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`
      - Imported by: nothing left

      ## Components used nowhere

      No file of the application imports these components: use them where they belong. Remove one with its stories only when no component imports it either.

      ### Lonely
      - Component: \`src/components/Lonely.tsx\`, export \`Lonely\`

      ### Icon
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`
      - Imported by components: \`src/components/Button.tsx\`

      ## Broken aliases

      Each of these custom properties never reaches a value in at least one theme: its chain points at a property that theme does not declare, or loops back. Repair the chain.

      ### --color-chart-3
      - Chain stops at: \`--teal-450\`
      - Read by: \`src/components/Chart.tsx\`

      ## Orphan tokens

      No component and no alias reads these custom properties: remove them from the style sheet that declares them, unless something outside the components folder needs them.

      - \`--space-7\`
      - \`--radius-xl\`

      When done, run the audit again from the health view: nothing above should be left.
      "
    `)
  })

  // Une seule ligne cochée suffit à faire un prompt, quelle que soit sa section.
  test.for<[string, Partial<Todo>, string]>([
    ['undocumented', { undocumented: [badge] }, '## Docs to write'],
    ['unexercised', { unexercised: [badge] }, '## Props never exercised'],
    ['deprecated', { deprecated: [badge] }, '## Deprecated components'],
    ['unused', { unused: [badge] }, '## Components used nowhere'],
    ['broken', { broken: [token('a', { state: 'broken' })] }, '## Broken aliases'],
    ['orphans', { orphans: [token('a')] }, '## Orphan tokens'],
  ])('is not empty with %s alone', ([, todo, heading]) => {
    expect(promptOf({ failures: [], findings: [], unstoried: [], ...todo }, stories)).toContain(
      heading,
    )
  })

  // Sans story, pas de fichier de story à côté duquel écrire la page.
  test('names no page to create for a component without a story', () => {
    expect(
      promptOf(
        { failures: [], findings: [], unstoried: [], undocumented: [{ ...badge, stories: [] }] },
        stories,
      ),
    ).toMatchInlineSnapshot(`
      "Fix what the Crypte health view reports in this design system. Change the components or their stories, in the way the project already writes them. Each item names its files.

      ## Docs to write

      A markdown file beside a story file, with the same name, is that component's page: write it there, as the project's other pages are written.

      ### Badge
      - Component: \`src/components/Badge.tsx\`, export \`Badge\`

      When done, run the audit again from the health view: nothing above should be left.
      "
    `)
  })
})
