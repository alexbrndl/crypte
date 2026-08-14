import OrderSummary from '@/components/checkout/OrderSummary'

export default defineStories(OrderSummary, {
  props: {
    title: 'Formule complète',
    benefits: ['Historique complet', 'Données vérifiées'],
  },
  stories: {
    'Par défaut': {},
    'Avec référence': { reference: 'REF-4821-KD' },
    'Replié sur mobile': { reference: 'REF-4821', children: <span>Neuf</span> },
  },
})
