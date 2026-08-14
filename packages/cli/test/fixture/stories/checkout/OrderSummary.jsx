import OrderSummary from '@/components/checkout/OrderSummary'

export default defineStories(OrderSummary, {
  meta: { status: 'stable', owner: 'checkout' },
  props: {
    title: 'Formule complète',
    benefits: ['Historique complet', 'Données vérifiées'],
  },
  stories: {
    'Par défaut': {},
    'Avec référence': { reference: 'REF-4821-KD' },
    'Replié sur mobile': story(
      { reference: 'REF-4821', children: <span>Neuf</span> },
      { responsive: 'mobile' },
    ),
  },
})
