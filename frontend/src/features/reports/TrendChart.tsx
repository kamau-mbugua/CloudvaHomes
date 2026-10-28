import { useState } from 'react';
import { formatKES } from '../../lib/money';
import { formatPeriod } from '../../lib/periods';
import { columnPath, formatCompactKES, niceScale } from './rules';
import type { TrendPoint } from './types';

/**
 * Invoiced / collected / expenses for 12 months as grouped columns, drawn in plain SVG.
 * One y-axis (all three are KES). Hover or tap a month for its exact figures; the same
 * figures are in a table under the chart for screen readers and anyone who prefers one.
 *
 * Series colours are the dataviz reference palette's first three categorical slots
 * (validated as a set in light and dark), defined as --viz-1..3 in reports.css.
 */

const SERIES = [
  { key: 'invoiced', label: 'Invoiced', color: 'var(--viz-1)' },
  { key: 'collected', label: 'Collected', color: 'var(--viz-2)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--viz-3)' },
] as const;

const W = 720;
const H = 250;
const M = { top: 12, right: 8, bottom: 28, left: 68 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const GAP = 2;

function monthLabel(period: string, index: number): string {
  const text = formatPeriod(period);
  if (text === '—') return period;
  const [month, year] = text.split(' ');
  return index === 0 || period.endsWith('-01') ? `${month} ’${year.slice(2)}` : month;
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const count = Math.max(points.length, 1);
  const band = PLOT_W / count;
  const barW = Math.max(3, Math.min(16, (band - 14 - GAP * (SERIES.length - 1)) / SERIES.length));
  const groupW = barW * SERIES.length + GAP * (SERIES.length - 1);
  const peak = Math.max(0, ...points.flatMap((p) => SERIES.map((s) => p[s.key])));
  const scale = niceScale(peak);
  const y = (minor: number) => M.top + PLOT_H - (Math.max(0, minor) / scale.max) * PLOT_H;
  const first = points[0]?.period;
  const last = points.at(-1)?.period;
  const shown = active !== null ? points[active] : null;
  const tipLeft = active !== null ? Math.min(82, Math.max(18, ((M.left + band * (active + 0.5)) / W) * 100)) : 0;

  return (
    <figure className="rp__chart">
      <figcaption className="rp__charthead">
        <span className="ad__h2">Last 12 months</span>
        <ul className="rp__legend" aria-label="Series">
          {SERIES.map((s) => (
            <li key={s.key}><span className="rp__swatch" style={{ background: s.color }} aria-hidden="true" />{s.label}</li>
          ))}
        </ul>
      </figcaption>

      <div className="rp__chartscroll">
        <div className="rp__chartinner" onMouseLeave={() => setActive(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="rp__svg"
            role="img"
            aria-label={`Invoiced, collected and expenses per month, ${formatPeriod(first)} to ${formatPeriod(last)}. The figures are in the table below.`}
          >
            {scale.ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'rp__axis' : 'rp__grid'} />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="rp__tick">{formatCompactKES(t)}</text>
              </g>
            ))}

            {points.map((p, i) => {
              const x0 = M.left + band * i;
              return (
                <g key={p.period}>
                  {active === i ? <rect x={x0 + 2} y={M.top} width={band - 4} height={PLOT_H} rx={6} className="rp__hover" /> : null}
                  {SERIES.map((s, k) => {
                    const top = y(p[s.key]);
                    return (
                      <path key={s.key} d={columnPath(x0 + (band - groupW) / 2 + k * (barW + GAP), top, barW, M.top + PLOT_H - top)}
                        fill={s.color} />
                    );
                  })}
                  <text x={x0 + band / 2} y={H - 8} textAnchor="middle" className={`rp__tick ${active === i ? 'is-on' : ''}`}>
                    {monthLabel(p.period, i)}
                  </text>
                  {/* Hit area: the whole month column, bigger than the bars. */}
                  <rect x={x0} y={M.top} width={band} height={PLOT_H + M.bottom} fill="transparent"
                    onMouseEnter={() => setActive(i)} onClick={() => setActive(active === i ? null : i)} />
                </g>
              );
            })}
          </svg>

          {shown ? (
            <div className="rp__tip" style={{ left: `${tipLeft}%` }} aria-hidden="true">
              <strong>{formatPeriod(shown.period, true)}</strong>
              {SERIES.map((s) => (
                <span key={s.key} className="rp__tiprow">
                  <span className="rp__swatch" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <span className="num">{formatKES(shown[s.key])}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <details className="rp__tabledetails">
        <summary>Show the figures as a table</summary>
        <div className="ad__tablewrap">
          <table className="ad__table rp__table rp__table--compact">
            <caption className="nx-sr">Invoiced, collected and expenses per month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {SERIES.map((s) => <th key={s.key} scope="col" className="num">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.period}>
                  <th scope="row">{formatPeriod(p.period)}</th>
                  {SERIES.map((s) => <td key={s.key} className="num">{formatKES(p[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
