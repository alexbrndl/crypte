# @crypte/ui

## 0.0.1

### Patch Changes

- [#145](https://github.com/alexbrndl/crypte/pull/145) [`a3c29ba`](https://github.com/alexbrndl/crypte/commit/a3c29ba82f5ee2d6900031322d27b85e583648fd) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` adds `Field`, from the Figma file, and its `Select` becomes Reka's, a drawn list rather than the system menu. `@crypte/controls` draws each prop as a field, marks an edited one as overridden, and gives that one back to the story on its own.

- [#159](https://github.com/alexbrndl/crypte/pull/159) [`597585b`](https://github.com/alexbrndl/crypte/commit/597585b16640b29927d657d299b11d2186e63d92) Thanks [@alexbrndl](https://github.com/alexbrndl)! - An unchecked `Checkbox` draws its keyboard focus inside its edge, like `Input` and `Select`, so it no longer touches its neighbours.

- [#151](https://github.com/alexbrndl/crypte/pull/151) [`b1fd211`](https://github.com/alexbrndl/crypte/commit/b1fd2116d87d68471b29fe1bfd8c5ff74af247a1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` depends on `reka-ui` rather than bundling it, and the shell builds its `vendor/ui.js` itself: the shell and `@crypte/ui` share one copy of Reka, 19 kB gzip lighter. The zoom menu says its keys at its foot instead of in a tooltip.

- [#148](https://github.com/alexbrndl/crypte/pull/148) [`3cb16c3`](https://github.com/alexbrndl/crypte/commit/3cb16c307fd7a4557eef5eb18c807dac74d901b0) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The shell hands a panel back what it edited, as its `overrides` prop, and shows a Reset all in the panel's head while there is any. `@crypte/controls` reads its values from that prop and drops its Back to the story button. `@crypte/ui` adds the `ghost` button.

- [#142](https://github.com/alexbrndl/crypte/pull/142) [`d2c3532`](https://github.com/alexbrndl/crypte/commit/d2c3532d4e5e3d90b819be72a93cb76b51e499cc) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` adds `Button`, `Input`, `Select` and `Checkbox`, drawn from the Figma file. The shell serves `@crypte/ui` through its import map next to `vue`, so a panel draws with the shell's own components. `@crypte/controls` and `@crypte/a11y` use them, and declare `@crypte/ui` as a peer dependency.

- [#134](https://github.com/alexbrndl/crypte/pull/134) [`f7dce1a`](https://github.com/alexbrndl/crypte/commit/f7dce1a7022022ad2696d92aefbe21fc2fc9d5ab) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `@crypte/ui` ships the design tokens of the Figma file as CSS custom properties, light and dark, and `Alert` takes `color` as `warning` or `error`. The shell follows the system theme, and switches between light and dark with `t` or from the command palette, remembering the choice. It is set in Geist and Geist Mono.

- [#173](https://github.com/alexbrndl/crypte/pull/173) [`778d292`](https://github.com/alexbrndl/crypte/commit/778d292b0b4aaae3d296e9ce1992abb884668baf) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The activity bar names each view in a tooltip on its right, versions with its count of differences. The breadcrumb starts with the view. The right panel closes below 1180 px on every view, and a toolbar button shows or hides it at any width. `Tooltip` takes a `detail`, drawn after its content, and a `side`.

- [#157](https://github.com/alexbrndl/crypte/pull/157) [`76981b0`](https://github.com/alexbrndl/crypte/commit/76981b04d3a1ab2872d59d17c5eb40443750f8f8) Thanks [@alexbrndl](https://github.com/alexbrndl)! - Muted and subtle text and the light accent follow the design system: muted text is darker in light and lighter in dark, subtle text now reads at 4.5:1 on base and raised surfaces in both themes, and the light accent is a deeper teal. The shell's status bar loses its background.

- [#165](https://github.com/alexbrndl/crypte/pull/165) [`7112fdc`](https://github.com/alexbrndl/crypte/commit/7112fdc5ae0188a7067cef27d43b0eec82d373a5) Thanks [@alexbrndl](https://github.com/alexbrndl)! - `Tooltip` takes a `keys` prop and draws the shortcut as an inverse keycap beside its content. Keycaps in buttons, the command palette and the zoom menu share the design system's subtle background.

- [#84](https://github.com/alexbrndl/crypte/pull/84) [`ec74127`](https://github.com/alexbrndl/crypte/commit/ec74127e6e2c91886e82895851d25346fafa1173) Thanks [@alexbrndl](https://github.com/alexbrndl)! - New package: the components Crypte's shell and site draw in common, and the design tokens, starting with `Alert`. Vue is its only peer; import `@crypte/ui/style.css` once.

- [#149](https://github.com/alexbrndl/crypte/pull/149) [`30a1706`](https://github.com/alexbrndl/crypte/commit/30a170692453169c046a39ed1af94a872458913b) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom menu lists the whole scale, 25 to 400 %. The shell's hints become drawn tooltips, on hover and focus: `@crypte/ui` adds `Tooltip`, and `Field` shows a prop's description through it.

- [#147](https://github.com/alexbrndl/crypte/pull/147) [`91dcd79`](https://github.com/alexbrndl/crypte/commit/91dcd7901e80dfc64b18a861d67fe3eea3bf9eb1) Thanks [@alexbrndl](https://github.com/alexbrndl)! - The zoom menu offers values, 50 to 200 %, the current one checked; the keys still step from 25 to 400 %. The navigation column, the workspace and the status bar follow their Figma frame more closely, and the workspace keeps its card in full screen. `@crypte/ui` adds the `--space-0-25` token, 1 px.
