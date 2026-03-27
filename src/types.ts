export type Preset = {
  id: string;
  name: string;
  query: string;
  createdAt: string;
};

export type QueueStatus = 'Watch' | 'Investigate' | 'Briefed' | 'Archived';

export type QueueItem = {
  id: string;
  objectID: string;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  sentiment: number;
  urgency: number;
  source: string;
  note: string;
  status: QueueStatus;
  pinnedAt: string;
};

export type Headline = {
  objectID: string;
  title: string;
  url: string;
  author: string;
  points: number;
  createdAt: string;
  source: string;
  sentiment: number;
  urgency: number;
  sentimentLabel: 'Positive' | 'Neutral' | 'Negative';
  urgencyLabel: 'Low' | 'Moderate' | 'High';
};

export type SortKey = 'createdAt' | 'sentiment' | 'urgency' | 'points' | 'title';

export type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};
