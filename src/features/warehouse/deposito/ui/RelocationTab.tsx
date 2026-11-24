import { useMemo, useState } from 'react';
import { Btn } from '../../../../shared/ui';
import { useCreateTaskMutation } from '../../tasks/api/tasks.api';
import {
    type RelocationRecommendation,
    type RelocationMatchType,
    fmt,
} from '../lib/depotMetrics';
import { Pill, inputStyle, labelStyle, thStyle, tdStyle } from './common';

interface Props {
    recommendations: RelocationRecommendation[];
    onTaskCreated?: () => void;
    compact?: boolean;
}

const MATCH_STYLE: Record<RelocationMatchType, { label: string; color: string }> = {
    EXACT_ITEM: { label: 'Material ideal', color: '#f59e0b' },
    PRIMARY_CAT: { label: 'Cat. principal', color: '#6366f1' },
    SECONDARY_CAT: { label: 'Cat. secundaria', color: '#a855f7' },
};

export default function RelocationTab({ recommendations, onTaskCreated, compact = false }: Props) {
    const [createTask] = useCreateTaskMutation();
    const [search, setSearch] = useState('');
    const [matchFilter, setMatchFilter] = useState<'ALL' | RelocationMatchType>('ALL');
    const [onlyEmptyTarget, setOnlyEmptyTarget] = useState(false);
    const [hideScheduled, setHideScheduled] = useState(false);
    const [priority, setPriority] = useState<number>(2);
    const [estMinutes, setEstMinutes] = useState<string>('15');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
    const [createdIds, setCreatedIds] = useState<Set<string>>(new Set());
    const [feedback, setFeedback] = useState<string | null>(null);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return recommendations.filter(r => {
            const isScheduled = r.alreadyInTasks || createdIds.has(r.id);
            if (hideScheduled && isScheduled) return false;
            if (onlyEmptyTarget && !r.targetWasEmpty) return false;
            if (matchFilter !== 'ALL' && r.matchType !== matchFilter) return false;
            if (q &&
                !r.line.codigo.toLowerCase().includes(q) &&
                !r.line.descripcion.toLowerCase().includes(q) &&
                !r.line.categoria.toLowerCase().includes(q) &&
                !(r.source.pos.codigo || '').toLowerCase().includes(q) &&
                !(r.target.pos.codigo || '').toLowerCase().includes(q)) return false;
            return true;
        });
    }, [recommendations, search, matchFilter, onlyEmptyTarget, hideScheduled, createdIds]);

    const actionable = filtered.filter(r => !r.alreadyInTasks && !createdIds.has(r.id));
    const allSelected = actionable.length > 0 && actionable.every(r => selected.has(r.id));

    const toggleAll = () => setSelected(prev => {
        const next = new Set(prev);
        if (allSelected) actionable.forEach(r => next.delete(r.id));
        else actionable.forEach(r => next.add(r.id));
        return next;
    });

    const toggleOne = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const sendOne = async (r: RelocationRecommendation) => {
        setSendingIds(prev => new Set(prev).add(r.id));
        setFeedback(null);
        try {
            const mins = parseInt(estMinutes, 10);
            const lotPart = r.line.lote ? ` (Lote ${r.line.lote})` : '';
            await createTask({
                type: 'REPLENISHMENT',
                depositoId: r.depotId,
                title: `Reubicar ${r.line.codigo || r.line.descripcion}: ${r.source.pos.codigo} → ${r.target.pos.codigo}`,
                description: [
                    `Material: ${r.line.codigo ? `${r.line.codigo} - ` : ''}${r.line.descripcion}${lotPart}`,
                    `Cantidad: ${fmt(r.line.kilos, 1)} kg${r.line.unidades !== null ? ` (${fmt(r.line.unidades, 0)} u.)` : ''}`,
                    `Motivo origen: ${r.sourceReasonLabel}`,
                    `Destino ideal: ${r.target.pos.codigo} (${r.matchLabel}${r.targetWasEmpty ? ' · Posición vacía' : ''})`,
                ].join('\n'),
                itemId: r.line.itemId,
                batchId: r.batchId,
                sourcePositionId: r.source.pos.id,
                targetPositionId: r.target.pos.id,
                qty: r.line.kilos,
                priority,
                tiempoEstimadoMinutos: Number.isFinite(mins) && mins > 0 ? mins : 15,
                originSector: 'DEPOSITO',
            }).unwrap();

            setCreatedIds(prev => new Set(prev).add(r.id));
            setSelected(prev => {
                const next = new Set(prev);
                next.delete(r.id);
                return next;
            });
            onTaskCreated?.();
        } catch (e: any) {
            alert(e?.data?.message || 'No se pudo crear la tarea de reubicación');
        } finally {
            setSendingIds(prev => {
                const next = new Set(prev);
                next.delete(r.id);
                return next;
            });
        }
    };

    const sendSelected = async () => {
        const list = actionable.filter(r => selected.has(r.id));
        if (list.length === 0) return;
        let ok = 0;
        for (const r of list) {
            await sendOne(r);
            ok++;
        }
        setFeedback(`✔ Se enviaron ${ok} tarea${ok === 1 ? '' : 's'} de reubicación a la lista de Tareas.`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Detecta mercadería que no está en su ubicación ideal y sugiere moverla a posiciones vacías o con espacio reservadas para ese material o categoría. Al enviar una sugerencia se crea una tarea de <b>Reubicación</b> en <b>Tareas y Pedidos</b>.
            </div>

            {/* Filtros y configuración de tarea */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: compact ? '1fr 1fr' : 'minmax(180px, 2fr) repeat(3, minmax(130px, 1fr))',
                gap: 10,
                background: 'var(--bg-primary, #0f1117)',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--border-subtle, #1e2133)',
            }}>
                <div>
                    <label style={labelStyle}>Buscar material o posición</label>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ej: lycra, A-01…" style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle}>Tipo de coincidencia</label>
                    <select value={matchFilter} onChange={e => setMatchFilter(e.target.value as any)} style={inputStyle}>
                        <option value="ALL">Todas ({recommendations.length})</option>
                        <option value="EXACT_ITEM">⭐ Material ideal exacto</option>
                        <option value="PRIMARY_CAT">Categoría principal</option>
                        <option value="SECONDARY_CAT">Categoría secundaria</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Prioridad de la tarea</label>
                    <select value={priority} onChange={e => setPriority(Number(e.target.value))} style={inputStyle}>
                        <option value={1}>🔴 Alta (1)</option>
                        <option value={2}>🟡 Media (2)</option>
                        <option value={3}>🟢 Baja (3)</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Tiempo estimado (min)</label>
                    <input type="number" min={5} value={estMinutes} onChange={e => setEstMinutes(e.target.value)} style={inputStyle} />
                </div>
            </div>

            {/* Toggles + acciones masivas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={onlyEmptyTarget} onChange={e => setOnlyEmptyTarget(e.target.checked)} />
                        Solo destinos vacíos
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={hideScheduled} onChange={e => setHideScheduled(e.target.checked)} />
                        Ocultar ya en tareas
                    </label>
                    <span>Mostrando <b>{filtered.length}</b> sugerencia{filtered.length === 1 ? '' : 's'}</span>
                </div>

                {selected.size > 0 && (
                    <Btn small onClick={sendSelected} disabled={sendingIds.size > 0}>
                        ➕ Enviar {selected.size} seleccionada{selected.size === 1 ? '' : 's'} a Tareas
                    </Btn>
                )}
            </div>

            {feedback && (
                <div style={{ fontSize: 12, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                    {feedback}
                </div>
            )}

            {/* Tabla */}
            <div style={{ overflowX: 'auto', maxHeight: compact ? 420 : 560, overflowY: 'auto', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                        <tr>
                            <th style={{ ...thStyle, width: 32 }}>
                                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={actionable.length === 0} />
                            </th>
                            <th style={thStyle}>Material / Lote</th>
                            <th style={thStyle}>Cantidad</th>
                            <th style={thStyle}>Origen actual</th>
                            <th style={thStyle}>Destino ideal</th>
                            <th style={thStyle}>Coincidencia</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                    {recommendations.length === 0
                                        ? 'No hay reubicaciones recomendadas en este depósito. Asigná un material o categoría ideal a tus posiciones para activar sugerencias.'
                                        : 'No hay sugerencias que coincidan con esos filtros.'}
                                </td>
                            </tr>
                        ) : filtered.map(r => {
                            const isScheduled = r.alreadyInTasks || createdIds.has(r.id);
                            const isSending = sendingIds.has(r.id);
                            const mStyle = MATCH_STYLE[r.matchType];
                            return (
                                <tr
                                    key={r.id}
                                    style={{
                                        borderBottom: '1px solid var(--border-subtle, #1e2133)',
                                        opacity: isScheduled ? 0.65 : 1,
                                        background: selected.has(r.id) ? 'rgba(99,102,241,0.07)' : undefined,
                                    }}
                                >
                                    <td style={tdStyle}>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(r.id)}
                                            disabled={isScheduled}
                                            onChange={() => toggleOne(r.id)}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: 600 }}>{r.line.codigo || '—'}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.line.descripcion}</div>
                                        {r.line.lote && <div style={{ fontSize: 10, color: '#a5b4fc' }}>Lote: {r.line.lote}</div>}
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: 600 }}>{fmt(r.line.kilos, 1)} kg</div>
                                        {r.line.volumenConocido && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(r.line.volumenM3, 3)} m³</div>
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.source.pos.codigo}</div>
                                        <div style={{ fontSize: 11, color: r.sourceReason === 'inactiva' || r.sourceReason === 'conflicto' ? '#f59e0b' : 'var(--text-muted)' }}>
                                            {r.sourceReasonLabel}
                                        </div>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>→ {r.target.pos.codigo}</span>
                                            {r.targetWasEmpty && <Pill color="#10b981">Vacía</Pill>}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {r.target.capacidadM3 > 0
                                                ? `Libre: ${fmt(Math.max(0, r.target.capacidadM3 - r.target.stats.volumenM3), 2)} m³`
                                                : 'Sin límite de m³'}
                                        </div>
                                    </td>
                                    <td style={tdStyle}>
                                        <Pill color={mStyle.color}>{mStyle.label}</Pill>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.matchLabel}</div>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {isScheduled ? (
                                            <Pill color="#10b981">✔ Ya en Tareas</Pill>
                                        ) : (
                                            <Btn small onClick={() => sendOne(r)} disabled={isSending}>
                                                {isSending ? 'Enviando…' : '➕ Enviar a Tareas'}
                                            </Btn>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
