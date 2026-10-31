<script setup lang="ts">
// A count, `badge` of the Figma file, in mono so the figures line up.
// `default`: inverse text on the accent, over a neutral surface; `inverse`: over
// a surface that already holds the accent. `sm`, for the activity bar: 10 px,
// full corners.
withDefaults(defineProps<{ tone?: 'default' | 'inverse'; size?: 'md' | 'sm' }>(), {
  tone: 'default',
  size: 'md',
})
</script>

<template>
  <span class="badge" :data-tone="tone" :data-size="size"><slot /></span>
</template>

<style scoped>
.badge {
  padding: var(--space-0-5) var(--space-1);
  border-radius: var(--radius-xs);
  /* Not `--accent-base`: its dark teal-500 stays under APCA Lc 60. */
  background: var(--text-current);
  color: var(--text-inverse);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--leading-xs);
  letter-spacing: 0;
  text-transform: none;
}

.badge[data-tone='inverse'] {
  background: var(--background-raised);
  color: var(--text-current);
}

.badge[data-size='sm'] {
  min-width: 14px;
  box-sizing: border-box;
  padding: 0 3px;
  border-radius: var(--radius-full);
  font-size: var(--text-2xs);
  line-height: var(--leading-2xs);
  text-align: center;
}
</style>
