import type { EvaluationProfile, ResearchPlan, ResearchQuestion } from '../contracts/evaluation.ts';

const OBJECTIVES = {
  adoption: '¿Qué actividad permite probar e instrumentar el producto en un proyecto voluntario?',
  feedback: '¿Qué formato permite obtener feedback técnico sobre casos de uso y limitaciones?',
  hiring: '¿Qué actividad permite conversaciones con candidatos del perfil buscado y consentimiento para continuar?',
  awareness: '¿Qué exposición ante la audiencia buscada está documentada y cómo se distinguiría alcance de adopción?',
} as const;

// Determinístico y compartido con el preview. Produce preguntas, nunca
// afirmaciones sobre fuentes ni una promesa de resultados comerciales.
export function researchQuestions(profile: Pick<EvaluationProfile, 'product' | 'audience' | 'objective' | 'budget' | 'window' | 'restrictions' | 'comparableCompanies' | 'formats' | 'stack'>): ResearchQuestion[] {
  const questions: ResearchQuestion[] = [
    { id: 'fit', topic: 'fit', text: `¿Qué eventos de San Francisco conectan ${profile.product} con ${profile.audience.description}${profile.audience.profiles.length ? ` (${profile.audience.profiles.join(', ')})` : ''}?` },
    { id: 'objective', topic: 'objective', text: `${OBJECTIVES[profile.objective.kind]} Producto: ${profile.product}. Audiencia: ${profile.audience.description}. Objetivo ${profile.objective.confirmation === 'confirmed' ? 'declarado' : 'provisional'}.` },
    { id: 'eligibility', topic: 'eligibility', text: `¿Qué fechas, acceso y costo completo están publicados para ${profile.window.from ?? 'inicio pendiente'} a ${profile.window.to ?? 'fin pendiente'} (America/Los_Angeles)? Presupuesto comercial: ${profile.budget.status === 'declared' ? `${profile.budget.amount} ${profile.budget.currency}` : 'desconocido'}. Formatos: ${profile.formats?.join(', ') || 'por definir'}.` },
    { id: 'history', topic: 'history', text: `¿Qué proyectos y roles de organizadores o sponsors están documentados en ediciones anteriores${profile.stack.length ? ` vinculadas a ${profile.stack.join(', ')}` : ''}${profile.comparableCompanies.length ? `, incluidas referencias aportadas: ${profile.comparableCompanies.map(c => `${c.name} (${c.relation}, ${c.confirmation})`).join('; ')}` : ''}? Separar premio, herramienta declarada y eficacia.` },
  ];
  if (profile.objective.successDefinition.status === 'defined') questions.push({ id: 'success', topic: 'success', text: `¿Qué evidencia o condición permitiría evaluar el éxito declarado: ${profile.objective.successDefinition.text}?` });
  profile.restrictions.forEach((text, i) => questions.push({ id: `restriction-${i + 1}`, topic: 'restriction', text: `¿Qué fuente permite comprobar esta restricción antes de avanzar: ${text}?` }));
  return questions;
}

export function buildResearchPlan(profile: EvaluationProfile): ResearchPlan {
  return {
    contractVersion: '1', profileId: profile.id, profileVersion: profile.profileVersion,
    questions: researchQuestions(profile),
    // DP-04/05 habilitan proveedores con reserva del cupo agregado. Nunca
    // copiar USD 5.000 del comprador ni multiplicar los topes de la iniciativa.
    providerLimits: ['exa', 'apify'].map(provider => ({ provider, enabled: false, maxRequests: 0, maxCost: { amount: 0, currency: 'USD' }, scope: 'run' })),
  };
}
