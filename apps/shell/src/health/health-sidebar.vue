<script setup lang="ts">
import {
  AccessibilityIcon,
  ComponentIcon,
  DashboardSquare01Icon,
  Flag01Icon,
  type Search01Icon,
} from '@hugeicons/core-free-icons'
import { computed } from 'vue'
import Icon from '../ui/icon.vue'
import type { AuditResult } from './audit'
import { gaugesOf, PAGES, rowsOf, scoreOf, type HealthComponent, type HealthPage } from './health'

// La sidebar de la vue santé : le score et ses jauges, puis les pages, chacune
// avec ce qu'elle liste. Sans dossier `components` déclaré, rien à compter.
const props = defineProps<{
  components: HealthComponent[] | null
  // Ce qui se dit avant une lecture, ou après son échec, à la place du score.
  unread?: string
  // L'audit passé, ou `null` avant : sa jauge n'apparaît qu'ensuite.
  audit: AuditResult[] | null
  // Les violations trouvées, le compte de la page accessibilité.
  findings: number | null
  page: HealthPage
  hrefOf: (page: HealthPage) => string
}>()
const emit = defineEmits<{ pick: [page: HealthPage, event: MouseEvent] }>()

const ICONS: Record<HealthPage, typeof Search01Icon> = {
  overview: DashboardSquare01Icon,
  unstoried: ComponentIcon,
  accessibility: AccessibilityIcon,
  statuses: Flag01Icon,
}

const gauges = computed(() => (props.components ? gaugesOf(props.components, props.audit) : []))
const countOf = (page: HealthPage) =>
  page === 'accessibility' ? (props.findings ?? '') : rowsOf(page, props.components ?? []).length
const score = computed(() => scoreOf(gauges.value))
</script>

<template>
  <div class="health">
    <div class="title">
      <h2>Health</h2>
      <span v-if="components && !unread" class="meta"
        >{{ components.length }} {{ components.length === 1 ? 'component' : 'components' }}</span
      >
    </div>
    <p v-if="unread" class="none">{{ unread }}</p>
    <p v-else-if="components === null" class="none">no components folder</p>
    <template v-else>
      <section class="score" aria-label="Score">
        <p class="top">
          <strong>{{ score }} %</strong>{{ ' ' }}<span>overall health</span>
        </p>
        <p v-for="gauge of gauges" :key="gauge.label" class="gauge">
          <span class="label">{{ gauge.label }}</span
          >{{ ' ' }}
          <span
            class="track"
            role="meter"
            :aria-label="gauge.label"
            :aria-valuenow="gauge.done"
            aria-valuemin="0"
            :aria-valuemax="gauge.total"
          >
            <span
              class="fill"
              :style="{ width: `${gauge.total === 0 ? 0 : (gauge.done / gauge.total) * 100}%` }"
            />
          </span>
          {{ ' ' }}<span class="ratio">{{ gauge.done }}/{{ gauge.total }}</span>
        </p>
      </section>
      <div class="title pages">
        <h2>Pages</h2>
        <span class="meta">{{ PAGES.length }}</span>
      </div>
      <ul aria-label="Pages">
        <li v-for="one of PAGES" :key="one.page">
          <a
            :href="hrefOf(one.page)"
            :aria-current="one.page === page ? 'page' : undefined"
            @click="emit('pick', one.page, $event)"
          >
            <Icon :icon="ICONS[one.page]" />
            <span class="name">{{ one.label }}</span>
            <span class="meta">{{ countOf(one.page) }}</span>
          </a>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.health {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

/* The column-title of the Figma sidebar, 32 px with its taller top. */
.title {
  display: flex;
  align-items: center;
  padding: var(--space-2-5) var(--space-3) var(--space-1-5);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.title.pages {
  padding-top: var(--space-3);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-base);
}

.title h2 {
  flex: 1;
  margin: 0;
  color: var(--text-muted);
  font-size: inherit;
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
}

.meta {
  color: var(--text-subtle);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

/* Le bloc `score` : padding 8/12, gap 10, le chiffre en 24 sur la ligne de base. */
.score {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  padding: var(--space-4) var(--space-3);
}

.score p {
  margin: 0;
}

.top {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.top strong {
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: var(--weight-medium);
  line-height: var(--leading-2xl);
}

/* Une jauge : libellé 44, piste de 6 px, rapport 40 en mono. */
.gauge {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
}

.gauge .label {
  width: 44px;
  flex: none;
}

.track {
  position: relative;
  flex: 1;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--border-light);
}

.fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: 3px;
  background: var(--accent-base);
}

.ratio {
  width: 40px;
  flex: none;
  font-family: var(--font-mono);
  text-align: right;
}

ul {
  margin: 0;
  padding: 0 0 var(--space-2);
  list-style: none;
}

/* La ligne `page` : padding 2/12, gap 6, l'icône puis le libellé et le compte. */
a {
  display: flex;
  gap: var(--space-1-5);
  align-items: center;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-sm);
  text-decoration: none;
}

a:hover {
  background: var(--background-hover);
  color: var(--text-primary);
}

a:focus-visible {
  outline: var(--stroke-focus) solid var(--accent-focus);
  outline-offset: calc(-1 * var(--stroke-focus));
}

a[aria-current='page'] {
  box-shadow: inset var(--stroke-marker) 0 0 var(--accent-base);
  background: var(--background-current);
  color: var(--text-current);
  font-weight: var(--weight-medium);
}

.name {
  flex: 1;
}

.none {
  margin: 0;
  padding: var(--space-0-5) var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}
</style>
