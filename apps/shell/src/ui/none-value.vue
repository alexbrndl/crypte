<script setup lang="ts">
import { texts } from '../i18n'

const t = texts({ en: { none: 'none' }, fr: { none: 'aucun' } })
</script>

<template>
  <span class="none-value">{{ t('none') }}</span>
</template>

<style scoped>
.none-value {
  color: var(--text-muted);
}
</style>
