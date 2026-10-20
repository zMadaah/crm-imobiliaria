/**
 * Como a origem do lead aparece no painel. Função pura.
 * Anúncio cadastrado mostra o nome dado pelo dono; sem nome, o título da Meta ou o ID.
 */
export type OriginInput = {
  originSource: 'REF_CODE' | 'CTWA_AD' | 'UNKNOWN';
  originPost: string | null;
  originAdId: string | null;
  originRef: string | null;
  ad: { name: string | null; headline: string | null; propertyReference: string | null } | null;
};

export function originLabel(lead: OriginInput): string {
  if (lead.originSource === 'CTWA_AD') {
    const name = lead.ad?.name?.trim() || lead.ad?.headline?.trim();
    if (name) return `Anúncio: ${name}`;
    const id = lead.originAdId ?? lead.originPost?.replace(/^AD-/, '');
    return id ? `Anúncio ${id}` : 'Anúncio';
  }
  if (lead.originSource === 'REF_CODE' && lead.originPost) return `Post ${lead.originPost}`;
  return 'Origem não identificada';
}

/** Imóvel sugerido para visitas e fechamento: o código digitado, senão o do anúncio. */
export function suggestedPropertyReference(lead: OriginInput): string | null {
  return lead.originRef ?? lead.ad?.propertyReference ?? (lead.originSource === 'REF_CODE' ? lead.originPost : null);
}
