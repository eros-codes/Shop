import { formatToman } from '../lib/format';

// A column's caption. Days read as their number, with the Persian month
// underneath on the first column and wherever the month changes - thirty
// "۱۸ مهر"s side by side would not fit. Months read in full ("مهر ۱۴۰۵").
function caption(periods, index, granularity) {
  const { label, period } = periods[index];
  if (!label) return { main: period.slice(5) };
  if (granularity === 'month') return { main: label };
  const monthOf = (text) => text?.split(' ').slice(1).join(' ');
  const month = monthOf(label);
  return {
    main: label.split(' ')[0],
    sub: month !== monthOf(periods[index - 1]?.label) ? month : null,
  };
}

// Net sales per period, as the API's /reports/sales returns them: days are
// Tehran days, months are Persian months.
export default function SalesChart({ periods, granularity = 'day' }) {
  const peak = Math.max(1, ...periods.map((period) => period.net));
  return (
    <div className="chart">
      {periods.map((period, index) => {
        const { main, sub } = caption(periods, index, granularity);
        return (
          <div className="chart-col" key={period.period}>
            <div
              className="chart-bar"
              style={{ height: `${Math.max(4, (period.net / peak) * 100)}%` }}
              data-value={`${period.label ?? period.period}: ${formatToman(period.net)}`}
            />
            <span className="chart-label">
              {main}
              {sub ? <small>{sub}</small> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
