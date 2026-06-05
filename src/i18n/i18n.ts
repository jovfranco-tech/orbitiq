// ============================================================
// OrbitIQ — i18n  (EN default + ES)
// ============================================================

export type LangKey = 'en' | 'es';

type Dict = Record<string, string>;

const DICT: Record<LangKey, Dict> = {
  en: {
    brand: 'OrbitIQ',
    brandSub: 'Command Center',
    tagline: 'AI-native satellite operations & orbital intelligence',
    status_online: 'OPERATIONAL',
    status_loading: 'ACQUIRING ELEMENTS',
    prov_live: 'LIVE PUBLIC TLE',
    prov_cached: 'CACHED PUBLIC TLE',
    prov_demo: 'DEMO · REPRESENTATIVE',
    prov_live_note:
      'Live public two-line elements from CelesTrak, propagated with SGP4.',
    prov_cached_note: 'Cached public TLE snapshot (≤6 h old), propagated with SGP4.',
    prov_demo_note:
      'Representative orbital shells + real anchor objects. Valid TLEs, real SGP4 physics — not a live snapshot of every object.',
    provenance: 'Data provenance',
    reset_view: 'Reset view',
    disclaimer:
      'Uses real public TLE/SGP4 orbital data where available, with a representative fallback catalog for offline/demo mode. For portfolio, education and situational awareness only — not for flight safety or operational conjunction assessment.',
    // dashboard metrics
    m_total: 'Total loaded',
    m_rendered: 'Rendered',
    m_leo: 'LEO',
    m_meo: 'MEO',
    m_geo: 'GEO',
    m_starlink: 'Starlink',
    m_region: 'In region',
    m_fresh: 'Data freshness',
    m_ai: 'AI agent',
    ai_ready: 'Ready',
    ai_thinking: 'Parsing…',
    // panels
    agent_title: 'Command Agent',
    agent_sub: 'Natural language → orbital actions',
    agent_placeholder: 'e.g. "Show satellites over Japan" or "GEO only"',
    agent_run: 'Run',
    agent_intent: 'Intent',
    agent_actions: 'Actions applied',
    agent_assumptions: 'Assumptions',
    agent_confidence: 'Confidence',
    agent_scope: 'In scope',
    sats_unit: 'satellites',
    try_label: 'Try',
    // catalog
    filters_title: 'Catalog',
    search_placeholder: 'Search by name or NORAD ID…',
    f_groups: 'Constellations',
    f_band: 'Orbital band',
    f_region: 'Region',
    f_all: 'All',
    f_reset: 'Reset filters',
    results: 'results',
    no_results: 'No satellites match.',
    // detail panel
    d_norad: 'NORAD ID',
    d_group: 'Category',
    d_band: 'Band',
    d_alt: 'Altitude',
    d_speed: 'Speed',
    d_lat: 'Latitude',
    d_lon: 'Longitude',
    d_region: 'Sub-point region',
    d_epoch: 'TLE epoch',
    d_age: 'Data age',
    d_vis: 'Status',
    d_source: 'Source',
    d_real: 'Public TLE (anchor)',
    d_synth: 'Representative TLE snapshot',
    d_relevance: 'AI relevance',
    d_class: 'Orbit class',
    vis_tracking: 'Tracking',
    track: 'Track orbit',
    untrack: 'Hide orbit',
    close: 'Close',
    days: 'd',
    hours: 'h',
    // brief
    brief_title: 'Executive Orbital Brief',
    brief_close: 'Close brief',
    brief_generated: 'Generated from the live propagated snapshot',
    autorotate: 'Auto-rotate',
    legend: 'Legend',
    // loading / error
    loading_elements: 'Acquiring orbital elements…',
    error_load: 'Failed to load satellite data. Using representative catalog.',
    // source mode labels
    source_live: 'Live CelesTrak data',
    source_cached: 'Cached CelesTrak data',
    source_fallback: 'Representative demo catalog',
    source_mixed: 'Mixed data sources',
  },

  es: {
    brand: 'OrbitIQ',
    brandSub: 'Centro de Mando',
    tagline: 'Operaciones satelitales e inteligencia orbital nativas de IA',
    status_online: 'OPERATIVO',
    status_loading: 'ADQUIRIENDO ELEMENTOS',
    prov_live: 'TLE PÚBLICO EN VIVO',
    prov_cached: 'TLE PÚBLICO EN CACHÉ',
    prov_demo: 'DEMO · REPRESENTATIVO',
    prov_live_note:
      'Elementos de dos líneas públicos en vivo de CelesTrak, propagados con SGP4.',
    prov_cached_note:
      'Instantánea TLE pública en caché (≤6 h), propagada con SGP4.',
    prov_demo_note:
      'Capas orbitales representativas + objetos ancla reales. TLE válidos, física SGP4 real — no es una instantánea en vivo de cada objeto.',
    provenance: 'Procedencia de datos',
    reset_view: 'Restablecer vista',
    disclaimer:
      'Usa datos orbitales TLE/SGP4 públicos reales donde estén disponibles, con un catálogo representativo de respaldo para modo sin conexión/demo. Solo para portafolio, educación y conciencia situacional — no apto para seguridad de vuelo ni evaluación de conjunciones.',
    m_total: 'Total cargados',
    m_rendered: 'Renderizados',
    m_leo: 'LEO',
    m_meo: 'MEO',
    m_geo: 'GEO',
    m_starlink: 'Starlink',
    m_region: 'En región',
    m_fresh: 'Frescura de datos',
    m_ai: 'Agente IA',
    ai_ready: 'Listo',
    ai_thinking: 'Analizando…',
    agent_title: 'Agente de Mando',
    agent_sub: 'Lenguaje natural → acciones orbitales',
    agent_placeholder: 'ej. "Satélites sobre Japón" o "Solo GEO"',
    agent_run: 'Ejecutar',
    agent_intent: 'Intención',
    agent_actions: 'Acciones aplicadas',
    agent_assumptions: 'Suposiciones',
    agent_confidence: 'Confianza',
    agent_scope: 'En alcance',
    sats_unit: 'satélites',
    try_label: 'Prueba',
    filters_title: 'Catálogo',
    search_placeholder: 'Buscar por nombre o ID NORAD…',
    f_groups: 'Constelaciones',
    f_band: 'Banda orbital',
    f_region: 'Región',
    f_all: 'Todas',
    f_reset: 'Restablecer filtros',
    results: 'resultados',
    no_results: 'Ningún satélite coincide.',
    d_norad: 'ID NORAD',
    d_group: 'Categoría',
    d_band: 'Banda',
    d_alt: 'Altitud',
    d_speed: 'Velocidad',
    d_lat: 'Latitud',
    d_lon: 'Longitud',
    d_region: 'Región subpunto',
    d_epoch: 'Época TLE',
    d_age: 'Antigüedad',
    d_vis: 'Estado',
    d_source: 'Fuente',
    d_real: 'TLE público (ancla)',
    d_synth: 'Muestra TLE representativa',
    d_relevance: 'Relevancia IA',
    d_class: 'Clase orbital',
    vis_tracking: 'Siguiendo',
    track: 'Trazar órbita',
    untrack: 'Ocultar órbita',
    close: 'Cerrar',
    days: 'd',
    hours: 'h',
    brief_title: 'Informe Orbital Ejecutivo',
    brief_close: 'Cerrar informe',
    brief_generated: 'Generado desde la muestra propagada en vivo',
    autorotate: 'Auto-rotación',
    legend: 'Leyenda',
    loading_elements: 'Adquiriendo elementos orbitales…',
    error_load: 'Error al cargar datos. Usando catálogo representativo.',
    source_live: 'Datos CelesTrak en vivo',
    source_cached: 'Datos CelesTrak en caché',
    source_fallback: 'Catálogo demo representativo',
    source_mixed: 'Fuentes de datos mixtas',
  },
};

let currentLang: LangKey = 'en';

export function t(key: string): string {
  return DICT[currentLang]?.[key] ?? DICT.en[key] ?? key;
}

export function setLang(lang: LangKey): void {
  if (lang in DICT) currentLang = lang;
}

export function getLang(): LangKey {
  return currentLang;
}

export { DICT };
