import { ResponsiveContainer, BarChart, XAxis, Tooltip, Bar } from 'recharts';

interface AgentChartProps {
  data: Record<string, string | number>[];
  dataKey: string;
}

const TOOLTIP_CURSOR = { fill: 'rgba(255,255,255,0.05)' };
const TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '4px',
  fontSize: '12px',
};
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

export function AgentChart({ data, dataKey }: AgentChartProps) {
  return (
    <div className="agent-chart" role="img" aria-label={`Bar chart of ${dataKey} across ${data.length} categories`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="#60708c" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip cursor={TOOLTIP_CURSOR} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey={dataKey} fill="#3a8fe6" radius={BAR_RADIUS} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
