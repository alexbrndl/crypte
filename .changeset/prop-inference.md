---
'@crypte/cli': minor
---

`details` carries what a component file declares about its props.

It was written empty since the manifest existed. The CLI now reads the component with oxc, without running it, and fills the five fields of `ResolvedPropDetails`: the kind, whether the prop is required, its default, its JSDoc description, and the options of a literal union.

**Two sources, in order.** The members of the props type when the file holds it, an inline literal or a named interface or alias. Failing that, the names in the parameter's destructuring pattern. A rest element names nothing, since what it holds lives only in the type it came from.

**Section 3.2's merge rule works now.** What a story file writes in `details` completes inference per prop and field by field: a `min` written by hand keeps the type, the description and the required flag that inference found. A prop the file names and inference did not is kept, since the author is documenting what the reader could not see.

**It reads what is written, and stops where the type checker would begin.** An imported props type, a generic, an intersection or an `extends` clause do not open: enumerating them needs the checker, and making a name appear that the file does not write is what the contract forbids for `props`. So a DOM pass-through surfaces the names in its own pattern, `className` for one, and nothing else. An unresolved reference is `unknown` rather than `object`, which would claim more than the file says.

**Having a default and being able to write it down are two facts.** `{ tone = compute() }` makes a prop optional for whoever calls the component, and its value is dropped rather than written: the CLI guarantees what it writes, and a computed value does not survive JSON.

Section 4.4 no longer says `details` travels untouched, since what reaches the manifest is the merge. `meta` and `options` still do.
