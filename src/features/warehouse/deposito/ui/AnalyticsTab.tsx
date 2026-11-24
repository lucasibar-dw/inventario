import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
    DepotSummary, PositionView, STATUS_INFO, OccupancyStatus, zonaLabel, zonaColor, fmt,
} from '../lib/depotMetrics';
import { Kpi, OccBar, Pill, SectionTitle, thStyle, tdStyle } from './common';

interface Props {
    summary: DepotSummary;
    views: PositionView[];
    onOpenPosition: (v: PositionView) => void;
    onJumpToStatus: (status: OccupancyStatus) => void;
}

export default function AnalyticsTab({ summary, views, onOpenPosition, onJumpToStatus }: Props) {
    const byZona = useMemo(() => {
        const map = new Map<string, { zona: string; label: string; color: string; total: number; activas: number; capM3: number; occM3: number; kilos: number }>();
        for (const v of views) {
            const key = (v.pos.categoria || 'STOCK').toUpperCase();
            if (!map.has(key)) {
                map.set(key, { zona: key, label: zonaLabel(key), color: zonaColor(key), total: 0, activas: 0, capM3: 0, occM3: 0, kilos: 0 });
            }
            const g = map.get(key)!;
            g.total++;
            if (v.pos.activo) {
                g.activas++;
                g.capM3 += v.capacidadM3;
            }
            g.occM3 += v.stats.volumenM3;
            g.kilos += v.stats.kilos;
        }
        return Array.from(map.values()).sort((a, b) => b.capM3 - a.capM3);
    }, [views]);

    const byCategoria = useMemo(() => {
        const map = new Map<string, { nombre: string; posiciones: number; capM3: number; occM3: number; kilos: number }>();
        for (const v of views) {
            if (!v.pos.activo) continue;
            const cats: string[] = [];
            if (v.pos.categoriaPrincipal) cats.push(v.pos.categoriaPrincipal);
            if (v.pos.categoriaSecundaria && v.pos.categoriaSecundaria !== v.pos.categoriaPrincipal) cats.push(v.pos.categoriaSecundaria);
            if (cats.length === 0) cats.push('Sin restricción (Libre)');
            for (const c of cats) {
                if (!map.has(c)) map.set(c, { nombre: c, posiciones: 0, capM3: 0, occM3: 0, kilos: 0 });
                const g = map.get(c)!;
                g.posiciones++;
                g.capM3 += v.capacidadM3;
                g.occM3 += v.stats.volumenM3;
                g.kilos += v.stats.kilos;
            }
        }
        return Array.from(map.values()).sort((a, b) => b.capM3 - a.capM3);
    }, [views]);

    const topOcupadas = useMemo(() =>
        views
            .filter(v => v.ocupacionPct !== null && v.ocupacionPct > 0)
            .sort((a, b) => (b.ocupacionPct ?? 0) - (a.ocupacionPct ?? 0))
            .slice(0, 8),
        [views]);

    const topKilos = useMemo(() =>
        views
            .filter(v => v.stats.kilos > 0)
            .sort((a, b) => b.stats.kilos - a.stats.kilos)
            .slice(0, 8),
        [views]);

    const alerts: { label: string; count: number; color: string; status?: OccupancyStatus; desc: string }[] = [
        { label: 'Posiciones excedidas (>100%)', count: summary.excedidas, color: '#ef4444', status: 'excedida', desc: 'Superan su capacidad de volumen o peso máximo.' },
        { label: 'Posiciones casi llenas (≥90%)', count: summary.llenas, color: '#f59e0b', status: 'llena', desc: 'Cerca del límite de capacidad.' },
        { label: 'Inactivas con stock', count: summary.inactivasConStock, color: '#f97316', status: 'inactiva', desc: 'Están desactivadas pero todavía registran mercadería.' },
        { label: 'Activas sin m³ cargado', count: summary.sinCapacidad, color: '#a855f7', status: 'sin_capacidad', desc: 'No tienen volumen definido para medir ocupación.' },
        { label: 'Líneas sin volumen calculable', count: summary.lineasSinVolumen, color: '#eab308', desc: 'Materiales sin tipo de caja o kilos por caja configurados.' },
    ].filter(a => a.count > 0);

    const statusCounts: { status: OccupancyStatus; count: number }[] = [
        { status: 'vacia', count: summary.vacias },
        { status: 'ocupada', count: summary.ocupadas },
        { status: 'llena', count: summary.llenas },
        { status: 'excedida', count: summary.excedidas },
        { status: 'sin_capacidad', count: views.filter(v => v.status === 'sin_capacidad').length },
        { status: 'inactiva', count: summary.posInactivas },
    ];

    const chartData = byZona.map(z => ({
        name: z.label,
        'Capacidad (m³)': Number(z.capM3.toFixed(2)),
        'Ocupado (m³)': Number(z.occM3.toFixed(2)),
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPIs del depósito */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <Kpi
                    label="Ocupación volumétrica"
                    value={summary.ocupacionPct === null ? '—' : `${fmt(summary.ocupacionPct, 1)}%`}
                    sub={`${fmt(summary.ocupadoM3, 2)} / ${fmt(summary.capacidadM3, 2)} m³`}
                />
                <Kpi
                    label="Espacio libre"
                    value={`${fmt(Math.max(summary.capacidadM3 - summary.ocupadoM3, 0), 2)} m³`}
                    sub={`${summary.vacias} posiciones vacías`}
                    color="#10b981"
                />
                <Kpi
                    label="Peso almacenado"
                    value={`${fmt(summary.kilos, 0)} kg`}
                    sub={`${summary.materiales} materiales · ${summary.lotes} lotes`}
                />
                <Kpi
                    label="Posiciones activas"
                    value={`${summary.posActivas} / ${summary.posTotal}`}
                    sub={summary.posInactivas > 0 ? `${summary.posInactivas} inactivas` : 'Todas activas'}
                />
            </div>

            {/* Distribución por estado */}
            <div>
                <SectionTitle right={<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hacé click en un estado para filtrarlo en Posiciones</span>}>
                    Distribución de posiciones
                </SectionTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {statusCounts.map(({ status, count }) => {
                        const info = STATUS_INFO[status];
                        return (
                            <button
                                key={status}
                                onClick={() => onJumpToStatus(status)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                                    background: 'var(--bg-primary, #0f1117)', border: `1px solid ${info.color}44`,
                                    borderRadius: 10, cursor: 'pointer', color: 'var(--text-primary, #f3f4f6)',
                                }}
                            >
                                <span style={{ width: 9, height: 9, borderRadius: '50%', background: info.color }} />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{info.label}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: info.color }}>{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Diagnóstico y Alertas */}
            {alerts.length > 0 && (
                <div>
                    <SectionTitle>Alertas y diagnóstico</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                        {alerts.map((a, i) => (
                            <div
                                key={i}
                                onClick={() => a.status && onJumpToStatus(a.status)}
                                style={{
                                    background: `${a.color}12`, border: `1px solid ${a.color}44`,
                                    borderRadius: 10, padding: '12px 14px',
                                    cursor: a.status ? 'pointer' : 'default',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: a.color }}>{a.label}</span>
                                    <Pill color={a.color}>{a.count}</Pill>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Gráfico Capacidad vs Ocupado por Zona */}
            {chartData.length > 0 && (
                <div>
                    <SectionTitle>Capacidad vs. Ocupado por Zona (m³)</SectionTitle>
                    <div style={{ background: 'var(--bg-primary, #0f1117)', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 12, padding: 16, height: 270 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: 8, fontSize: 12 }}
                                    labelStyle={{ color: '#f3f4f6', fontWeight: 600 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="Capacidad (m³)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Ocupado (m³)" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Desglose por Zona y por Categoría */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
                <div>
                    <SectionTitle>Desglose por Zona</SectionTitle>
                    <div style={{ border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Zona', 'Pos.', 'Cap. m³', 'Ocupado', 'Kg'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {byZona.map(z => (
                                    <tr key={z.zona} style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)' }}>
                                        <td style={tdStyle}><Pill color={z.color}>{z.label}</Pill></td>
                                        <td style={tdStyle}>{z.activas}/{z.total}</td>
                                        <td style={tdStyle}>{fmt(z.capM3, 2)}</td>
                                        <td style={{ ...tdStyle, minWidth: 120 }}><OccBar pct={z.capM3 > 0 ? (z.occM3 / z.capM3) * 100 : null} /></td>
                                        <td style={tdStyle}>{fmt(z.kilos, 0)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <SectionTitle>Capacidad por Restricción de Material</SectionTitle>
                    <div style={{ border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0 }}>
                                <tr>{['Categoría', 'Pos.', 'Cap. m³', 'Ocupación'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {byCategoria.map(c => (
                                    <tr key={c.nombre} style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)' }}>
                                        <td style={{ ...tdStyle, fontWeight: 500 }}>{c.nombre}</td>
                                        <td style={tdStyle}>{c.posiciones}</td>
                                        <td style={tdStyle}>{fmt(c.capM3, 2)}</td>
                                        <td style={{ ...tdStyle, minWidth: 120 }}><OccBar pct={c.capM3 > 0 ? (c.occM3 / c.capM3) * 100 : null} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Rankings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                <div>
                    <SectionTitle>Posiciones con mayor ocupación</SectionTitle>
                    <div style={{ border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10, overflow: 'hidden' }}>
                        {topOcupadas.length === 0 ? (
                            <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Sin datos de ocupación volumétrica.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Posición', 'm³', 'Ocupación'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {topOcupadas.map(v => (
                                        <tr key={v.pos.id} onClick={() => onOpenPosition(v)} className="pos-row" style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)', cursor: 'pointer' }}>
                                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{v.pos.codigo}</td>
                                            <td style={tdStyle}>{fmt(v.stats.volumenM3, 2)} / {fmt(v.capacidadM3, 2)}</td>
                                            <td style={{ ...tdStyle, minWidth: 130 }}><OccBar pct={v.ocupacionPct} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div>
                    <SectionTitle>Posiciones con más kilos</SectionTitle>
                    <div style={{ border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10, overflow: 'hidden' }}>
                        {topKilos.length === 0 ? (
                            <div style={{ padding: 20, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No hay stock registrado en este depósito.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Posición', 'Kilos', 'Materiales / Lotes'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {topKilos.map(v => (
                                        <tr key={v.pos.id} onClick={() => onOpenPosition(v)} className="pos-row" style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)', cursor: 'pointer' }}>
                                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600 }}>{v.pos.codigo}</td>
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(v.stats.kilos, 1)} kg</td>
                                            <td style={tdStyle}>{v.stats.materiales} mat · {v.stats.lotes} lote{v.stats.lotes === 1 ? '' : 's'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
