export type UserRole = 'OWNER' | 'BROKER';

export type User = { id: string; name: string; email: string; role: UserRole };

export type Temperature = 'HOT' | 'WARM' | 'COLD';

export type WeightAnswer = { answerKey: string; label: string; points: number; defaultPoints: number };

export type WeightGroup = { id: string; title: string; questionKey: string; answers: WeightAnswer[] };

export type WeightSettings = {
  thresholds: { hot: number; warm: number };
  maxScore: number;
  groups: WeightGroup[];
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  leadId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type LeadStage =
  | 'NEW'
  | 'QUALIFIED'
  | 'IN_SERVICE'
  | 'VISIT_SCHEDULED'
  | 'VISIT_DONE'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

export type LeadListItem = {
  id: string;
  name: string | null;
  phone: string;
  score: number;
  temperature: Temperature | null;
  stage: LeadStage;
  originPost: string | null;
  originSource: 'REF_CODE' | 'CTWA_AD' | 'UNKNOWN';
  originLabel: string;
  lastMessageAt: string | null;
  broker: { id: string; name: string } | null;
  lastMessage: { body: string | null; type: string; direction: 'INBOUND' | 'OUTBOUND'; sentAt: string } | null;
  unreadCount: number;
};

export type Message = {
  id: string;
  leadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  body: string | null;
  hasMedia: boolean;
  sentBy: { id: string; name: string } | null;
  sentAt: string;
};

export type LeadDetail = {
  id: string;
  name: string | null;
  phone: string;
  score: number;
  temperature: Temperature | null;
  stage: LeadStage;
  originPost: string | null;
  originSource: 'REF_CODE' | 'CTWA_AD' | 'UNKNOWN';
  originLabel: string;
  /** Imóvel sugerido: código digitado ou imóvel do anúncio */
  propertyReference: string | null;
  createdAt: string;
  broker: { id: string; name: string } | null;
  botStatus: 'ACTIVE' | 'COMPLETED' | 'HANDED_OFF' | 'DECLINED' | null;
  serviceWindow: { open: boolean; closesAt: string | null };
  answers: { questionKey: string; question: string; answer: string; points: number }[];
  stageHistory: { fromStage: LeadStage | null; toStage: LeadStage; changedBy: string | null; changedAt: string }[];
  visits: Visit[];
  actions: DealAction[];
  defaultDealKind: DealKind;
  deals: Deal[];
};

export type DealAction = 'START_NEGOTIATION' | 'WIN' | 'LOSE' | 'REOPEN' | 'UNDO_WIN';
export type DealKind = 'SALE' | 'RENT';
export type LossReason = 'PRICE' | 'FINANCING_DENIED' | 'BOUGHT_ELSEWHERE' | 'GAVE_UP' | 'NO_RESPONSE' | 'OTHER';

export type Deal = {
  id: string;
  result: 'WON' | 'LOST';
  kind: DealKind;
  value: string | null;
  lossReason: LossReason | null;
  lossReasonLabel: string | null;
  notes: string | null;
  propertyReference: string | null;
  broker: string | null;
  closedBy: string | null;
  closedAt: string;
  voidedAt: string | null;
};

export type Indicators = {
  period: { preset: string; from: string; to: string; start: string; end: string };
  temperature: { HOT: number; WARM: number; COLD: number; NONE: number };
  funnel: { leads: number; withVisit: number; visited: number; won: number };
  noShow: { done: number; noShow: number; rate: number | null };
  byBroker: { brokerId: string | null; brokerName: string | null; sales: number; salesValue: string; rentals: number; rentalsValue: string }[];
  totals: { sales: number; salesValue: string; rentals: number; rentalsValue: string };
  byOrigin: { origin: string; originSource: string; leads: number; won: number; salesValue: string; rentalsValue: string }[];
  lossReasons: { reason: LossReason; label: string; losses: number }[];
};

export type VisitStatus = 'SCHEDULED' | 'DONE' | 'NO_SHOW' | 'RESCHEDULED';

export type Visit = {
  id: string;
  scheduledAt: string;
  endsAt: string;
  status: VisitStatus;
  feedback: string | null;
  source: 'BOT' | 'PANEL';
  propertyReference: string | null;
  rescheduledFromId?: string | null;
  pending: boolean;
  lead?: { id: string; name: string | null; phone: string };
  broker: { id: string; name: string };
};

export type AdItem = {
  id: string;
  adId: string;
  headline: string | null;
  name: string | null;
  propertyReference: string | null;
  leads: number;
  won: number;
  createdAt: string;
};
