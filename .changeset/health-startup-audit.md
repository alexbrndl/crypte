---
'@crypte/cli': patch
---

The health view audits the stories by itself once the first one has rendered, with or without the a11y plugin, and counts what is left to do on its activity bar badge. A new page lists the stories that fail to render, with their error. Its right column splits into a To do panel, the actions of the chosen row, and a Links panel, its stories, component page, file and the tokens it reads. A component without a story says whether its Default story is enough or how many required props it needs.
