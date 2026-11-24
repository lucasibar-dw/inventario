import { useMemo, useState } from 'react';
import { type PositionView, STATUS_INFO, type OccupancyStatus, fmt } from '../lib/depotMetrics';
import { inputStyle, labelStyle, Pill } from './common';

interface Props {
    views: PositionView[];
    onOpen: (v: PositionView) => void;
}

/** Extrae el prefijo/pasillo del código (ej. "A-01-02" -> "A", "R1-05" -> "R1", "ENTRADA" -> "SISTEMA"). */
function groupPrefix(v: PositionView): string {
    if (v.isSystem) return 'SISTEMA';
    const code = (v.pos.codigo || '').trim();
    if (!code) return 'OTROS';
    const sepMatch = code.match(/^([A-Za-z0-9]+)[-_./\s]/);
    if (sepMatch) return sepMatch[1].toUpperCase();
    const alphaMatch = code.match(/^([A-Za-z]+)/);
    if (alphaMatch) return alphaMatch[1].toUpperCase();
    return code.slice(0, 2).toUpperCase();
}

export default function LayoutMapTab({ views, onOpen }: Props) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<OccupancyStatus | ''>('');

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = views.filter(v => {
            if (statusFilter && v.status !== statusFilter) return false;
            if (q && !(v.pos.codigo || '').toLowerCase().includes(q) &&
                !v.stats.lineas.some(l => l.codigo.toLowerCase().includes(q) || l.descripcion.toLowerCase().includes(q))) {
                return false;
            }
            return true;
        });

        const map = new Map<string, PositionView[]>();
        for (const v of filtered) {
            const g = groupPrefix(v);
            if (!map.has(g)) map.set(g, []);
            map.get(g)!.push(v);
        }
        return Array.from(map.entries())
            .map(([name, items]) => ({
                name,
                items: items.sort((a, b) => (a.pos.codigo || '').localeCompare(b.pos.codigo || '', 'es', { numeric: true })),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    }, [views, search, statusFilter]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--bg-primary, #0f1117)', padding: 12, borderRadius: 12, border: '1px solid var(--border-subtle, #1e2133)' }}>
                <div style={{ flex: '1 1 220px' }}>
                    <label style={labelStyle}>Resaltar / Filtrar posición o material</label>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ej: A-01 o algodón…" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill
                        color={statusFilter === '' ? '#6366f1' : '#64748b'}
                        onClick={() => setStatusFilter('')}
                    >
                        Todos ({views.length})
                    </Pill>
                    {(Object.keys(STATUS_INFO) as OccupancyStatus[]).map(st => {
                        const info = STATUS_INFO[st];
                        const cnt = views.filter(v => v.status === st).length;
                        if (cnt === 0) return null;
                        return (
                            <Pill
                                key={st}
                                color={info.color}
                                onClick={() => setStatusFilter(prev => prev === st ? '' : st)}
                                title={`Filtrar por ${info.label}`}
                            >
                                {statusFilter === st ? '● ' : ''}{info.label} ({cnt})
                            </Pill>
                        );
                    })}
                </div>
            </div>

            {groups.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No hay posiciones para mostrar con ese filtro.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {groups.map(group => {
                        const cap = group.items.reduce((a, v) => a + (v.pos.activo ? v.capacidadM3 : 0), 0);
                        const occ = group.items.reduce((a, v) => a + v.stats.volumenM3, 0);
                        const pct = cap > 0 ? (occ / cap) * 100 : null;
                        return (
                            <div key={group.name} style={{ background: 'var(--bg-primary, #0f1117)', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 12, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary, #f3f4f6)' }}>Sector / Rack {group.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{group.items.length} pos.</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {cap > 0 ? `${fmt(occ, 2)} / ${fmt(cap, 2)} m³ (${fmt(pct, 0)}%)` : 'Sin m³ definido'}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                                    {group.items.map(v => {
                                        const st = STATUS_INFO[v.status];
                                        return (
                                            <button
                                                key={v.pos.id}
                                                onClick={() => onOpen(v)}
                                                title={`${v.pos.codigo} · ${st.label}${v.ocupacionPct !== null ? ` (${fmt(v.ocupacionPct, 0)}%)` : ''} · ${fmt(v.stats.kilos, 0)} kg`}
                                                style={{
                                                    textAlign: 'left', padding: '8px 9px', borderRadius: 8, cursor: 'pointer',
                                                    background: `${st.color}18`, border: `1px solid ${st.color}66`,
                                                    color: 'var(--text-primary, #f3f4f6)', opacity: v.pos.activo ? 1 : 0.45,
                                                    transition: 'transform .12s, border-color .12s',
                                                }}
                                            >
                                                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {v.pos.codigo}
                                                </div>
                                                <div style={{ fontSize: 10, color: st.color, fontWeight: 600, marginTop: 2 }}>
                                                    {v.ocupacionPct !== null ? `${fmt(v.ocupacionPct, 0)}%` : st.label}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                                    {v.stats.kilos > 0 ? `${fmt(v.stats.kilos, 0)} kg` : 'Vacía'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
