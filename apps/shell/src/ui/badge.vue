<script setup lang="ts">
// Un compte, `badge` de la maquette, en mono pour que les chiffres s'alignent.
// `default` : texte inverse sur l'accent, sur une surface neutre ; `inverse` : sur
// une surface qui porte déjà l'accent. `sm`, pour la barre d'activité : 10 px,
// coins pleins.
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
  background: var(--accent-base);
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
