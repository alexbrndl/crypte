<script setup lang="ts">
import { EmptyNote, SidebarLink, ColumnTitle } from '@crypte/ui'
import { plural } from '../plural'
import {
  AccessibilityIcon,
  Alert02Icon,
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
  // Les stories qui ne rendent pas, le compte de leur page.
  failures: number | null
  page: HealthPage
  hrefOf: (page: HealthPage) => string
}>()
const emit = defineEmits<{ pick: [page: HealthPage, event: MouseEvent] }>()

const ICONS: Record<HealthPage, typeof Search01Icon> = {
  overview: DashboardSquare01Icon,
  unstoried: ComponentIcon,
  failures: Alert02Icon,
  accessibility: AccessibilityIcon,
  statuses: Flag01Icon,
}

const gauges = computed(() => (props.components ? gaugesOf(props.components, props.audit) : []))
const countOf = (page: HealthPage) =>
  page === 'accessibility'
    ? (props.findings ?? '')
    : page === 'failures'
      ? (props.failures ?? '')
      : rowsOf(page, props.components ?? []).length
const score = computed(() => scoreOf(gauges.value))
</script>

<template>
  <div class="health">
    <ColumnTitle
      title="Health"
      :count="components && !unread ? `${plural(components.length, 'component')}` : undefined"
    />
    <EmptyNote v-if="unread">{{ unread }}</EmptyNote>
    <EmptyNote v-else-if="components === null">No components folder.</EmptyNote>
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
      <ColumnTitle class="pages" title="Pages" :count="PAGES.length" />
      <ul aria-label="Pages">
        <li v-for="one of PAGES" :key="one.page">
          <SidebarLink
            :href="hrefOf(one.page)"
            :current="one.page === page"
            :count="countOf(one.page)"
            @click="(event) => emit('pick', one.page, event)"
          >
            <template #icon><Icon :icon="ICONS[one.page]" /></template>
            {{ one.label }}
          </SidebarLink>
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
  --empty-note-padding: var(--space-0-5) var(--space-3);
}

.pages {
  padding-top: var(--space-3);
  box-shadow: inset 0 var(--stroke-hairline) 0 var(--border-base);
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
</style>
