// The skill `crypte init` writes for an agent working in the project, Claude
// Code first: write the stories of a component from how the application calls
// it, never from its signature (DCJ-238). Inference already gives the props;
// what no inference gives is which cases matter, and their names.

export const SKILL_FILE = '.claude/skills/write-stories/SKILL.md'

// The same text for every project: it sends the agent to `crypte.config.ts` for
// the story folder and the adapter, so a configuration edited later does not
// leave it describing another project.
export const SKILL = `---
name: write-stories
description: Write Crypte stories for a component from the places the application uses it. Use when a component has no story, when \`crypte check\` lists one, or when the user asks for stories.
---

# Write stories from usage

A story is a case worth seeing again: a state the application really reaches, under a name a person chose. Inference already reads the component's props; listing their combinations gives a folder of stories nobody picked. **Read the calls, not the signature.**

## 1. Find the components to cover

Run \`crypte check\`: every line \`… has no story\` names a component and its file. Or start from the component the user named.

With the \`crypte mcp\` server connected, the \`components\` and \`component\` tools give each component's props, its existing stories and their call code.

## 2. Read how the application calls it

Search the application for the component's imports and its call sites, outside the story folder (\`stories\` in \`crypte.config.ts\`) and outside the component's own file. For each call, note the props it passes, the values or the kind of values, and the context around it: a list, an error branch, a loading state, an empty state.

Group the calls that show the same case. A case is a state the user would recognise: "Empty cart", "Payment refused", "Long product name". Two calls that differ only by a label are one case.

## 3. Propose, and let a person name

Show the cases found, each with where it comes from (file and line) and the props it needs. Do not write the file yet. The person keeps, drops and **names** them: the name is what makes a story readable in six months, and it is the one thing no reading of the code can produce. Suggest a name; never decide it alone.

Do not add cases the application never reaches. A prop combination with no call behind it is not a story.

## 4. Write the story file

One file per component, at the component's own path under the story folder, so the tree of stories mirrors the tree of components: \`src/components/checkout/OrderSummary.tsx\` gives \`checkout/OrderSummary.ts\`. Its extension follows the project: \`.ts\` with TypeScript and \`.js\` without, \`.tsx\` or \`.jsx\` when a story writes JSX, and \`.ts\` for a \`.vue\` component. \`defineStories\` comes from the adapter \`crypte.config.ts\` imports, \`@crypte/react\` or \`@crypte/vue\`; a \`.vue\` component is imported by default, its extension included. Props every story shares go in \`props\`; each story declares only what differs:

\`\`\`ts
import { defineStories } from '@crypte/react'
import { OrderSummary } from '../src/components/OrderSummary'

export default defineStories(OrderSummary, {
  props: { title: 'Full plan and two modules' },
  stories: {
    'Default': {},
    'With reference': { reference: 'REF-4821-KD' },
  },
})
\`\`\`

Story names are free strings, accents and spaces included. Values are what the application passes, not placeholders. A component that needs a provider takes \`wrap\`. Run \`crypte check\` again: the component should no longer be listed.
`
