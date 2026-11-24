/**
 * Cálculos de capacidad / ocupación de depósitos y posiciones.
 * Todo se calcula en el frontend a partir de:
 *  - GET /depots          (depósitos + posiciones)
 *  - GET /stock           (saldos con batch.item)
 *  - GET /box-types       (volumen de cada tipo de caja)
 * No requiere cambios de backend ni de base de datos.
 *
 * Los datos extra de cada posición (dimensiones, peso máximo, notas) se guardan
 * en la columna jsonb `positions.meta`, que ya existe.
 */

export const ZONAS: { value: string; label: string; color: string }[] = [
    { value: 'STOCK', label: 'Stock general', color: '#6366f1' },
    { value: 'PICKING', label: 'Picking', color: '#10b981' },
    { value: 'DEVOLUCION_LINEA', label: 'Devolución de línea', color: '#f59e0b' },
    { value: 'PASILLO', label: 'Pasillo', color: '#64748b' },
    { value: 'ENTRADA', label: 'Entrada / Recepción', color: '#06b6d4' },
    { value: 'INPUT', label: 'Entrada (sistema)', color: '#06b6d4' },
    { value: 'CUARENTENA', label: 'Cuarentena', color: '#ef4444' },
    { value: 'EXTERNO', label: 'Externo / Terceros', color: '#a855f7' },
    { value: 'STORAGE', label: 'Almacenamiento (legacy)', color: '#94a3b8' },
];

export const ZONAS_EDITABLES = ZONAS.filter(z => z.value !== 'INPUT');

export const zonaLabel = (v?: string | null) =>
    ZONAS.find(z => z.value === (v || '').toUpperCase())?.label || v || '—';
export const zonaColor = (v?: string | null) =>
    ZONAS.find(z => z.value === (v || '').toUpperCase())?.color || '#94a3b8';

export interface PositionMeta {
    system?: boolean;
    description?: string;
    altoM?: number | null;
    anchoM?: number | null;
    profundidadM?: number | null;
    maxKg?: number | null;
    notas?: string | null;
    idealItemId?: string | null;
    idealItemCodigo?: string | null;
    idealItemDescripcion?: string | null;
    [k: string]: any;
}

export type OccupancyStatus = 'inactiva' | 'vacia' | 'ocupada' | 'llena' | 'excedida' | 'sin_capacidad';

export const STATUS_INFO: Record<OccupancyStatus, { label: string; color: string }> = {
    inactiva: { label: 'Inactiva', color: '#6b7280' },
    vacia: { label: 'Vacía', color: '#64748b' },
    ocupada: { label: 'Ocupada', color: '#10b981' },
    llena: { label: 'Casi llena', color: '#f59e0b' },
    excedida: { label: 'Excedida', color: '#ef4444' },
    sin_capacidad: { label: 'Sin m³ cargado', color: '#a855f7' },
};

/** Umbral (%) a partir del cual una posición se considera "casi llena". */
export const FULL_THRESHOLD = 90;

export interface StockLine {
    raw: any;
    itemId: string;
    codigo: string;
    descripcion: string;
    categoria: string;
    lote: string;
    kilos: number;
    unidades: number | null;
    volumenM3: number;
    volumenConocido: boolean;
}

export interface PositionStats {
    positionId: string;
    kilos: number;
    unidades: number;
    volumenM3: number;
    lineas: StockLine[];
    lotes: number;
    materiales: number;
    /** true si alguna línea no tiene volumen calculable (material sin tipo de caja o sin kilos/caja) */
    volumenIncompleto: boolean;
}

export interface PositionView {
    pos: any;
    meta: PositionMeta;
    stats: PositionStats;
    capacidadM3: number;
    ocupacionPct: number | null;
    pesoPct: number | null;
    status: OccupancyStatus;
    isSystem: boolean;
}

export interface DepotSummary {
    depot: any;
    posTotal: number;
    posActivas: number;
    posInactivas: number;
    capacidadM3: number;
    ocupadoM3: number;
    ocupacionPct: number | null;
    vacias: number;
    ocupadas: number;
    llenas: number;
    excedidas: number;
    sinCapacidad: number;
    kilos: number;
    materiales: number;
    lotes: number;
    lineasSinVolumen: number;
    inactivasConStock: number;
}

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

export const getMeta = (pos: any): PositionMeta => (pos?.meta && typeof pos.meta === 'object' ? pos.meta : {});

export const isSystemPosition = (pos: any) =>
    !!getMeta(pos).system || (pos?.codigo || '').toUpperCase() === 'ENTRADA';

export const volumeFromDims = (m: PositionMeta): number | null => {
    const a = num(m.altoM), b = num(m.anchoM), c = num(m.profundidadM);
    return a > 0 && b > 0 && c > 0 ? +(a * b * c).toFixed(4) : null;
};

export function buildStockLine(sb: any, boxTypesById: Map<string, any>): StockLine {
    const item = sb?.batch?.item || {};
    const kilos = num(sb.qtyPrincipal);
    const kpc = num(item.kilosPorCaja);
    const unidades = sb.qtySecundaria !== null && sb.qtySecundaria !== undefined ? num(sb.qtySecundaria) : null;
    const cajas = unidades !== null ? unidades : (kpc > 0 ? kilos / kpc : null);
    const bt = item.boxTypeId ? boxTypesById.get(item.boxTypeId) : (item.boxType || null);
    const unitVol = num(bt?.volumenM3);
    const volumenConocido = cajas !== null && unitVol > 0;
    return {
        raw: sb,
        itemId: item.id || sb.itemId,
        codigo: item.codigoInterno || '',
        descripcion: item.descripcion || '(sin descripción)',
        categoria: item.category?.nombre || item.categoria || '',
        lote: sb?.batch?.lotNumber || '',
        kilos,
        unidades,
        volumenM3: volumenConocido ? (cajas as number) * unitVol : 0,
        volumenConocido,
    };
}

export function computePositionStats(stock: any[], boxTypes: any[]): Map<string, PositionStats> {
    const boxTypesById = new Map<string, any>((boxTypes || []).map(b => [b.id, b]));
    const map = new Map<string, PositionStats>();
    for (const sb of stock || []) {
        const pid = sb.posicionId || sb.posicion?.id;
        if (!pid) continue;
        if (!map.has(pid)) {
            map.set(pid, { positionId: pid, kilos: 0, unidades: 0, volumenM3: 0, lineas: [], lotes: 0, materiales: 0, volumenIncompleto: false });
        }
        const s = map.get(pid)!;
        const line = buildStockLine(sb, boxTypesById);
        s.lineas.push(line);
        s.kilos += line.kilos;
        s.unidades += line.unidades || 0;
        s.volumenM3 += line.volumenM3;
        if (!line.volumenConocido) s.volumenIncompleto = true;
    }
    for (const s of map.values()) {
        s.lotes = new Set(s.lineas.map(l => l.raw.lotId || l.lote)).size;
        s.materiales = new Set(s.lineas.map(l => l.itemId)).size;
    }
    return map;
}

const EMPTY_STATS = (pid: string): PositionStats => ({
    positionId: pid, kilos: 0, unidades: 0, volumenM3: 0, lineas: [], lotes: 0, materiales: 0, volumenIncompleto: false,
});

export function buildPositionView(pos: any, statsMap: Map<string, PositionStats>): PositionView {
    const meta = getMeta(pos);
    const stats = statsMap.get(pos.id) || EMPTY_STATS(pos.id);
    const capacidadM3 = num(pos.metrosCubicos);
    const ocupacionPct = capacidadM3 > 0 ? (stats.volumenM3 / capacidadM3) * 100 : null;
    const maxKg = num(meta.maxKg);
    const pesoPct = maxKg > 0 ? (stats.kilos / maxKg) * 100 : null;
    const tieneStock = stats.lineas.length > 0;

    // El peor de los dos indicadores (volumen o peso) define el estado
    const worst = Math.max(ocupacionPct ?? -1, pesoPct ?? -1);
    let status: OccupancyStatus;
    if (!pos.activo) status = 'inactiva';
    else if (!tieneStock) status = 'vacia';
    else if (worst < 0) status = 'sin_capacidad';
    else if (worst > 100) status = 'excedida';
    else if (worst >= FULL_THRESHOLD) status = 'llena';
    else status = 'ocupada';

    return { pos, meta, stats, capacidadM3, ocupacionPct, pesoPct, status, isSystem: isSystemPosition(pos) };
}

export function summarizeDepot(depot: any, views: PositionView[]): DepotSummary {
    const activas = views.filter(v => v.pos.activo);
    const capacidadM3 = activas.reduce((a, v) => a + v.capacidadM3, 0);
    const ocupadoM3 = views.reduce((a, v) => a + v.stats.volumenM3, 0);
    const allLines = views.flatMap(v => v.stats.lineas);
    return {
        depot,
        posTotal: views.length,
        posActivas: activas.length,
        posInactivas: views.length - activas.length,
        capacidadM3,
        ocupadoM3,
        ocupacionPct: capacidadM3 > 0 ? (ocupadoM3 / capacidadM3) * 100 : null,
        vacias: views.filter(v => v.status === 'vacia').length,
        ocupadas: views.filter(v => v.status === 'ocupada').length,
        llenas: views.filter(v => v.status === 'llena').length,
        excedidas: views.filter(v => v.status === 'excedida').length,
        sinCapacidad: activas.filter(v => v.capacidadM3 <= 0 && !v.isSystem).length,
        kilos: allLines.reduce((a, l) => a + l.kilos, 0),
        materiales: new Set(allLines.map(l => l.itemId)).size,
        lotes: new Set(allLines.map(l => l.raw.lotId || l.lote)).size,
        lineasSinVolumen: allLines.filter(l => !l.volumenConocido).length,
        inactivasConStock: views.filter(v => !v.pos.activo && v.stats.lineas.length > 0).length,
    };
}

/* ─── Generador de códigos de posición ─── */

export interface CodeSegment {
    type: 'num' | 'letter' | 'fixed';
    from: string;
    to: string;
    pad: number;
}

const letterRange = (from: string, to: string): string[] => {
    const a = (from || 'A').toUpperCase().charCodeAt(0);
    const b = (to || from || 'A').toUpperCase().charCodeAt(0);
    const out: string[] = [];
    if (Number.isNaN(a) || Number.isNaN(b)) return out;
    for (let c = Math.min(a, b); c <= Math.max(a, b); c++) out.push(String.fromCharCode(c));
    return out;
};

const numRange = (from: string, to: string, pad: number): string[] => {
    const a = parseInt(from, 10), b = parseInt(to || from, 10);
    if (Number.isNaN(a) || Number.isNaN(b)) return [];
    const out: string[] = [];
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(String(n).padStart(pad || 0, '0'));
    return out;
};

export function generateCodes(prefix: string, segments: CodeSegment[], separator: string, limit = 5000): string[] {
    let acc: string[] = [''];
    for (const seg of segments) {
        const values = seg.type === 'letter' ? letterRange(seg.from, seg.to)
            : seg.type === 'num' ? numRange(seg.from, seg.to, seg.pad)
                : [seg.from];
        if (values.length === 0) continue;
        const next: string[] = [];
        for (const a of acc) {
            for (const v of values) {
                next.push(a ? `${a}${separator}${v}` : v);
                if (next.length > limit) break;
            }
            if (next.length > limit) break;
        }
        acc = next;
    }
    const p = prefix.trim();
    return acc.filter(Boolean).map(c => (p ? `${p}${separator}${c}` : c)).slice(0, limit);
}

/* ─── Utilidades varias ─── */

export const fmt = (n: number | null | undefined, dec = 1) =>
    n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: 0 });

export const pctColor = (p: number | null) => {
    if (p === null) return '#6b7280';
    if (p > 100) return '#ef4444';
    if (p >= FULL_THRESHOLD) return '#f59e0b';
    if (p >= 60) return '#eab308';
    return '#10b981';
};

/** Ejecuta tareas async en tandas para no saturar la API. */
export async function runInChunks<T>(
    items: T[],
    worker: (item: T) => Promise<any>,
    chunkSize = 5,
    onProgress?: (done: number, total: number) => void,
): Promise<{ ok: number; errors: { item: T; error: any }[] }> {
    let ok = 0;
    const errors: { item: T; error: any }[] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const res = await Promise.allSettled(chunk.map(worker));
        res.forEach((r, idx) => {
            if (r.status === 'fulfilled') ok++;
            else errors.push({ item: chunk[idx], error: r.reason });
        });
        onProgress?.(Math.min(i + chunkSize, items.length), items.length);
    }
    return { ok, errors };
}

export function downloadCsv(filename: string, rows: Record<string, any>[]) {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const esc = (v: any) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(';'), ...rows.map(r => headers.map(h => esc(r[h])).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── Motor de recomendaciones de reubicación ─── */

export type RelocationMatchType = 'EXACT_ITEM' | 'PRIMARY_CAT' | 'SECONDARY_CAT';
export type RelocationSourceReason = 'inactiva' | 'entrada' | 'conflicto' | 'libre';

export interface RelocationRecommendation {
    id: string;
    depotId: string;
    depotNombre: string;
    line: StockLine;
    batchId: string | null;
    source: PositionView;
    target: PositionView;
    matchType: RelocationMatchType;
    matchLabel: string;
    sourceReason: RelocationSourceReason;
    sourceReasonLabel: string;
    targetWasEmpty: boolean;
    score: number;
    alreadyInTasks: boolean;
}

const SOURCE_REASON_LABEL: Record<RelocationSourceReason, string> = {
    inactiva: 'Posición origen inactiva',
    entrada: 'En zona de entrada / tránsito',
    conflicto: 'Reservada para otro material',
    libre: 'En posición libre',
};

const TRANSIT_ZONES = new Set(['ENTRADA', 'INPUT', 'PASILLO', 'DEVOLUCION_LINEA']);

function isLineInIdealPlace(src: PositionView, line: StockLine): boolean {
    if (!src.pos.activo || src.isSystem) return false;
    const zona = (src.pos.categoria || '').toUpperCase();
    if (TRANSIT_ZONES.has(zona)) return false;

    if (src.meta.idealItemId) {
        return src.meta.idealItemId === line.itemId;
    }
    if (line.categoria) {
        if (src.pos.categoriaPrincipal === line.categoria) return true;
        if (src.pos.categoriaSecundaria === line.categoria) return true;
    }
    return false;
}

function classifySourceReason(src: PositionView, line: StockLine): RelocationSourceReason {
    if (!src.pos.activo) return 'inactiva';
    const zona = (src.pos.categoria || '').toUpperCase();
    if (src.isSystem || TRANSIT_ZONES.has(zona)) return 'entrada';
    const hasSpecificIdeal = Boolean(src.meta.idealItemId && src.meta.idealItemId !== line.itemId);
    const hasCatIdeal = Boolean(
        (src.pos.categoriaPrincipal || src.pos.categoriaSecundaria) &&
        line.categoria &&
        src.pos.categoriaPrincipal !== line.categoria &&
        src.pos.categoriaSecundaria !== line.categoria,
    );
    if (hasSpecificIdeal || hasCatIdeal) return 'conflicto';
    return 'libre';
}

export function computeRelocationRecommendations(
    depot: any,
    views: PositionView[],
    pendingTasks: any[] = [],
): RelocationRecommendation[] {
    if (!depot || !views || views.length === 0) return [];

    // Posiciones destino candidatas: activas, no sistema, no pasillo/entrada, y con alguna asignación ideal
    const candidateTargets = views.filter(v => {
        if (!v.pos.activo || v.isSystem) return false;
        const zona = (v.pos.categoria || '').toUpperCase();
        if (TRANSIT_ZONES.has(zona) || zona === 'CUARENTENA') return false;
        return Boolean(v.meta.idealItemId || v.pos.categoriaPrincipal || v.pos.categoriaSecundaria);
    });
    if (candidateTargets.length === 0) return [];

    // Seguimiento virtual de espacio usado al asignar sugerencias
    const virtualVol = new Map<string, number>();
    const virtualKg = new Map<string, number>();
    const virtualEmpty = new Map<string, boolean>();
    for (const t of candidateTargets) {
        virtualVol.set(t.pos.id, t.stats.volumenM3);
        virtualKg.set(t.pos.id, t.stats.kilos);
        virtualEmpty.set(t.pos.id, t.stats.lineas.length === 0);
    }

    // Recolectar líneas fuera de lugar y ordenarlas por urgencia
    const misplaced: { src: PositionView; line: StockLine; reason: RelocationSourceReason; urgency: number }[] = [];
    for (const src of views) {
        for (const line of src.stats.lineas) {
            if (!line.itemId || line.kilos <= 0) continue;
            if (isLineInIdealPlace(src, line)) continue;
            const reason = classifySourceReason(src, line);
            const urgency = reason === 'inactiva' ? 4 : reason === 'entrada' ? 3 : reason === 'conflicto' ? 2 : 1;
            misplaced.push({ src, line, reason, urgency });
        }
    }
    misplaced.sort((a, b) => b.urgency - a.urgency || b.line.kilos - a.line.kilos);

    const activeTasks = (pendingTasks || []).filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS');
    const recs: RelocationRecommendation[] = [];

    for (const { src, line, reason, urgency } of misplaced) {
        let best: { target: PositionView; matchType: RelocationMatchType; matchLabel: string; targetWasEmpty: boolean; score: number } | null = null;

        for (const t of candidateTargets) {
            if (t.pos.id === src.pos.id) continue;

            // Verificar compatibilidad
            let matchType: RelocationMatchType | null = null;
            let matchLabel = '';
            if (t.meta.idealItemId) {
                if (t.meta.idealItemId === line.itemId) {
                    matchType = 'EXACT_ITEM';
                    matchLabel = `Material ideal: ${t.meta.idealItemCodigo || line.codigo}`;
                }
            } else if (line.categoria) {
                if (t.pos.categoriaPrincipal === line.categoria) {
                    matchType = 'PRIMARY_CAT';
                    matchLabel = `Cat. principal: ${line.categoria}`;
                } else if (t.pos.categoriaSecundaria === line.categoria) {
                    matchType = 'SECONDARY_CAT';
                    matchLabel = `Cat. secundaria: ${line.categoria}`;
                }
            }
            if (!matchType) continue;

            // Verificar espacio disponible (volumen y peso)
            const curVol = virtualVol.get(t.pos.id) ?? 0;
            const curKg = virtualKg.get(t.pos.id) ?? 0;
            if (t.capacidadM3 > 0 && line.volumenConocido && curVol + line.volumenM3 > t.capacidadM3 * 1.02) continue;
            if (t.capacidadM3 > 0 && !line.volumenConocido && curVol >= t.capacidadM3) continue;
            if (t.meta.maxKg && t.meta.maxKg > 0 && curKg + line.kilos > t.meta.maxKg * 1.02) continue;

            const isEmpty = virtualEmpty.get(t.pos.id) ?? false;
            const matchScore = matchType === 'EXACT_ITEM' ? 300 : matchType === 'PRIMARY_CAT' ? 200 : 100;
            const emptyBonus = isEmpty ? 60 : 0;
            const freePct = t.capacidadM3 > 0 ? Math.max(0, 1 - curVol / t.capacidadM3) * 20 : 10;
            const score = matchScore + emptyBonus + urgency * 15 + freePct;

            if (!best || score > best.score) {
                best = { target: t, matchType, matchLabel, targetWasEmpty: isEmpty, score };
            }
        }

        if (!best) continue;

        // Reservar espacio virtual en el destino elegido
        virtualVol.set(best.target.pos.id, (virtualVol.get(best.target.pos.id) ?? 0) + (line.volumenConocido ? line.volumenM3 : 0));
        virtualKg.set(best.target.pos.id, (virtualKg.get(best.target.pos.id) ?? 0) + line.kilos);
        virtualEmpty.set(best.target.pos.id, false);

        const batchId = line.raw?.lotId || line.raw?.batch?.id || null;
        const alreadyInTasks = activeTasks.some(
            t =>
                t.itemId === line.itemId &&
                t.sourcePositionId === src.pos.id &&
                t.targetPositionId === best!.target.pos.id,
        );

        recs.push({
            id: `${src.pos.id}->${best.target.pos.id}:${line.itemId}:${batchId || 'nolot'}`,
            depotId: depot.id,
            depotNombre: depot.nombre,
            line,
            batchId,
            source: src,
            target: best.target,
            matchType: best.matchType,
            matchLabel: best.matchLabel,
            sourceReason: reason,
            sourceReasonLabel: SOURCE_REASON_LABEL[reason],
            targetWasEmpty: best.targetWasEmpty,
            score: best.score,
            alreadyInTasks,
        });
    }

    return recs.sort((a, b) => Number(a.alreadyInTasks) - Number(b.alreadyInTasks) || b.score - a.score);
}

