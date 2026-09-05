'use client';
// ── Risk DNA Radar Chart ─────────────────────────────────────────────────────
// A spider/radar chart showing all 5 signal dimensions simultaneously.
// Makes the "shape" of risk visible at a glance — no other fraud platform
// shows this. A transaction that's high on velocity + device but low on
// amount looks very different from one that's high on amount alone.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

const SIGNALS = [
  { key: 'amount_deviation',    label: 'Amount',    max: 25 },
  { key: 'velocity_anomaly',    label: 'Velocity',  max: 25 },
  { key: 'device_change',       label: 'Device',    max: 20 },
  { key: 'time_anomaly',        label: 'Time',      max: 15 },
  { key: 'behavioral_deviation',label: 'Behavior',  max: 15 },
];

const SIZE    = 200;
const CX      = SIZE / 2;
const CY      = SIZE / 2;
const RADIUS  = 72;
const LEVELS  = 4; // concentric rings

function polarToXY(angle: number, r: number) {
  // Start from top (−90°), go clockwise
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function signalAngle(i: number) {
  return (360 / SIGNALS.length) * i;
}

interface SignalInput {
  signal_type: string;
  contribution: number;
}

export function RiskDNA({ signals, score }: { signals: SignalInput[]; score: number }) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Map signal_type → normalised value (0–1)
  const valueMap = new Map(signals.map(s => [s.signal_type, s.contribution]));
  const values = SIGNALS.map(s => {
    const raw = valueMap.get(s.key) ?? 0;
    return Math.min(1, raw / s.max);
  });

  // Build polygon points for the data shape
  const dataPoints = values.map((v, i) => {
    const r = (animated ? v : 0) * RADIUS;
    return polarToXY(signalAngle(i), r);
  });
  const polyline = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Score colour
  const strokeColor =
    score > 80 ? '#ef4444' :
    score > 60 ? '#f97316' :
    score > 30 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Risk DNA
      </p>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-label="Risk signal radar chart"
        role="img"
      >
        {/* Concentric grid rings */}
        {Array.from({ length: LEVELS }).map((_, lvl) => {
          const r = (RADIUS / LEVELS) * (lvl + 1);
          const pts = SIGNALS.map((_, i) => polarToXY(signalAngle(i), r));
          const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <polygon
              key={lvl}
              points={poly}
              fill="none"
              stroke="#1e293b"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis spokes */}
        {SIGNALS.map((_, i) => {
          const end = polarToXY(signalAngle(i), RADIUS);
          return (
            <line
              key={i}
              x1={CX} y1={CY}
              x2={end.x} y2={end.y}
              stroke="#1e293b"
              strokeWidth="1"
            />
          );
        })}

        {/* Data polygon — animated fill */}
        <polygon
          points={polyline}
          fill={strokeColor}
          fillOpacity={0.15}
          stroke={strokeColor}
          strokeWidth="1.5"
          style={{ transition: 'all 0.6s ease-out' }}
        />

        {/* Data point dots */}
        {dataPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={3}
            fill={strokeColor}
            style={{ transition: 'all 0.6s ease-out', transitionDelay: `${i * 80}ms` }}
          />
        ))}

        {/* Axis labels */}
        {SIGNALS.map((sig, i) => {
          const angle = signalAngle(i);
          const labelR = RADIUS + 18;
          const pos = polarToXY(angle, labelR);
          const textAnchor =
            Math.abs(pos.x - CX) < 8 ? 'middle' :
            pos.x < CX ? 'end' : 'start';
          return (
            <text
              key={sig.key}
              x={pos.x} y={pos.y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize="9"
              fill="#64748b"
              fontFamily="inherit"
            >
              {sig.label}
            </text>
          );
        })}

        {/* Centre score label */}
        <text
          x={CX} y={CY - 6}
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill={strokeColor}
          fontFamily="inherit"
        >
          {score}
        </text>
        <text
          x={CX} y={CY + 8}
          textAnchor="middle"
          fontSize="8"
          fill="#475569"
          fontFamily="inherit"
        >
          /100
        </text>
      </svg>
      <p className="text-xs text-slate-600 mt-1 text-center max-w-[160px] leading-relaxed">
        Shape shows which signals dominate this risk profile
      </p>
    </div>
  );
}
