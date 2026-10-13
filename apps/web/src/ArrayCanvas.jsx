import React from "react";
import { useEffect, useRef } from 'react';
export default function ArrayCanvas({ values, highlights = [], pointers = [] }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!values?.length) { ctx.fillStyle = '#64748b'; ctx.font = '16px sans-serif'; ctx.fillText('Keine Array-Daten vorhanden', 24, 70); return; }
    const gap = 12, margin = 26, cell = Math.min(76, (width - margin * 2 - gap * (values.length - 1)) / values.length);
    values.forEach((value, i) => {
      const x = margin + i * (cell + gap), y = 58;
      const marker = highlights.find(h => h.target?.indices?.includes(i) || (h.target?.range && i >= h.target.range[0] && i <= h.target.range[1]));
      const colors = { compare: '#fef08a', swap: '#fca5a5', active: '#93c5fd', sorted: '#86efac', range: '#c4b5fd', excluded: '#cbd5e1' };
      ctx.fillStyle = colors[marker?.style] || '#e2e8f0'; ctx.fillRect(x, y, cell, 72);
      ctx.strokeStyle = '#475569'; ctx.strokeRect(x, y, cell, 72);
      ctx.fillStyle = '#0f172a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(value), x + cell / 2, y + 43);
      ctx.fillStyle = '#64748b'; ctx.font = '13px sans-serif'; ctx.fillText(String(i), x + cell / 2, y + 94);
      const labels = pointers.filter(p => p.index === i).map(p => p.name).join(', ');
      if (labels) { ctx.fillStyle = '#1d4ed8'; ctx.fillText(labels, x + cell / 2, y - 12); }
    });
  }, [values, highlights, pointers]);
  return <canvas ref={ref} width={860} height={190} role="img" aria-label={`Array: ${values?.join(', ') ?? 'leer'}`} />;
}
