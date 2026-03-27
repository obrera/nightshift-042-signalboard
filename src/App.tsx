import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { loadFromStorage, saveToStorage } from './lib/storage';
import { scoreSentiment, scoreUrgency } from './lib/scoring';
import type { Headline, Preset, QueueItem, QueueStatus, SortKey, SortState } from './types';

const PRESET_KEY = 'signalboard-presets';
const QUEUE_KEY = 'signalboard-queue';
const DEFAULT_QUERY = 'cybersecurity';
const STATUS_OPTIONS: QueueStatus[] = ['Watch', 'Investigate', 'Briefed', 'Archived'];

type HNHit = {
  objectID: string;
  title: string | null;
  story_title: string | null;
  url: string | null;
  story_url: string | null;
  author: string;
  points: number | null;
  created_at: string;
};

function toHeadline(hit: HNHit): Headline | null {
  const title = (hit.title ?? hit.story_title ?? '').trim();

  if (!title) {
    return null;
  }

  const sentiment = scoreSentiment(title);
  const urgency = scoreUrgency(title);

  return {
    objectID: hit.objectID,
    title,
    url: hit.url ?? hit.story_url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    author: hit.author,
    points: hit.points ?? 0,
    createdAt: hit.created_at,
    source: 'HN / Algolia',
    sentiment: sentiment.score,
    urgency: urgency.score,
    sentimentLabel: sentiment.label,
    urgencyLabel: urgency.label,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function createPreset(name: string, query: string): Preset {
  return {
    id: crypto.randomUUID(),
    name,
    query,
    createdAt: new Date().toISOString(),
  };
}

function sortHeadlines(items: Headline[], sort: SortState) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const direction = sort.direction === 'asc' ? 1 : -1;

    if (sort.key === 'title') {
      return a.title.localeCompare(b.title) * direction;
    }

    if (sort.key === 'createdAt') {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
    }

    return ((a[sort.key] as number) - (b[sort.key] as number)) * direction;
  });
  return sorted;
}

function createQueueItem(headline: Headline): QueueItem {
  return {
    id: crypto.randomUUID(),
    objectID: headline.objectID,
    title: headline.title,
    url: headline.url,
    author: headline.author,
    createdAt: headline.createdAt,
    sentiment: headline.sentiment,
    urgency: headline.urgency,
    source: headline.source,
    note: '',
    status: headline.urgency >= 7 ? 'Investigate' : 'Watch',
    pinnedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<Preset[]>(() =>
    loadFromStorage<Preset[]>(PRESET_KEY, [
      createPreset('Cybersecurity', 'cybersecurity'),
      createPreset('AI policy', 'AI regulation'),
      createPreset('Cloud outages', 'cloud outage'),
    ]),
  );
  const [queue, setQueue] = useState<QueueItem[]>(() => loadFromStorage<QueueItem[]>(QUEUE_KEY, []));
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [sort, setSort] = useState<SortState>({ key: 'urgency', direction: 'desc' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveToStorage(PRESET_KEY, presets);
  }, [presets]);

  useEffect(() => {
    saveToStorage(QUEUE_KEY, queue);
  }, [queue]);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchFeed() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(
          `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=18`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Feed request failed with ${response.status}`);
        }

        const data = (await response.json()) as { hits: HNHit[] };
        setHeadlines(data.hits.map(toHeadline).filter((item): item is Headline => item !== null));
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Feed request failed');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void fetchFeed();

    return () => controller.abort();
  }, [query, refreshTick]);

  const sortedHeadlines = useMemo(() => sortHeadlines(headlines, sort), [headlines, sort]);

  const summary = useMemo(() => {
    const total = headlines.length;
    const averageSentiment = total ? headlines.reduce((sum, item) => sum + item.sentiment, 0) / total : 0;
    const averageUrgency = total ? headlines.reduce((sum, item) => sum + item.urgency, 0) / total : 0;
    const highUrgency = headlines.filter((item) => item.urgency >= 7).length;
    const negative = headlines.filter((item) => item.sentiment < 0).length;

    return {
      total,
      averageSentiment,
      averageUrgency,
      highUrgency,
      negative,
    };
  }, [headlines]);

  function handleSavePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = presetName.trim() || query.trim();

    if (!query.trim()) {
      return;
    }

    setPresets((current) => [createPreset(name, query.trim()), ...current.filter((item) => item.query !== query.trim())]);
    setPresetName('');
  }

  function handleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'title' ? 'asc' : 'desc' },
    );
  }

  function handlePin(headline: Headline) {
    setQueue((current) => {
      if (current.some((item) => item.objectID === headline.objectID)) {
        return current;
      }

      return [createQueueItem(headline), ...current];
    });
  }

  function updateQueueNote(id: string, note: string) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
  }

  function updateQueueStatus(id: string, status: QueueStatus) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
  }

  function removeQueueItem(id: string) {
    setQueue((current) => current.filter((item) => item.id !== id));
  }

  function exportQueue() {
    const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `signalboard-queue-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importQueue(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as QueueItem[];
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid queue payload');
        }

        setQueue(parsed);
      } catch {
        setError('Queue import failed: invalid JSON payload');
      } finally {
        event.target.value = '';
      }
    });
  }

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(101,229,255,0.2),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(255,107,147,0.14),_transparent_26%)]" />
      <div className="pointer-events-none absolute inset-0 bg-signal-grid bg-[size:34px_34px] opacity-20" />

      <main className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.35em] text-signal-cyan">Nightshift Build 042</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">SignalBoard</h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">
                Track topic signals, score the noise, and turn headlines into an actionable queue.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.25em] text-slate-400">Topic Query</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-3 text-sm text-white outline-none transition focus:border-signal-cyan"
                  placeholder="Search a topic"
                />
              </label>
              <button
                onClick={() => setRefreshTick((value) => value + 1)}
                className="rounded-2xl border border-signal-cyan/30 bg-signal-cyan/10 px-4 py-3 text-sm font-medium text-signal-cyan transition hover:bg-signal-cyan/20"
              >
                Refresh Feed
              </button>
              <a
                href="https://hn.algolia.com/api"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                API Source
              </a>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Presets</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{presets.length} saved</span>
            </div>

            <form className="mt-4 space-y-3" onSubmit={handleSavePreset}>
              <input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-ink-900 px-4 py-3 text-sm outline-none focus:border-signal-cyan"
                placeholder="Preset name"
              />
              <button className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-slate-200">
                Save Current Query
              </button>
            </form>

            <div className="mt-4 space-y-3">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setQuery(preset.query)}
                  className="w-full rounded-2xl border border-white/10 bg-ink-900/80 px-4 py-3 text-left transition hover:border-signal-cyan/40 hover:bg-ink-800"
                >
                  <div className="text-sm font-medium text-white">{preset.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{preset.query}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <SummaryCard label="Observed Headlines" value={String(summary.total)} accent="text-signal-cyan" detail="Current search result set" />
              <SummaryCard
                label="Avg Sentiment"
                value={summary.averageSentiment.toFixed(1)}
                accent={summary.averageSentiment >= 0 ? 'text-signal-mint' : 'text-signal-rose'}
                detail={summary.averageSentiment >= 0 ? 'Bias tilts constructive' : 'Risk pressure elevated'}
              />
              <SummaryCard
                label="Avg Urgency"
                value={summary.averageUrgency.toFixed(1)}
                accent={summary.averageUrgency >= 6 ? 'text-signal-amber' : 'text-signal-cyan'}
                detail={summary.averageUrgency >= 6 ? 'Faster follow-up recommended' : 'Moderate monitoring posture'}
              />
              <SummaryCard
                label="High-Urgency Hits"
                value={String(summary.highUrgency)}
                accent="text-signal-rose"
                detail={`${summary.negative} negative-leaning headlines detected`}
              />
            </div>

            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Signal Feed</h2>
                  <p className="text-sm text-slate-400">
                    Sorted by {sort.key} ({sort.direction})
                  </p>
                </div>
                {loading ? <span className="text-sm text-signal-cyan">Refreshing...</span> : null}
              </div>

              {error ? <div className="border-b border-white/10 bg-signal-rose/10 px-4 py-3 text-sm text-signal-rose">{error}</div> : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-white/5 text-slate-400">
                    <tr>
                      <TableHead label="Headline" onClick={() => handleSort('title')} />
                      <TableHead label="Published" onClick={() => handleSort('createdAt')} />
                      <TableHead label="Points" onClick={() => handleSort('points')} />
                      <TableHead label="Sentiment" onClick={() => handleSort('sentiment')} />
                      <TableHead label="Urgency" onClick={() => handleSort('urgency')} />
                      <th className="px-4 py-3 font-medium text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHeadlines.map((headline) => {
                      const alreadyPinned = queue.some((item) => item.objectID === headline.objectID);

                      return (
                        <tr key={headline.objectID} className="border-t border-white/10 align-top">
                          <td className="px-4 py-4">
                            <a href={headline.url} target="_blank" rel="noreferrer" className="font-medium text-white hover:text-signal-cyan">
                              {headline.title}
                            </a>
                            <div className="mt-2 text-xs text-slate-400">
                              {headline.source} · {headline.author}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-slate-300">{formatDate(headline.createdAt)}</td>
                          <td className="px-4 py-4 text-slate-300">{headline.points}</td>
                          <td className="px-4 py-4">
                            <ScorePill label={headline.sentimentLabel} value={headline.sentiment} type="sentiment" />
                          </td>
                          <td className="px-4 py-4">
                            <ScorePill label={headline.urgencyLabel} value={headline.urgency} type="urgency" />
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handlePin(headline)}
                              disabled={alreadyPinned}
                              className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-signal-cyan/40 hover:text-signal-cyan disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {alreadyPinned ? 'Pinned' : 'Pin'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Action Queue</h2>
                <p className="text-sm text-slate-400">Pinned headlines with notes and status tracking.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{queue.length} items</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={exportQueue}
                className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-2 text-sm text-white transition hover:border-signal-cyan/40"
              >
                Export JSON
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-2 text-sm text-white transition hover:border-signal-cyan/40"
              >
                Import JSON
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importQueue} />
            </div>

            <div className="mt-4 space-y-4">
              {queue.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
                  Pin items from the feed to start a follow-up queue.
                </div>
              ) : (
                queue.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-white/10 bg-ink-900/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-white hover:text-signal-cyan">
                        {item.title}
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                          U{item.urgency}
                        </span>
                        <button
                          onClick={() => removeQueueItem(item.id)}
                          className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400 transition hover:border-signal-rose/40 hover:text-signal-rose"
                        >
                          Drop
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      {item.author} · pinned {formatDate(item.pinnedAt)}
                    </div>
                    <div className="mt-3 grid gap-3">
                      <select
                        value={item.status}
                        onChange={(event) => updateQueueStatus(item.id, event.target.value as QueueStatus)}
                        className="rounded-xl border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white outline-none focus:border-signal-cyan"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={item.note}
                        onChange={(event) => updateQueueNote(item.id, event.target.value)}
                        className="min-h-24 rounded-xl border border-white/10 bg-ink-950 px-3 py-3 text-sm text-white outline-none focus:border-signal-cyan"
                        placeholder="Add operator notes, impact, or next step"
                      />
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className={`mt-4 text-3xl font-semibold ${accent}`}>{value}</p>
      <p className="mt-3 text-sm text-slate-400">{detail}</p>
    </article>
  );
}

function TableHead({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={onClick} className="inline-flex items-center gap-2 text-slate-300 transition hover:text-white">
        {label}
      </button>
    </th>
  );
}

function ScorePill({
  label,
  value,
  type,
}: {
  label: string;
  value: number;
  type: 'sentiment' | 'urgency';
}) {
  const className =
    type === 'sentiment'
      ? value > 1
        ? 'bg-signal-mint/15 text-signal-mint'
        : value < -1
          ? 'bg-signal-rose/15 text-signal-rose'
          : 'bg-white/10 text-slate-200'
      : value >= 7
        ? 'bg-signal-rose/15 text-signal-rose'
        : value >= 4
          ? 'bg-signal-amber/15 text-signal-amber'
          : 'bg-signal-cyan/15 text-signal-cyan';

  return <span className={`rounded-full px-3 py-2 text-xs font-semibold ${className}`}>{label} · {value}</span>;
}
