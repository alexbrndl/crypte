import type { StoryEntry } from '@crypte/core/protocol'
import { describe, expect, test } from 'vitest'
import type { Failure, Finding } from '../src/health/audit'
import type { HealthComponent } from '../src/health/health'
import { promptOf } from '../src/health/prompt'

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

  // Une pile ou un squelette qui porte des backticks ne referme pas son bloc.
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

        ### Select
        - Component: \`src/components/form/Select.tsx\`, export \`default\`
        - Required props: 1, to give in its Default story
        - Story file to create: \`src/components/form/Select.stories.tsx\`

        \`\`\`\`tsx
        export default { component: Select }

        export const Default = { args: { value: '\`\`\`' } }
        \`\`\`\`

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

      ### Select
      - Component: \`src/components/form/Select.tsx\`, export \`default\`
      - Required props: 1, to give in its Default story

      When done, run the audit again from the health view: nothing above should be left.
      "
    `)
  })
})
