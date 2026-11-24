import { useState, useRef, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
    useGetItemsQuery,
    useGetItemCategoriesQuery,
    useCreateItemCategoryMutation,
    useUpdateItemCategoryMutation,
} from '../../features/warehouse/materiales/api/items.api';
import { useGetBoxTypesQuery } from '../../features/warehouse/materiales/api/box-types.api';
import { useGetStockQuery } from '../../features/warehouse/stock/api/stock.api';
import {
    useGetDepotsQuery,
    useCreateDepotMutation,
    useUpdateDepotMutation,
    useDeleteDepotMutation,
    useRestoreDepotMutation,
    useRenamePlantMutation,
    useTogglePlantStatusMutation,
} from '../../features/warehouse/deposito/api/deposito.api';
import { selectCurrentUser } from '../../entities/auth/model/authSlice';
import { PageHeader, Card, Btn, Input, Modal, Spinner } from '../../shared/ui';
import {
    computePositionStats,
    buildPositionView,
    summarizeDepot,
    fmt,
    type PositionView,
    type OccupancyStatus,
} from '../../features/warehouse/deposito/lib/depotMetrics';
import { Kpi, OccBar, Pill, TabBar, inputStyle, labelStyle, thStyle, tdStyle } from '../../features/warehouse/deposito/ui/common';
import PositionsTab from '../../features/warehouse/deposito/ui/PositionsTab';
import LayoutMapTab from '../../features/warehouse/deposito/ui/LayoutMapTab';
import AnalyticsTab from '../../features/warehouse/deposito/ui/AnalyticsTab';
import PositionDetailModal from '../../features/warehouse/deposito/ui/PositionDetailModal';
import BulkCreatePositionsModal from '../../features/warehouse/deposito/ui/BulkCreatePositionsModal';
import BulkEditPositionsModal from '../../features/warehouse/deposito/ui/BulkEditPositionsModal';

/* ─── Celda editable inline ─── */
function EditableCell({ value, onSave, label, type = 'text', disabled = false }: {
    value: string;
    onSave: (v: string) => Promise<void>;
    label?: string;
    type?: string;
    disabled?: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [saving, setSaving] = useState(false);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

    const commit = async () => {
        if (draft === value) { setEditing(false); return; }
        setSaving(true);
        try { await onSave(draft); setEditing(false); } catch { /* mantener abierto si falla */ }
        setSaving(false);
    };

    if (!editing || disabled) return (
        <div
            onClick={(e) => {
                if (disabled) return;
                e.stopPropagation();
                setDraft(value);
                setEditing(true);
            }}
            style={{ cursor: disabled ? 'default' : 'pointer', padding: '4px 0' }}
            className={disabled ? undefined : 'editable-trigger'}
            title={disabled ? undefined : 'Click para editar'}
        >
            {label && <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>}
            <div style={{ color: 'var(--text-primary, #f3f4f6)', fontWeight: 600 }}>{value || '—'}</div>
        </div>
    );

    return (
        <div style={{ padding: '4px 0' }} onClick={e => e.stopPropagation()}>
            {label && <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>}
            <input
                ref={ref}
                type={type}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                disabled={saving}
                style={{
                    width: '100%', background: 'var(--bg-primary, #0f1117)', border: '1px solid #6366f1',
                    borderRadius: '6px', padding: '5px 9px', color: 'var(--text-primary, #f3f4f6)',
                    fontSize: '13px', outline: 'none', boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.2)',
                    boxSizing: 'border-box',
                }}
            />
        </div>
    );
}

type DetailTab = 'positions' | 'map' | 'analytics' | 'categories';

export default function DepositoPage() {
    const user = useSelector(selectCurrentUser);
    const canEdit = user?.role?.toUpperCase() === 'ADMIN';
    const allowedDepots = user?.allowedDepotIds || user?.depots;

    // Datos principales
    const { data: rawDepots = [], isLoading: loadingDepots, refetch } = useGetDepotsQuery();
    const { data: stock = [], isFetching: loadingStock } = useGetStockQuery({});
    const { data: boxTypes = [] } = useGetBoxTypesQuery();
    const { data: items = [] } = useGetItemsQuery({});

    // Mutaciones
    const [createDepot, { isLoading: isSavingDepot }] = useCreateDepotMutation();
    const [updateDepot] = useUpdateDepotMutation();
    const [deleteDepot] = useDeleteDepotMutation();
    const [restoreDepot] = useRestoreDepotMutation();
    const [renamePlant, { isLoading: isRenamingPlant }] = useRenamePlantMutation();
    const [togglePlantStatus] = useTogglePlantStatusMutation();

    // Estado UI
    const [selectedDepotId, setSelectedDepotId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<DetailTab>('positions');
    const [positionsFilterSeed, setPositionsFilterSeed] = useState<{ status: OccupancyStatus | ''; nonce: number }>({ status: '', nonce: 0 });
    const [depotSearch, setDepotSearch] = useState('');
    const [plantFilter, setPlantFilter] = useState('');
    const [showInactiveDepots, setShowInactiveDepots] = useState(true);

    // Modales
    const [showNewDepot, setShowNewDepot] = useState(false);
    const [newDepotForm, setNewDepotForm] = useState({ nombre: '', planta: '' });
    const [showPlantsModal, setShowPlantsModal] = useState(false);
    const [plantDrafts, setPlantDrafts] = useState<Record<string, string>>({});
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryForm, setNewCategoryForm] = useState({ nombre: '', minimo: '', maximo: '' });
    const [detailPosId, setDetailPosId] = useState<string | null>(null);
    const [showBulkCreate, setShowBulkCreate] = useState(false);
    const [bulkEditViews, setBulkEditViews] = useState<PositionView[] | null>(null);

    // Categorías del depósito seleccionado
    const { data: categories = [], refetch: refetchCategories } = useGetItemCategoriesQuery(selectedDepotId || '', { skip: !selectedDepotId });
    const [createCategory, { isLoading: isCreatingCategory }] = useCreateItemCategoryMutation();
    const [updateItemCategory] = useUpdateItemCategoryMutation();

    // Lista de depósitos permitidos
    const depots = useMemo(() => {
        const arr = Array.isArray(rawDepots) ? rawDepots : [];
        return arr.filter((d: any) => !allowedDepots || allowedDepots.length === 0 || allowedDepots.includes(d.id));
    }, [rawDepots, allowedDepots]);

    // Categorías globales de materiales (para restricciones de posición)
    const itemCategories = useMemo(() =>
        [...new Set((Array.isArray(items) ? items : []).map((i: any) => i.category?.nombre || i.categoria))].filter(Boolean).sort() as string[],
        [items]);

    // Estadísticas por posición y resúmenes por depósito
    const statsMap = useMemo(() => computePositionStats(stock, boxTypes), [stock, boxTypes]);

    const { viewsByDepot, summaries } = useMemo(() => {
        const vMap = new Map<string, PositionView[]>();
        const sumList = depots.map((d: any) => {
            const views = (d.positions || []).map((p: any) => buildPositionView(p, statsMap));
            vMap.set(d.id, views);
            return summarizeDepot(d, views);
        });
        return { viewsByDepot: vMap, summaries: sumList };
    }, [depots, statsMap]);

    // Plantas detectadas
    const plants = useMemo(() => {
        const map = new Map<string, { name: string; total: number; activos: number }>();
        for (const d of depots) {
            const name = (d.planta || '').trim();
            if (!name) continue;
            if (!map.has(name)) map.set(name, { name, total: 0, activos: 0 });
            const p = map.get(name)!;
            p.total++;
            if (d.activo) p.activos++;
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [depots]);

    // Depósitos filtrados
    const filteredSummaries = useMemo(() => {
        const q = depotSearch.trim().toLowerCase();
        return summaries.filter(s => {
            if (!showInactiveDepots && !s.depot.activo) return false;
            if (plantFilter && (s.depot.planta || '') !== plantFilter) return false;
            if (q && !(s.depot.nombre || '').toLowerCase().includes(q) && !(s.depot.planta || '').toLowerCase().includes(q)) return false;
            return true;
        });
    }, [summaries, depotSearch, plantFilter, showInactiveDepots]);

    // KPIs globales (sobre todos los depósitos visibles para el usuario)
    const globalKpi = useMemo(() => {
        const activos = summaries.filter(s => s.depot.activo);
        const cap = activos.reduce((a, s) => a + s.capacidadM3, 0);
        const occ = summaries.reduce((a, s) => a + s.ocupadoM3, 0);
        return {
            depotsActivos: activos.length,
            depotsTotal: summaries.length,
            posActivas: summaries.reduce((a, s) => a + s.posActivas, 0),
            posTotal: summaries.reduce((a, s) => a + s.posTotal, 0),
            capacidadM3: cap,
            ocupadoM3: occ,
            ocupacionPct: cap > 0 ? (occ / cap) * 100 : null,
            kilos: summaries.reduce((a, s) => a + s.kilos, 0),
            alertas: summaries.reduce((a, s) => a + s.excedidas + s.inactivasConStock, 0),
        };
    }, [summaries]);

    const selectedSummary = useMemo(
        () => summaries.find(s => s.depot.id === selectedDepotId) || null,
        [summaries, selectedDepotId],
    );
    const selectedDepot = selectedSummary?.depot || null;
    const selectedViews = useMemo(
        () => (selectedDepotId ? viewsByDepot.get(selectedDepotId) || [] : []),
        [viewsByDepot, selectedDepotId],
    );
    const existingCodes = useMemo(
        () => new Set(selectedViews.map(v => String(v.pos.codigo || '').toUpperCase())),
        [selectedViews],
    );
    const activeDetailView = useMemo(
        () => (detailPosId ? selectedViews.find(v => v.pos.id === detailPosId) || null : null),
        [detailPosId, selectedViews],
    );

    useEffect(() => {
        setDetailTab('positions');
        setPositionsFilterSeed({ status: '', nonce: 0 });
    }, [selectedDepotId]);

    // Acciones
    const handleCreateDepot = async () => {
        if (!newDepotForm.nombre.trim()) return;
        try {
            const result = await createDepot({
                nombre: newDepotForm.nombre.trim(),
                planta: newDepotForm.planta.trim() || undefined,
            }).unwrap();
            setShowNewDepot(false);
            setNewDepotForm({ nombre: '', planta: '' });
            setSelectedDepotId(result.id);
            refetch();
        } catch (e: any) {
            alert(e?.data?.message || 'Error al crear depósito');
        }
    };

    const handleUpdateDepot = async (id: string, field: string, value: string) => {
        try {
            await updateDepot({ id, data: { [field]: value } }).unwrap();
            refetch();
        } catch (e: any) {
            alert(e?.data?.message || 'Error al actualizar depósito');
        }
    };

    const handleToggleDepotStatus = async (s: typeof summaries[number]) => {
        if (!canEdit) return;
        if (s.depot.activo && s.kilos > 0) {
            if (!window.confirm(`El depósito "${s.depot.nombre}" todavía tiene ${fmt(s.kilos)} kg de stock. ¿Desactivarlo igual?`)) return;
        }
        try {
            if (s.depot.activo) await deleteDepot(s.depot.id).unwrap();
            else await restoreDepot(s.depot.id).unwrap();
            refetch();
        } catch (e: any) {
            alert(e?.data?.message || 'No se pudo cambiar el estado del depósito');
        }
    };

    const handleCreateCategory = async () => {
        if (isCreatingCategory || !selectedDepotId || !newCategoryForm.nombre.trim()) return;
        try {
            await createCategory({
                nombre: newCategoryForm.nombre.trim(),
                depositoId: selectedDepotId,
                minimo: newCategoryForm.minimo ? parseFloat(newCategoryForm.minimo) : undefined,
                maximo: newCategoryForm.maximo ? parseFloat(newCategoryForm.maximo) : undefined,
            }).unwrap();
            setShowNewCategory(false);
            setNewCategoryForm({ nombre: '', minimo: '', maximo: '' });
            refetchCategories();
        } catch (e: any) {
            alert(e?.data?.message || 'Error al crear categoría');
        }
    };

    const handleJumpToStatus = (status: OccupancyStatus) => {
        setPositionsFilterSeed(prev => ({ status, nonce: prev.nonce + 1 }));
        setDetailTab('positions');
    };

    return (
        <div className="infra-container" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
            <style>{`
                .infra-container { font-family: 'Inter', sans-serif; }
                .depot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-bottom: 24px; }
                .depot-card {
                    border: 1px solid var(--border-subtle, #1e2133); background: var(--bg-secondary, #1a1d2e); border-radius: 12px; padding: 18px; cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); position: relative;
                }
                .depot-card:hover { border-color: var(--text-dimmed, #4b5563); transform: translateY(-2px); }
                .depot-card.selected { border-color: #6366f1; background: rgba(99, 102, 241, 0.06); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.22); }
                .depot-card.inactive { opacity: 0.62; }
                .pos-row:hover { background: rgba(99, 102, 241, 0.06); }
                .editable-trigger:hover { text-decoration: underline dotted var(--text-dimmed, #6b7280); }
            `}</style>

            <PageHeader
                title="Centro de Mando · Depósitos"
                subtitle="Infraestructura, posiciones, medidas y análisis de capacidad"
            >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canEdit && plants.length > 0 && (
                        <Btn small variant="secondary" onClick={() => {
                            const init: Record<string, string> = {};
                            plants.forEach(p => { init[p.name] = p.name; });
                            setPlantDrafts(init);
                            setShowPlantsModal(true);
                        }}>
                            🏭 Gestionar Plantas ({plants.length})
                        </Btn>
                    )}
                    {canEdit && <Btn small onClick={() => setShowNewDepot(true)}>+ Nuevo Depósito</Btn>}
                </div>
            </PageHeader>

            {!canEdit && (
                <div style={{
                    marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 12,
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)', color: '#a5b4fc',
                }}>
                    Modo solo lectura: podés analizar ocupación, medidas y contenido de todos tus depósitos. Para crear o modificar depósitos y posiciones se requiere rol <b>ADMIN</b>.
                </div>
            )}

            {loadingDepots ? (
                <div style={{ textAlign: 'center', padding: '48px' }}><Spinner /></div>
            ) : (
                <>
                    {/* KPIs Globales */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                        <Kpi
                            label="Depósitos activos"
                            value={`${globalKpi.depotsActivos} / ${globalKpi.depotsTotal}`}
                            sub={`${plants.length} planta${plants.length === 1 ? '' : 's'}`}
                        />
                        <Kpi
                            label="Posiciones activas"
                            value={`${fmt(globalKpi.posActivas, 0)} / ${fmt(globalKpi.posTotal, 0)}`}
                            sub="en todos los depósitos"
                        />
                        <Kpi
                            label="Capacidad ocupada"
                            value={globalKpi.ocupacionPct === null ? '—' : `${fmt(globalKpi.ocupacionPct, 1)}%`}
                            sub={`${fmt(globalKpi.ocupadoM3, 1)} / ${fmt(globalKpi.capacidadM3, 1)} m³${loadingStock ? ' · actualizando…' : ''}`}
                        />
                        <Kpi
                            label="Stock total"
                            value={`${fmt(globalKpi.kilos, 0)} kg`}
                            sub="distribuido en posiciones"
                        />
                        <Kpi
                            label="Alertas"
                            value={globalKpi.alertas}
                            color={globalKpi.alertas > 0 ? '#ef4444' : '#10b981'}
                            sub={globalKpi.alertas > 0 ? 'Excedidas o inactivas con stock' : 'Sin anomalías críticas'}
                        />
                    </div>

                    {/* Filtros de depósitos */}
                    <div style={{
                        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16,
                        background: 'var(--bg-secondary, #1a1d2e)', padding: '10px 14px', borderRadius: 12,
                        border: '1px solid var(--border-subtle, #1e2133)',
                    }}>
                        <input
                            value={depotSearch}
                            onChange={e => setDepotSearch(e.target.value)}
                            placeholder="Buscar depósito o planta…"
                            style={{ ...inputStyle, maxWidth: 260 }}
                        />
                        <select
                            value={plantFilter}
                            onChange={e => setPlantFilter(e.target.value)}
                            style={{ ...inputStyle, maxWidth: 220 }}
                        >
                            <option value="">Todas las plantas</option>
                            {plants.map(p => <option key={p.name} value={p.name}>{p.name} ({p.total})</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto' }}>
                            <input type="checkbox" checked={showInactiveDepots} onChange={e => setShowInactiveDepots(e.target.checked)} />
                            Mostrar inactivos
                        </label>
                    </div>

                    {/* Grilla de Depósitos */}
                    {filteredSummaries.length === 0 ? (
                        <Card style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)', marginBottom: 24 }}>
                            No se encontraron depósitos con esos filtros.
                        </Card>
                    ) : (
                        <div className="depot-grid">
                            {filteredSummaries.map(s => {
                                const d = s.depot;
                                const isSel = selectedDepotId === d.id;
                                return (
                                    <div
                                        key={d.id}
                                        className={`depot-card ${isSel ? 'selected' : ''} ${!d.activo ? 'inactive' : ''}`}
                                        onClick={() => setSelectedDepotId(isSel ? null : d.id)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <EditableCell
                                                    value={d.nombre}
                                                    onSave={v => handleUpdateDepot(d.id, 'nombre', v)}
                                                    label="Depósito"
                                                    disabled={!canEdit}
                                                />
                                            </div>
                                            <Pill
                                                color={d.activo ? '#10b981' : '#ef4444'}
                                                onClick={canEdit ? (e) => { e.stopPropagation(); handleToggleDepotStatus(s); } : undefined}
                                                title={canEdit ? (d.activo ? 'Click para desactivar' : 'Click para reactivar') : undefined}
                                            >
                                                {d.activo ? 'ACTIVO' : 'INACTIVO'}
                                            </Pill>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <EditableCell
                                                    value={d.planta || ''}
                                                    onSave={v => handleUpdateDepot(d.id, 'planta', v)}
                                                    label="Planta"
                                                    disabled={!canEdit}
                                                />
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>Posiciones</div>
                                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {s.posActivas}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>/{s.posTotal}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Ocupación del depósito */}
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                                <span>{fmt(s.ocupadoM3, 1)} / {fmt(s.capacidadM3, 1)} m³</span>
                                                <span>{fmt(s.kilos, 0)} kg</span>
                                            </div>
                                            <OccBar pct={s.ocupacionPct} height={7} />
                                        </div>

                                        {/* Badges de salud */}
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, minHeight: 22 }}>
                                            <Pill color="#64748b">{s.vacias} vacías</Pill>
                                            {s.excedidas > 0 && <Pill color="#ef4444">⚠ {s.excedidas} exced.</Pill>}
                                            {s.llenas > 0 && <Pill color="#f59e0b">{s.llenas} casi llenas</Pill>}
                                            {s.inactivasConStock > 0 && <Pill color="#f97316">{s.inactivasConStock} inact. c/stock</Pill>}
                                        </div>

                                        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-color, #2a2d3e)', paddingTop: 10 }}>
                                            <Btn small variant={isSel ? 'primary' : 'secondary'} style={{ flex: 1 }}>
                                                {isSel ? 'Ocultar panel' : 'Administrar depósito'}
                                            </Btn>
                                            {canEdit && (
                                                <Btn
                                                    small
                                                    variant={d.activo ? 'danger' : 'secondary'}
                                                    onClick={(e: any) => { e.stopPropagation(); handleToggleDepotStatus(s); }}
                                                    title={d.activo ? 'Desactivar depósito' : 'Reactivar depósito'}
                                                >
                                                    {d.activo ? '⏸' : '▶'}
                                                </Btn>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Panel de detalle del depósito seleccionado */}
                    {selectedDepot && selectedSummary && (
                        <Card style={{ padding: '22px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <h3 style={{ margin: 0, color: 'var(--text-primary, #f3f4f6)', fontSize: 18 }}>
                                            {selectedDepot.nombre}
                                        </h3>
                                        {selectedDepot.planta && <Pill color="#6366f1">{selectedDepot.planta}</Pill>}
                                        <Pill color={selectedDepot.activo ? '#10b981' : '#ef4444'}>
                                            {selectedDepot.activo ? 'ACTIVO' : 'INACTIVO'}
                                        </Pill>
                                    </div>
                                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted, #9ca3af)', fontSize: 12 }}>
                                        {fmt(selectedSummary.ocupadoM3, 2)} / {fmt(selectedSummary.capacidadM3, 2)} m³ ({selectedSummary.ocupacionPct === null ? '—' : `${fmt(selectedSummary.ocupacionPct, 1)}%`}) · {fmt(selectedSummary.kilos, 0)} kg · {selectedSummary.materiales} materiales
                                    </p>
                                </div>
                                {detailTab === 'categories' && canEdit && (
                                    <Btn small onClick={() => setShowNewCategory(true)}>+ Nueva Categoría</Btn>
                                )}
                            </div>

                            <TabBar<DetailTab>
                                value={detailTab}
                                onChange={setDetailTab}
                                tabs={[
                                    { id: 'positions', label: `📍 Posiciones (${selectedViews.length})` },
                                    { id: 'map', label: '🗺️ Mapa visual' },
                                    { id: 'analytics', label: '📊 Análisis y Capacidad' },
                                    { id: 'categories', label: `🏷️ Categorías (${categories.length})` },
                                ]}
                            />

                            {detailTab === 'positions' && (
                                <PositionsTab
                                    key={`${selectedDepot.id}-${positionsFilterSeed.nonce}`}
                                    depot={selectedDepot}
                                    views={selectedViews}
                                    itemCategories={itemCategories}
                                    canEdit={canEdit}
                                    initialStatus={positionsFilterSeed.status}
                                    onOpen={(v) => setDetailPosId(v.pos.id)}
                                    onAdd={() => setShowBulkCreate(true)}
                                    onBulkEdit={(views) => setBulkEditViews(views)}
                                />
                            )}

                            {detailTab === 'map' && (
                                <LayoutMapTab
                                    views={selectedViews}
                                    onOpen={(v) => setDetailPosId(v.pos.id)}
                                />
                            )}

                            {detailTab === 'analytics' && (
                                <AnalyticsTab
                                    summary={selectedSummary}
                                    views={selectedViews}
                                    onOpenPosition={(v) => setDetailPosId(v.pos.id)}
                                    onJumpToStatus={handleJumpToStatus}
                                />
                            )}

                            {detailTab === 'categories' && (
                                <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0 }}>
                                            <tr>
                                                {['Nombre Categoría', 'Stock Mínimo Alerta', 'Stock Máximo Alerta', 'Estado'].map(h => (
                                                    <th key={h} style={thStyle}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categories.length === 0 ? (
                                                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--text-dimmed)' }}>No hay categorías de materiales registradas en este depósito.</td></tr>
                                            ) : categories.map((cat: any) => (
                                                <tr key={cat.id} style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)', opacity: cat.activo ? 1 : 0.5 }}>
                                                    <td style={{ ...tdStyle, fontWeight: 600 }}>{cat.nombre}</td>
                                                    <td style={{ ...tdStyle, width: 180 }}>
                                                        <EditableCell
                                                            value={cat.minimo?.toString() || ''}
                                                            type="number"
                                                            disabled={!canEdit}
                                                            onSave={async (v) => {
                                                                await updateItemCategory({ id: cat.id, data: { minimo: v ? parseFloat(v) : null } }).unwrap();
                                                                refetchCategories();
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ ...tdStyle, width: 180 }}>
                                                        <EditableCell
                                                            value={cat.maximo?.toString() || ''}
                                                            type="number"
                                                            disabled={!canEdit}
                                                            onSave={async (v) => {
                                                                await updateItemCategory({ id: cat.id, data: { maximo: v ? parseFloat(v) : null } }).unwrap();
                                                                refetchCategories();
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <Pill
                                                            color={cat.activo ? '#10b981' : '#ef4444'}
                                                            onClick={canEdit ? async () => {
                                                                await updateItemCategory({ id: cat.id, data: { activo: !cat.activo } }).unwrap();
                                                                refetchCategories();
                                                            } : undefined}
                                                        >
                                                            {cat.activo ? 'ACTIVO' : 'INACTIVO'}
                                                        </Pill>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}

            {/* Modal: Detalle / Edición de Posición */}
            {activeDetailView && (
                <PositionDetailModal
                    view={activeDetailView}
                    itemCategories={itemCategories}
                    existingCodes={existingCodes}
                    canEdit={canEdit}
                    onClose={() => setDetailPosId(null)}
                />
            )}

            {/* Modal: Crear posiciones (individual / patrón / lista) */}
            {showBulkCreate && selectedDepot && (
                <BulkCreatePositionsModal
                    depot={selectedDepot}
                    itemCategories={itemCategories}
                    existingCodes={existingCodes}
                    onClose={() => setShowBulkCreate(false)}
                />
            )}

            {/* Modal: Edición masiva de posiciones */}
            {bulkEditViews && (
                <BulkEditPositionsModal
                    views={bulkEditViews}
                    itemCategories={itemCategories}
                    onClose={() => setBulkEditViews(null)}
                    onDone={() => refetch()}
                />
            )}

            {/* Modal: Nuevo Depósito */}
            {showNewDepot && (
                <Modal title="Nuevo Depósito" onClose={() => setShowNewDepot(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 13, margin: 0 }}>
                            Crea un nuevo depósito físico. Se generará automáticamente la posición del sistema <b>ENTRADA</b>.
                        </p>
                        <Input label="Nombre del Depósito" value={newDepotForm.nombre} onChange={v => setNewDepotForm(p => ({ ...p, nombre: v }))} placeholder="Ej: Depósito Principal" />
                        <div>
                            <label style={labelStyle}>Planta</label>
                            <input
                                list="plants-datalist"
                                value={newDepotForm.planta}
                                onChange={e => setNewDepotForm(p => ({ ...p, planta: e.target.value }))}
                                placeholder="Ej: Planta 1"
                                style={inputStyle}
                            />
                            <datalist id="plants-datalist">
                                {plants.map(p => <option key={p.name} value={p.name} />)}
                            </datalist>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-subtle, #1e2133)', paddingTop: 16 }}>
                            <Btn variant="secondary" onClick={() => setShowNewDepot(false)}>Cancelar</Btn>
                            <Btn onClick={handleCreateDepot} disabled={isSavingDepot || !newDepotForm.nombre.trim()}>
                                {isSavingDepot ? 'Guardando…' : 'Crear Depósito'}
                            </Btn>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal: Gestionar Plantas */}
            {showPlantsModal && (
                <Modal title="Gestionar Plantas" onClose={() => setShowPlantsModal(false)} wide>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                            Podés renombrar una planta o activar/desactivar todos sus depósitos de una sola vez.
                        </p>
                        {plants.map(p => {
                            const draft = plantDrafts[p.name] ?? p.name;
                            const allActive = p.activos === p.total;
                            return (
                                <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-primary, #0f1117)', padding: 10, borderRadius: 8, border: '1px solid var(--border-subtle, #1e2133)', flexWrap: 'wrap' }}>
                                    <input
                                        value={draft}
                                        onChange={e => setPlantDrafts(prev => ({ ...prev, [p.name]: e.target.value }))}
                                        style={{ ...inputStyle, flex: '1 1 200px' }}
                                    />
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.activos}/{p.total} activos</span>
                                    <Btn
                                        small
                                        variant="secondary"
                                        disabled={isRenamingPlant || !draft.trim() || draft.trim() === p.name}
                                        onClick={async () => {
                                            await renamePlant({ oldName: p.name, newName: draft.trim() }).unwrap();
                                            refetch();
                                        }}
                                    >
                                        Renombrar
                                    </Btn>
                                    <Btn
                                        small
                                        variant={allActive ? 'danger' : 'primary'}
                                        onClick={async () => {
                                            if (!window.confirm(`¿${allActive ? 'Desactivar' : 'Activar'} todos los depósitos de "${p.name}"?`)) return;
                                            await togglePlantStatus({ planta: p.name, activo: !allActive }).unwrap();
                                            refetch();
                                        }}
                                    >
                                        {allActive ? 'Desactivar planta' : 'Activar planta'}
                                    </Btn>
                                </div>
                            );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border-subtle, #1e2133)' }}>
                            <Btn variant="secondary" onClick={() => setShowPlantsModal(false)}>Cerrar</Btn>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal: Nueva Categoría */}
            {showNewCategory && (
                <Modal title="Nueva Categoría de Materiales" onClose={() => setShowNewCategory(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: 13, margin: 0 }}>
                            Crea una nueva categoría de material en este depósito.
                        </p>
                        <Input label="Nombre de Categoría" value={newCategoryForm.nombre} onChange={v => setNewCategoryForm(p => ({ ...p, nombre: v }))} placeholder="Ej: POLIESTER" />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Input label="Alerta Stock Mínimo" type="number" value={newCategoryForm.minimo} onChange={v => setNewCategoryForm(p => ({ ...p, minimo: v }))} placeholder="Ej: 100" />
                            <Input label="Alerta Stock Máximo" type="number" value={newCategoryForm.maximo} onChange={v => setNewCategoryForm(p => ({ ...p, maximo: v }))} placeholder="Ej: 500" />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-subtle, #1e2133)', paddingTop: 16 }}>
                            <Btn variant="secondary" onClick={() => setShowNewCategory(false)} disabled={isCreatingCategory}>Cancelar</Btn>
                            <Btn onClick={handleCreateCategory} disabled={isCreatingCategory || !newCategoryForm.nombre.trim()}>
                                {isCreatingCategory ? 'Creando…' : 'Crear Categoría'}
                            </Btn>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
