import { useMemo, useState, useDeferredValue } from 'react';
import { Btn } from '../../../../shared/ui';
import { PositionView, STATUS_INFO, OccupancyStatus, ZONAS, zonaLabel, zonaColor, fmt, downloadCsv } from '../lib/depotMetrics';
import { OccBar, Pill, inputStyle, labelStyle, thStyle, tdStyle } from './common';

interface Props {
    depot: any;
    views: PositionView[];
    itemCategories: string[];
    canEdit: boolean;
    onOpen: (v: PositionView) => void;
    onAdd: () => void;
    onBulkEdit: (views: PositionView[]) => void;
    initialStatus?: OccupancyStatus | '';
}

type SortKey = 'codigo' | 'ocupacion' | 'kilos' | 'capacidad';
const PAGE = 200;

export default function PositionsTab({ depot, views, itemCategories, canEdit, onOpen, onAdd, onBulkEdit, initialStatus = '' }: Props) {
    const [search, setSearch] = useState('');
    const [zona, setZona] = useState('');
    const [cat, setCat] = useState('');
    const [status, setStatus] = useState<OccupancyStatus | ''>(initialStatus);
    const [activo, setActivo] = useState<'all' | 'on' | 'off'>('all');
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'codigo', dir: 1 });
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [limit, setLimit] = useState(PAGE);
    const dSearch = useDeferredValue(search);

    const zonasPresentes = useMemo(() => {
        const s = new Set(views.map(v => (v.pos.categoria || '').toUpperCase()));
        return ZONAS.filter(z => s.has(z.value));
    }, [views]);

    const filtered = useMemo(() => {
        const q = dSearch.trim().toLowerCase();
        const list = views.filter(v => {
            if (q && !(v.pos.codigo || '').toLowerCase().includes(q) &&
                !v.stats.lineas.some(l => l.codigo.toLowerCase().includes(q) || l.descripcion.toLowerCase().includes(q))) return false;
            if (zona && (v.pos.categoria || '').toUpperCase() !== zona) return false;
            if (cat && v.pos.categoriaPrincipal !== cat && v.pos.categoriaSecundaria !== cat) return false;
            if (status && v.status !== status) return false;
            if (activo === 'on' && !v.pos.activo) return false;
            if (activo === 'off' && v.pos.activo) return false;
            return true;
        });
        const val = (v: PositionView): number | string => {
            switch (sort.key) {
                case 'ocupacion': return v.ocupacionPct ?? -1;
                case 'kilos': return v.stats.kilos;
                case 'capacidad': return v.capacidadM3;
                default: return (v.pos.codigo || '').toString();
            }
        };
        return list.sort((a, b) => {
            const x = val(a), y = val(b);
            if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'es', { numeric: true }) * sort.dir;
            return ((x as number) - (y as number)) * sort.dir;
        });
    }, [views, dSearch, zona, cat, status, activo, sort]);

    const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'codigo' ? 1 : -1 }));
    const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

    const allVisibleSelected = filtered.length > 0 && filtered.every(v => selected.has(v.pos.id));
    const toggleAll = () => setSelected(prev => {
        const next = new Set(prev);
        if (allVisibleSelected) filtered.forEach(v => next.delete(v.pos.id));
        else filtered.forEach(v => next.add(v.pos.id));
        return next;
    });
    const toggleOne = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const selectedViews = views.filter(v => selected.has(v.pos.id));

    const clearFilters = () => { setSearch(''); setZona(''); setCat(''); setStatus(''); setActivo('all'); };

    const exportCsv = () => downloadCsv(`posiciones_${depot.nombre}.csv`, filtered.map(v => ({
        Deposito: depot.nombre,
        Codigo: v.pos.codigo,
        Zona: zonaLabel(v.pos.categoria),
        Restriccion_principal: v.pos.categoriaPrincipal || '',
        Restriccion_secundaria: v.pos.categoriaSecundaria || '',
        Alto_m: v.meta.altoM ?? '',
        Ancho_m: v.meta.anchoM ?? '',
        Profundidad_m: v.meta.profundidadM ?? '',
        Capacidad_m3: v.capacidadM3 || '',
        Ocupado_m3: v.stats.volumenM3.toFixed(3),
        Ocupacion_pct: v.ocupacionPct === null ? '' : v.ocupacionPct.toFixed(1),
        Peso_max_kg: v.meta.maxKg ?? '',
        Kilos: v.stats.kilos.toFixed(2),
        Materiales: v.stats.materiales,
        Lotes: v.stats.lotes,
        Estado: STATUS_INFO[v.status].label,
        Activa: v.pos.activo ? 'SI' : 'NO',
        Notas: v.meta.notas || '',
    })));

    return (
        <div>
            {/* Filtros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) repeat(4, minmax(130px,1fr))', gap: 10, marginBottom: 12, background: 'var(--bg-primary, #0f1117)', padding: 12, borderRadius: 12, border: '1px solid var(--border-subtle, #1e2133)' }}>
                <div>
                    <label style={labelStyle}>Buscar código o material</label>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ej: A-01 o poliéster…" style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle}>Zona</label>
                    <select value={zona} onChange={e => setZona(e.target.value)} style={inputStyle}>
                        <option value="">Todas</option>
                        {zonasPresentes.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Restricción material</label>
                    <select value={cat} onChange={e => setCat(e.target.value)} style={inputStyle}>
                        <option value="">Todas</option>
                        {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Ocupación</label>
                    <select value={status} onChange={e => setStatus(e.target.value as any)} style={inputStyle}>
                        <option value="">Todas</option>
                        {(Object.keys(STATUS_INFO) as OccupancyStatus[]).map(s => <option key={s} value={s}>{STATUS_INFO[s].label}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Activa</label>
                    <select value={activo} onChange={e => setActivo(e.target.value as any)} style={inputStyle}>
                        <option value="all">Todas</option>
                        <option value="on">Solo activas</option>
                        <option value="off">Solo inactivas</option>
                    </select>
                </div>
            </div>

            {/* Barra de acciones */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {filtered.length} de {views.length} posiciones
                    {selected.size > 0 && <> · <b style={{ color: '#a5b4fc' }}>{selected.size} seleccionadas</b></>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canEdit && selected.size > 0 && (
                        <>
                            <Btn small onClick={() => onBulkEdit(selectedViews)}>✎ Editar {selected.size} seleccionadas</Btn>
                            <Btn small variant="secondary" onClick={() => setSelected(new Set())}>Quitar selección</Btn>
                        </>
                    )}
                    <Btn small variant="secondary" onClick={clearFilters}>Limpiar filtros</Btn>
                    <Btn small variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>⬇ Exportar CSV</Btn>
                    {canEdit && <Btn small onClick={onAdd}>+ Agregar posiciones</Btn>}
                </div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 620, overflowY: 'auto', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                        <tr>
                            {canEdit && <th style={{ ...thStyle, width: 32 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>}
                            <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('codigo')}>Código{sortMark('codigo')}</th>
                            <th style={thStyle}>Zona</th>
                            <th style={thStyle}>Restricción</th>
                            <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('capacidad')}>Capacidad{sortMark('capacidad')}</th>
                            <th style={{ ...thStyle, cursor: 'pointer', minWidth: 160 }} onClick={() => toggleSort('ocupacion')}>Ocupación{sortMark('ocupacion')}</th>
                            <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => toggleSort('kilos')}>Kg{sortMark('kilos')}</th>
                            <th style={thStyle}>Contenido</th>
                            <th style={thStyle}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-dimmed, #4b5563)' }}>No hay posiciones con esos filtros.</td></tr>
                        ) : filtered.slice(0, limit).map(v => {
                            const st = STATUS_INFO[v.status];
                            const dims = v.meta.altoM && v.meta.anchoM && v.meta.profundidadM
                                ? `${fmt(v.meta.altoM, 2)}×${fmt(v.meta.anchoM, 2)}×${fmt(v.meta.profundidadM, 2)} m` : null;
                            return (
                                <tr
                                    key={v.pos.id}
                                    onClick={() => onOpen(v)}
                                    className="pos-row"
                                    style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)', opacity: v.pos.activo ? 1 : 0.55, cursor: 'pointer', background: selected.has(v.pos.id) ? 'rgba(99,102,241,0.07)' : undefined }}
                                >
                                    {canEdit && (
                                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selected.has(v.pos.id)} onChange={() => toggleOne(v.pos.id)} />
                                        </td>
                                    )}
                                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'monospace' }}>
                                        {v.pos.codigo}
                                        {v.isSystem && <span style={{ marginLeft: 6 }}><Pill color="#06b6d4">SIS</Pill></span>}
                                        {v.meta.notas && <span title={v.meta.notas} style={{ marginLeft: 6 }}>📝</span>}
                                    </td>
                                    <td style={tdStyle}><Pill color={zonaColor(v.pos.categoria)}>{zonaLabel(v.pos.categoria)}</Pill></td>
                                    <td style={tdStyle}>
                                        {v.pos.categoriaPrincipal || v.pos.categoriaSecundaria ? (
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {v.pos.categoriaPrincipal && <Pill color="#818cf8">{v.pos.categoriaPrincipal}</Pill>}
                                                {v.pos.categoriaSecundaria && <Pill color="#c084fc">{v.pos.categoriaSecundaria}</Pill>}
                                            </div>
                                        ) : <span style={{ color: 'var(--text-dimmed)', fontSize: 12 }}>Libre</span>}
                                    </td>
                                    <td style={tdStyle}>
                                        <div>{v.capacidadM3 > 0 ? `${fmt(v.capacidadM3, 3)} m³` : <span style={{ color: '#a855f7', fontSize: 12 }}>sin cargar</span>}</div>
                                        {dims && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dims}</div>}
                                    </td>
                                    <td style={tdStyle}>
                                        <OccBar pct={v.ocupacionPct} />
                                        {v.pesoPct !== null && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Peso: {fmt(v.pesoPct, 0)}%</div>}
                                    </td>
                                    <td style={tdStyle}>{v.stats.kilos > 0 ? fmt(v.stats.kilos) : '—'}</td>
                                    <td style={tdStyle}>
                                        {v.stats.lineas.length === 0 ? <span style={{ color: 'var(--text-dimmed)' }}>—</span> : (
                                            <span style={{ fontSize: 12 }}>
                                                {v.stats.materiales} mat · {v.stats.lotes} lote{v.stats.lotes === 1 ? '' : 's'}
                                                {v.stats.volumenIncompleto && <span title="Hay material sin volumen calculable" style={{ color: '#f59e0b', marginLeft: 4 }}>⚠</span>}
                                            </span>
                                        )}
                                    </td>
                                    <td style={tdStyle}><Pill color={st.color}>{st.label}</Pill></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {filtered.length > limit && (
                    <div style={{ textAlign: 'center', padding: 12 }}>
                        <Btn small variant="secondary" onClick={() => setLimit(l => l + PAGE)}>Mostrar {Math.min(PAGE, filtered.length - limit)} más ({filtered.length - limit} restantes)</Btn>
                    </div>
                )}
            </div>
        </div>
    );
}
