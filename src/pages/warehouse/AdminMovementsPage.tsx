import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
} from 'recharts';
import {
    useGetRecentMovementsQuery,
    useReverseMovementMutation,
    useGetStockQuery,
} from '../../features/warehouse/stock/api/stock.api';
import { useGetDepotsQuery } from '../../features/warehouse/deposito/api/deposito.api';
import { useGetItemsQuery } from '../../features/warehouse/materiales/api/items.api';
import { useLazyGetRemitoSalidaQuery } from '../../features/warehouse/remitosSalida/api/remitos-salida.api';
import { useLazyGetRemitoEntradaQuery } from '../../features/warehouse/remitosEntrada/api/remitos-entrada.api';
import { RemitoDetailModal } from '../../features/warehouse/remitos/ui/RemitoDetailModal';
import {
    PageHeader,
    Card,
    Badge,
    Btn,
    Select,
    SearchSelect,
    Input,
    Modal,
    useIsMobile,
    ActionMenu,
    ResponsiveTable,
} from '../../shared/ui';
import { selectCurrentUser, selectUserSector } from '../../entities/auth/model/authSlice';
import { PaginationControls, useClientPagination } from '../../shared/pagination';

type DatePreset = '2d' | '7d' | '30d' | '90d' | 'year' | 'all' | 'custom';
type FlowFilter = 'ALL' | 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER' | 'CANCELLED';
type ViewMode = 'TABLE' | 'KARDEX';

interface TypeMeta {
    color: string;
    label: string;
    shortLabel: string;
    icon: string;
    multiplier: 1 | -1 | 0;
    category: 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER' | 'ANULACION';
    canReverse: boolean;
}

const TYPE_META: Record<string, TypeMeta> = {
    REMITO_ENTRADA: {
        color: '#10b981',
        label: 'ENTRADA (Remito)',
        shortLabel: 'ENTRADA',
        icon: '📥',
        multiplier: 1,
        category: 'IN',
        canReverse: true,
    },
    REMITO_SALIDA: {
        color: '#ef4444',
        label: 'SALIDA (Remito)',
        shortLabel: 'SALIDA',
        icon: '📤',
        multiplier: -1,
        category: 'OUT',
        canReverse: true,
    },
    AJUSTE_SUMA: {
        color: '#3b82f6',
        label: 'AJUSTE (+)',
        shortLabel: 'AJUSTE (+)',
        icon: '➕',
        multiplier: 1,
        category: 'ADJUST',
        canReverse: true,
    },
    AJUSTE_RESTA: {
        color: '#f59e0b',
        label: 'AJUSTE (-)',
        shortLabel: 'AJUSTE (-)',
        icon: '➖',
        multiplier: -1,
        category: 'ADJUST',
        canReverse: true,
    },
    MOVE_INTERNO: {
        color: '#6366f1',
        label: 'TRASLADO INTERNO',
        shortLabel: 'TRASLADO',
        icon: '🔄',
        multiplier: 1,
        category: 'TRANSFER',
        canReverse: false,
    },
    ENTREGA_PRODUCCION: {
        color: '#f97316',
        label: 'ENTREGA PRODUCCIÓN',
        shortLabel: 'ENT. PROD.',
        icon: '🏭',
        multiplier: -1,
        category: 'OUT',
        canReverse: false,
    },
    DEVOLUCION_LINEA: {
        color: '#14b8a6',
        label: 'DEVOLUCIÓN LÍNEA',
        shortLabel: 'DEV. LÍNEA',
        icon: '↩️',
        multiplier: 1,
        category: 'IN',
        canReverse: false,
    },
    INGRESO_PRODUCCION: {
        color: '#22c55e',
        label: 'INGRESO PRODUCCIÓN',
        shortLabel: 'ING. PROD.',
        icon: '⚙️',
        multiplier: 1,
        category: 'IN',
        canReverse: false,
    },
    ANULACION_ENTRADA: {
        color: '#ec4899',
        label: 'ANUL. ENTRADA',
        shortLabel: 'ANUL. ENT.',
        icon: '🚫',
        multiplier: -1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_SALIDA: {
        color: '#ec4899',
        label: 'ANUL. SALIDA',
        shortLabel: 'ANUL. SAL.',
        icon: '🚫',
        multiplier: 1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_AJUSTE_SUMA: {
        color: '#ec4899',
        label: 'ANUL. AJUSTE (+)',
        shortLabel: 'ANUL. AJ (+)',
        icon: '🚫',
        multiplier: -1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_AJUSTE_RESTA: {
        color: '#ec4899',
        label: 'ANUL. AJUSTE (-)',
        shortLabel: 'ANUL. AJ (-)',
        icon: '🚫',
        multiplier: 1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_ENTREGA_PRODUCCION: {
        color: '#ec4899',
        label: 'ANUL. ENT. PROD.',
        shortLabel: 'ANUL. PROD.',
        icon: '🚫',
        multiplier: 1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_DEVOLUCION_LINEA: {
        color: '#ec4899',
        label: 'ANUL. DEV. LÍNEA',
        shortLabel: 'ANUL. DEV.',
        icon: '🚫',
        multiplier: -1,
        category: 'ANULACION',
        canReverse: false,
    },
    ANULACION_INGRESO_PRODUCCION: {
        color: '#ec4899',
        label: 'ANUL. ING. PROD.',
        shortLabel: 'ANUL. ING.',
        icon: '🚫',
        multiplier: -1,
        category: 'ANULACION',
        canReverse: false,
    },
};

function getTypeMeta(tipo: string, observaciones?: string | null): TypeMeta {
    const base = TYPE_META[tipo] || {
        color: '#9ca3af',
        label: tipo,
        shortLabel: tipo,
        icon: '📋',
        multiplier: 0 as const,
        category: 'ADJUST' as const,
        canReverse: false,
    };
    // Detect internal movement recorded as AJUSTE_SUMA / AJUSTE_RESTA with "Movimiento Interno" observation
    if (
        (tipo === 'AJUSTE_SUMA' || tipo === 'AJUSTE_RESTA') &&
        observaciones &&
        observaciones.toLowerCase().includes('movimiento interno')
    ) {
        return {
            ...base,
            color: '#818cf8',
            shortLabel: tipo === 'AJUSTE_SUMA' ? 'TRASLADO (+)' : 'TRASLADO (-)',
            icon: '🔄',
            category: 'TRANSFER',
        };
    }
    return base;
}

function getIsoDateDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function formatDateAR(dateStr: string): string {
    if (!dateStr) return '—';
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return new Date(dateStr).toLocaleDateString('es-AR');
}

function formatTimeAR(dateStr?: string): string {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

export default function AdminMovementsPage() {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const user = useSelector(selectCurrentUser);
    const userSector = useSelector(selectUserSector);
    const role = user?.role?.toUpperCase() || '';
    const sector = (userSector || user?.sector || '').toUpperCase();
    const isAdmin = role === 'ADMIN';
    const isSupervisor = role === 'SUPERVISOR';
    const canAccess = isAdmin || sector.includes('DEPOSITO') || isSupervisor;
    const canReverse = isAdmin || (isSupervisor && sector.includes('DEPOSITO'));

    // URL initial params
    const initialItemId = searchParams.get('itemId') || '';
    const initialLot = searchParams.get('lotNumber') || '';
    const initialDeposito = searchParams.get('depositoId') || '';
    const initialPreset: DatePreset = initialItemId || initialLot ? 'all' : '7d';

    const [datePreset, setDatePreset] = useState<DatePreset>(initialPreset);
    const [desde, setDesde] = useState<string>(() => (initialPreset === 'all' ? '' : getIsoDateDaysAgo(7)));
    const [hasta, setHasta] = useState<string>(() => (initialPreset === 'all' ? '' : new Date().toISOString().split('T')[0]));
    const [depositoId, setDepositoId] = useState<string>(initialDeposito);
    const [posicionId, setPosicionId] = useState<string>('');
    const [itemId, setItemId] = useState<string>(initialItemId);
    const [lotNumber, setLotNumber] = useState<string>(initialLot);
    const [tipo, setTipo] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');
    const [quickSearch, setQuickSearch] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>(initialItemId ? 'KARDEX' : 'TABLE');

    // Detail Modals
    const [selectedMovement, setSelectedMovement] = useState<any | null>(null);
    const [selectedRemito, setSelectedRemito] = useState<any | null>(null);
    const [showRemitoModal, setShowRemitoModal] = useState(false);

    const [triggerGetRemitoSalida] = useLazyGetRemitoSalidaQuery();
    const [triggerGetRemitoEntrada] = useLazyGetRemitoEntradaQuery();

    const { data: rawDepots = [] } = useGetDepotsQuery();
    const { data: rawItems = [] } = useGetItemsQuery({});

    // Sync URL params if navigated from StockPage or elsewhere
    useEffect(() => {
        const urlItem = searchParams.get('itemId');
        const urlLot = searchParams.get('lotNumber');
        const urlDepot = searchParams.get('depositoId');
        if (urlItem && urlItem !== itemId) {
            setItemId(urlItem);
            setDatePreset('all');
            setDesde('');
            setHasta('');
            setViewMode('KARDEX');
        }
        if (urlLot && urlLot !== lotNumber) {
            setLotNumber(urlLot);
            setDatePreset('all');
            setDesde('');
            setHasta('');
        }
        if (urlDepot && urlDepot !== depositoId) {
            setDepositoId(urlDepot);
        }
    }, [searchParams]);

    const applyPreset = (preset: DatePreset) => {
        setDatePreset(preset);
        const today = new Date().toISOString().split('T')[0];
        if (preset === '2d') {
            setDesde(getIsoDateDaysAgo(2));
            setHasta(today);
        } else if (preset === '7d') {
            setDesde(getIsoDateDaysAgo(7));
            setHasta(today);
        } else if (preset === '30d') {
            setDesde(getIsoDateDaysAgo(30));
            setHasta(today);
        } else if (preset === '90d') {
            setDesde(getIsoDateDaysAgo(90));
            setHasta(today);
        } else if (preset === 'year') {
            setDesde(`${new Date().getFullYear()}-01-01`);
            setHasta(today);
        } else if (preset === 'all') {
            setDesde('');
            setHasta('');
        }
    };

    const handleSelectItem = (newItemId: string) => {
        setItemId(newItemId);
        const nextParams = new URLSearchParams(searchParams);
        if (newItemId) {
            nextParams.set('itemId', newItemId);
            // Automatically switch to full history when investigating a material if currently on a narrow 2d/7d window
            if (datePreset === '2d' || datePreset === '7d') {
                applyPreset('all');
            }
        } else {
            nextParams.delete('itemId');
            if (viewMode === 'KARDEX') setViewMode('TABLE');
        }
        setSearchParams(nextParams, { replace: true });
    };

    const handleClearAllFilters = () => {
        setItemId('');
        setLotNumber('');
        setDepositoId('');
        setPosicionId('');
        setTipo('');
        setStatusFilter('');
        setFlowFilter('ALL');
        setQuickSearch('');
        applyPreset('7d');
        setViewMode('TABLE');
        setSearchParams({}, { replace: true });
    };

    // Fetch movements from backend
    const { data: movements = [], isFetching, refetch } = useGetRecentMovementsQuery({
        desde: desde || undefined,
        hasta: hasta || undefined,
        depositoId: depositoId || undefined,
        posicionId: posicionId || undefined,
        itemId: itemId || undefined,
        lotNumber: lotNumber || undefined,
        tipo: tipo || undefined,
        status: statusFilter || undefined,
    });

    // Fetch current stock for selected material (or depot) to compute accurate Kardex running balance & show current distribution
    const { data: currentItemStock = [] } = useGetStockQuery(
        {
            itemId: itemId || undefined,
            depotId: depositoId || undefined,
        },
        { skip: !itemId }
    );

    const [reverseMovement] = useReverseMovementMutation();

    // Selected item metadata
    const selectedItemObj = useMemo(() => {
        if (!itemId) return null;
        return rawItems.find((i: any) => i.id === itemId) || movements[0]?.item || null;
    }, [itemId, rawItems, movements]);

    // Current stock summary for selected material
    const itemStockSummary = useMemo(() => {
        if (!itemId) return { totalPrincipal: 0, totalSecundaria: 0, positions: [] as any[], lots: new Set<string>() };
        let totalPrincipal = 0;
        let totalSecundaria = 0;
        const lots = new Set<string>();
        const posList: { id: string; codigo: string; deposito: string; lotNumber: string; qtyPrincipal: number; qtySecundaria: number }[] = [];

        currentItemStock.forEach((s: any) => {
            if (posicionId && s.posicionId !== posicionId) return;
            if (lotNumber && !(s.batch?.lotNumber || '').toLowerCase().includes(lotNumber.toLowerCase())) return;
            const qp = Number(s.qtyPrincipal || 0);
            const qs = Number(s.qtySecundaria || 0);
            totalPrincipal += qp;
            totalSecundaria += qs;
            if (s.batch?.lotNumber) lots.add(s.batch.lotNumber);
            posList.push({
                id: s.id,
                codigo: s.posicion?.codigo || 'S/P',
                deposito: s.posicion?.depot?.nombre || 'Depósito',
                lotNumber: s.batch?.lotNumber || 'S/L',
                qtyPrincipal: qp,
                qtySecundaria: qs,
            });
        });

        return { totalPrincipal, totalSecundaria, positions: posList, lots };
    }, [itemId, currentItemStock, posicionId, lotNumber]);

    // Compute chronological running balance (Kardex) when a material is selected, or per-item+position+lot
    const movementsWithRunningBalance = useMemo(() => {
        // Sort newest first
        const sortedDesc = [...movements].sort((a: any, b: any) => {
            const dateDiff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
            if (dateDiff !== 0) return dateDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        if (!itemId) {
            return sortedDesc.map((m: any) => {
                const meta = getTypeMeta(m.tipo, m.observaciones);
                const signedQty = Number(m.qtyPrincipal || 0) * meta.multiplier;
                const signedSec = m.qtySecundaria != null ? Number(m.qtySecundaria) * meta.multiplier : null;
                return {
                    ...m,
                    _meta: meta,
                    _signedQty: signedQty,
                    _signedSec: signedSec,
                    _saldoAfter: null as number | null,
                    _saldoBefore: null as number | null,
                };
            });
        }

        // When a material is selected, we can reconstruct the exact balance after each movement!
        // If we are looking from the present backwards (no `hasta` or `hasta` >= today), we anchor at `itemStockSummary.totalPrincipal`.
        // Wait: what if `original` movement was ANULADO? Remember in this system:
        // When a movement is created, subscriber adds `qty * multiplier`.
        // When it is cancelled, original is marked `status = ANULADO` (stock was ALREADY changed by original!) AND a new `ANULACION_*` movement is inserted with the opposite multiplier!
        // So BOTH the original (even if status === 'ANULADO') AND the `ANULACION_*` movement affected the balance at their respective timestamps!
        // Wait: if someone views Kardex, we can also calculate cumulative forward from oldest movement, or backward from current stock.
        // Let's check: forward accumulation from all movements in the list (or anchored to current stock if today is included).
        // Even better: let's compute forward cumulative sum from the oldest movement in the dataset, AND if `desde` is empty (todo el historial), forward sum is the exact historical balance! If `desde` is set, anchoring backwards from currentStock (when `hasta` is today/empty) gives the exact real stock balance at each point in time!
        const todayStr = new Date().toISOString().split('T')[0];
        const isAnchoredToToday = !hasta || hasta >= todayStr;

        if (isAnchoredToToday && !flowFilter.includes('IN') && !tipo && !statusFilter) {
            let running = itemStockSummary.totalPrincipal;
            return sortedDesc.map((m: any) => {
                const meta = getTypeMeta(m.tipo, m.observaciones);
                const signedQty = Number(m.qtyPrincipal || 0) * meta.multiplier;
                const signedSec = m.qtySecundaria != null ? Number(m.qtySecundaria) * meta.multiplier : null;
                const saldoAfter = running;
                const saldoBefore = running - signedQty;
                running = saldoBefore;
                return {
                    ...m,
                    _meta: meta,
                    _signedQty: signedQty,
                    _signedSec: signedSec,
                    _saldoAfter: saldoAfter,
                    _saldoBefore: saldoBefore,
                };
            });
        } else {
            // Forward accumulation from oldest in the query
            const asc = [...sortedDesc].reverse();
            let running = 0;
            const mapById = new Map<string, { saldoBefore: number; saldoAfter: number }>();
            asc.forEach((m: any) => {
                const meta = getTypeMeta(m.tipo, m.observaciones);
                const signedQty = Number(m.qtyPrincipal || 0) * meta.multiplier;
                const saldoBefore = running;
                const saldoAfter = running + signedQty;
                running = saldoAfter;
                mapById.set(m.id, { saldoBefore, saldoAfter });
            });

            return sortedDesc.map((m: any) => {
                const meta = getTypeMeta(m.tipo, m.observaciones);
                const signedQty = Number(m.qtyPrincipal || 0) * meta.multiplier;
                const signedSec = m.qtySecundaria != null ? Number(m.qtySecundaria) * meta.multiplier : null;
                const saldos = mapById.get(m.id);
                return {
                    ...m,
                    _meta: meta,
                    _signedQty: signedQty,
                    _signedSec: signedSec,
                    _saldoAfter: saldos ? saldos.saldoAfter : null,
                    _saldoBefore: saldos ? saldos.saldoBefore : null,
                };
            });
        }
    }, [movements, itemId, itemStockSummary.totalPrincipal, hasta, flowFilter, tipo, statusFilter]);

    // Client-side quick search & flow category filter
    const filteredMovements = useMemo(() => {
        const qTokens = quickSearch
            .toLowerCase()
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        return movementsWithRunningBalance.filter((m: any) => {
            const meta: TypeMeta = m._meta;

            // Flow filter
            if (flowFilter === 'IN' && meta.category !== 'IN') return false;
            if (flowFilter === 'OUT' && meta.category !== 'OUT') return false;
            if (flowFilter === 'ADJUST' && meta.category !== 'ADJUST') return false;
            if (flowFilter === 'TRANSFER' && meta.category !== 'TRANSFER') return false;
            if (flowFilter === 'CANCELLED' && m.status !== 'ANULADO' && meta.category !== 'ANULACION') return false;

            // Quick text search
            if (qTokens.length > 0) {
                const itemDesc = (m.item?.descripcion || '').toLowerCase();
                const itemCode = (m.item?.codigoInterno || '').toLowerCase();
                const catName = (m.item?.category?.nombre || m.item?.categoria || m.categoria || '').toLowerCase();
                const lot = (m.batch?.lotNumber || '').toLowerCase();
                const pos = (m.posicion?.codigo || '').toLowerCase();
                const depot = (m.deposito?.nombre || m.posicion?.depot?.nombre || '').toLowerCase();
                const docNum = (m.documentoNumero || m.documento?.numero || '').toLowerCase();
                const partnerName = (m.documento?.partner?.name || m.item?.supplier?.name || m.batch?.supplier?.name || '').toLowerCase();
                const userName = (m.user?.username || m.user?.nombre || '').toLowerCase();
                const obs = (m.observaciones || '').toLowerCase();
                const tipoLabel = meta.label.toLowerCase();

                const hay = `${itemDesc} ${itemCode} ${catName} ${lot} ${pos} ${depot} ${docNum} ${partnerName} ${userName} ${obs} ${tipoLabel}`;
                if (!qTokens.every((t) => hay.includes(t))) return false;
            }

            return true;
        });
    }, [movementsWithRunningBalance, flowFilter, quickSearch]);

    const pagination = useClientPagination(filteredMovements, 25);

    // Summary KPIs for the current filtered view
    const kpiMetrics = useMemo(() => {
        let entradasKg = 0;
        let entradasCount = 0;
        let salidasKg = 0;
        let salidasCount = 0;
        let ajustesNetoKg = 0;
        let ajustesCount = 0;
        let trasladosCount = 0;
        let anuladosCount = 0;
        const distinctMaterials = new Set<string>();
        const distinctLots = new Set<string>();

        filteredMovements.forEach((m: any) => {
            if (m.itemId) distinctMaterials.add(m.itemId);
            if (m.batch?.lotNumber) distinctLots.add(m.batch.lotNumber);

            if (m.status === 'ANULADO' || m._meta.category === 'ANULACION') {
                anuladosCount++;
            }

            // For real volume metrics, only count active non-cancelled movements (or count net active effect)
            if (m.status === 'ANULADO') return;

            const qty = Number(m.qtyPrincipal || 0);
            const cat = m._meta.category;

            if (cat === 'IN') {
                entradasKg += qty;
                entradasCount++;
            } else if (cat === 'OUT') {
                salidasKg += qty;
                salidasCount++;
            } else if (cat === 'ADJUST') {
                ajustesNetoKg += m._signedQty;
                ajustesCount++;
            } else if (cat === 'TRANSFER') {
                trasladosCount++;
            }
        });

        const balanceNetoPeriodo = entradasKg - salidasKg + ajustesNetoKg;

        return {
            totalMovimientos: filteredMovements.length,
            entradasKg,
            entradasCount,
            salidasKg,
            salidasCount,
            ajustesNetoKg,
            ajustesCount,
            trasladosCount,
            anuladosCount,
            balanceNetoPeriodo,
            distinctMaterialsCount: distinctMaterials.size,
            distinctLotsCount: distinctLots.size,
        };
    }, [filteredMovements]);

    // Chart Data: Evolution over time for selected material or global volume by date
    const chartData = useMemo(() => {
        if (filteredMovements.length === 0) return [];
        const asc = [...filteredMovements].reverse();

        if (itemId) {
            // Group by date showing closing balance and daily entradas/salidas
            const byDate = new Map<string, { fecha: string; label: string; saldo: number; entradas: number; salidas: number }>();
            asc.forEach((m: any) => {
                const dKey = String(m.fecha).slice(0, 10);
                const existing = byDate.get(dKey) || {
                    fecha: dKey,
                    label: formatDateAR(dKey).slice(0, 5),
                    saldo: 0,
                    entradas: 0,
                    salidas: 0,
                };
                if (m._saldoAfter != null) {
                    existing.saldo = Number(m._saldoAfter.toFixed(2));
                }
                if (m.status !== 'ANULADO') {
                    if (m._meta.category === 'IN' || (m._meta.category === 'ADJUST' && m._signedQty > 0)) {
                        existing.entradas = Number((existing.entradas + Number(m.qtyPrincipal || 0)).toFixed(2));
                    } else if (m._meta.category === 'OUT' || (m._meta.category === 'ADJUST' && m._signedQty < 0)) {
                        existing.salidas = Number((existing.salidas + Number(m.qtyPrincipal || 0)).toFixed(2));
                    }
                }
                byDate.set(dKey, existing);
            });
            return Array.from(byDate.values());
        } else {
            // Global daily Entradas vs Salidas
            const byDate = new Map<string, { fecha: string; label: string; entradas: number; salidas: number }>();
            asc.forEach((m: any) => {
                if (m.status === 'ANULADO') return;
                const dKey = String(m.fecha).slice(0, 10);
                const existing = byDate.get(dKey) || {
                    fecha: dKey,
                    label: formatDateAR(dKey).slice(0, 5),
                    entradas: 0,
                    salidas: 0,
                };
                if (m._meta.category === 'IN') {
                    existing.entradas = Number((existing.entradas + Number(m.qtyPrincipal || 0)).toFixed(1));
                } else if (m._meta.category === 'OUT') {
                    existing.salidas = Number((existing.salidas + Number(m.qtyPrincipal || 0)).toFixed(1));
                }
                byDate.set(dKey, existing);
            });
            return Array.from(byDate.values()).slice(-30);
        }
    }, [filteredMovements, itemId]);

    const handleReverse = async (m: any) => {
        const desc = m.item?.descripcion || 'Material';
        const qty = `${Number(m.qtyPrincipal).toFixed(2)} ${m.item?.unidadPrincipal || 'kg'}`;
        if (
            !window.confirm(
                `¿Estás seguro de que querés revertir este movimiento de ${desc} (${qty})?\n\nSe generará una contrapartida automática y el movimiento original quedará marcado como ANULADO.`
            )
        )
            return;
        try {
            await reverseMovement(m.id).unwrap();
            alert('✅ Movimiento revertido con éxito. El stock ha sido ajustado.');
            refetch();
        } catch (e: any) {
            alert(e?.data?.message || 'Error al revertir movimiento');
        }
    };

    const handleViewDocument = async (m: any) => {
        const docId = m.documentoId || m.documento?.id;
        if (!docId) {
            setSelectedMovement(m);
            return;
        }
        const docTipo = (m.documento?.tipo || m.tipo || '').toUpperCase();
        try {
            if (docTipo.includes('SALIDA')) {
                const doc = await triggerGetRemitoSalida(docId).unwrap();
                setSelectedRemito(doc);
                setShowRemitoModal(true);
            } else if (docTipo.includes('ENTRADA')) {
                const doc = await triggerGetRemitoEntrada(docId).unwrap();
                setSelectedRemito(doc);
                setShowRemitoModal(true);
            } else {
                setSelectedMovement(m);
            }
        } catch {
            setSelectedMovement(m);
        }
    };

    const handleExportExcel = () => {
        if (!filteredMovements.length) {
            alert('No hay movimientos para exportar con los filtros actuales.');
            return;
        }

        const rows = filteredMovements.map((m: any) => {
            const meta: TypeMeta = m._meta;
            const partnerName =
                m.documento?.partner?.name ||
                m.batch?.supplier?.name ||
                m.item?.supplier?.name ||
                '—';

            const baseRow: Record<string, any> = {
                'Fecha Doc.': formatDateAR(m.fecha),
                'Fecha/Hora Registro': m.createdAt ? new Date(m.createdAt).toLocaleString('es-AR') : '—',
                'Tipo': meta.label,
                'Estado': m.status,
                'Código Material': m.item?.codigoInterno || '—',
                'Material': m.item?.descripcion || '—',
                'Categoría': m.item?.category?.nombre || m.item?.categoria || m.categoria || '—',
                'Lote / Partida': m.batch?.lotNumber || '—',
                'Depósito': m.deposito?.nombre || m.posicion?.depot?.nombre || '—',
                'Posición': m.posicion?.codigo || 'S/P',
                'Impacto (Signo)': meta.multiplier === 1 ? '+' : meta.multiplier === -1 ? '-' : '',
                'Cantidad Principal': Number(m._signedQty.toFixed(3)),
                'Unidad Principal': m.item?.unidadPrincipal || 'kg',
                'Cantidad Secundaria': m._signedSec != null ? Number(m._signedSec.toFixed(2)) : '',
                'Unidad Secundaria': m.item?.unidadSecundaria || '',
            };

            if (itemId) {
                baseRow['Saldo Anterior'] = m._saldoBefore != null ? Number(m._saldoBefore.toFixed(3)) : '';
                baseRow['Saldo Posterior'] = m._saldoAfter != null ? Number(m._saldoAfter.toFixed(3)) : '';
            }

            baseRow['Documento / Remito'] = m.documentoNumero || m.documento?.numero || '—';
            baseRow['Proveedor / Cliente'] = partnerName;
            baseRow['Usuario'] = m.user?.username || m.user?.nombre || 'Sistema';
            baseRow['Observaciones'] = m.observaciones || '';

            return baseRow;
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        const sheetName = selectedItemObj ? `Kardex_${selectedItemObj.codigoInterno}`.slice(0, 31) : 'Auditoria_Movimientos';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const fileName = selectedItemObj
            ? `Kardex_${selectedItemObj.codigoInterno}_${new Date().toISOString().slice(0, 10)}.xlsx`
            : `Auditoria_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const availablePositions = useMemo(() => {
        if (!depositoId) return [];
        const depot = rawDepots.find((d: any) => d.id === depositoId);
        return (depot?.positions || []).filter((p: any) => p.activo !== false);
    }, [rawDepots, depositoId]);

    if (!canAccess) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2>Acceso Restringido</h2>
                <p>Esta página solo está disponible para administradores y supervisores de depósito.</p>
            </div>
        );
    }

    const unitLabel = selectedItemObj?.unidadPrincipal || 'kg';

    const desktopCols = itemId
        ? ['Fecha / Hora', 'Movimiento', 'Ubicación', 'Lote / Partida', 'Documento / Socio', 'Variación', 'Saldo Resultante', 'Usuario / Obs', '']
        : ['Fecha / Hora', 'Movimiento', 'Material', 'Lote / Partida', 'Ubicación', 'Documento / Socio', 'Cantidad', 'Usuario / Obs', ''];

    const renderDesktopRow = (m: any) => {
        const isAnulado = m.status === 'ANULADO';
        const meta: TypeMeta = m._meta;
        const signedQty = m._signedQty;
        const isPositive = signedQty > 0;
        const qtyColor = isAnulado ? 'var(--text-subtle, #6b7280)' : isPositive ? '#10b981' : '#ef4444';
        const docNum = m.documentoNumero || m.documento?.numero;
        const partnerName =
            m.documento?.partner?.name ||
            m.batch?.supplier?.name ||
            m.item?.supplier?.name;

        const dateCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f3f4f6)' }}>
                    {formatDateAR(m.fecha)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>
                    {formatTimeAR(m.createdAt)}
                </span>
            </div>
        );

        const typeCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                <Badge color={meta.color}>
                    {meta.icon} {meta.shortLabel}
                </Badge>
                {isAnulado && (
                    <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 800, letterSpacing: '0.5px' }}>
                        ⚠️ ANULADO
                    </span>
                )}
            </div>
        );

        const materialCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '240px' }}>
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (m.item?.id) handleSelectItem(m.item.id);
                    }}
                    style={{
                        fontWeight: 700,
                        color: '#818cf8',
                        cursor: 'pointer',
                        whiteSpace: 'normal',
                        lineHeight: '1.25',
                        fontSize: '13px',
                    }}
                    title="Clic para ver todo el historial (Kardex) de este material"
                >
                    {m.item?.descripcion || '—'}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {m.item?.codigoInterno && (
                        <code style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                            {m.item.codigoInterno}
                        </code>
                    )}
                    {(m.item?.category?.nombre || m.item?.categoria || m.categoria) && (
                        <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-muted, #9ca3af)' }}>
                            {m.item?.category?.nombre || m.item?.categoria || m.categoria}
                        </span>
                    )}
                </div>
            </div>
        );

        const lotCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {m.batch?.lotNumber ? (
                    <code
                        onClick={(e) => {
                            e.stopPropagation();
                            setLotNumber(m.batch.lotNumber === lotNumber ? '' : m.batch.lotNumber);
                        }}
                        style={{
                            fontSize: '12px',
                            color: lotNumber === m.batch.lotNumber ? '#fbbf24' : '#a5b4fc',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: 'rgba(165, 180, 252, 0.1)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            width: 'fit-content',
                        }}
                        title="Clic para filtrar por este lote"
                    >
                        Lote: {m.batch.lotNumber}
                    </code>
                ) : (
                    <span style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '12px' }}>Sin lote</span>
                )}
            </div>
        );

        const locationCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                    onClick={(e) => {
                        e.stopPropagation();
                        if (m.posicion?.id) {
                            if (m.posicion?.depositoId) setDepositoId(m.posicion.depositoId);
                            setPosicionId(posicionId === m.posicion.id ? '' : m.posicion.id);
                        }
                    }}
                    style={{
                        fontWeight: 700,
                        color: posicionId === m.posicion?.id ? '#fbbf24' : 'var(--text-primary, #f3f4f6)',
                        cursor: m.posicion?.id ? 'pointer' : 'default',
                        fontSize: '13px',
                    }}
                    title="Clic para filtrar por esta posición"
                >
                    📍 {m.posicion?.codigo || 'S/P'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                    {m.deposito?.nombre || m.posicion?.depot?.nombre || '—'}
                </span>
            </div>
        );

        const docPartnerCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {docNum ? (
                    <span
                        onClick={(e) => {
                            e.stopPropagation();
                            handleViewDocument(m);
                        }}
                        style={{
                            color: '#38bdf8',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                        }}
                        title="Ver documento / remito"
                    >
                        📄 {docNum}
                    </span>
                ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Sin doc.</span>
                )}
                {partnerName && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={partnerName}>
                        🤝 {partnerName}
                    </span>
                )}
            </div>
        );

        const qtyCell = (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span
                    style={{
                        color: qtyColor,
                        fontWeight: 800,
                        fontSize: '14px',
                        textDecoration: isAnulado ? 'line-through' : 'none',
                    }}
                >
                    {isPositive ? '+' : ''}
                    {signedQty.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <small style={{ fontWeight: 600, fontSize: '11px' }}>{m.item?.unidadPrincipal || 'kg'}</small>
                </span>
                {m.qtySecundaria != null && Number(m.qtySecundaria) !== 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                        {isPositive ? '+' : '-'}
                        {Number(m.qtySecundaria).toLocaleString('es-AR')} {m.item?.unidadSecundaria || 'un'}
                    </span>
                )}
            </div>
        );

        const saldoCell = (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {m._saldoAfter != null ? (
                    <>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary, #f3f4f6)', fontSize: '13px' }}>
                            {m._saldoAfter.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <small style={{ fontSize: '10px', color: 'var(--text-muted, #9ca3af)' }}>
                                {m.item?.unidadPrincipal || 'kg'}
                            </small>
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)' }}>
                            Ant: {m._saldoBefore?.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                    </>
                ) : (
                    <span style={{ color: 'var(--text-subtle, #6b7280)' }}>—</span>
                )}
            </div>
        );

        const userObsCell = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '180px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #d1d5db)' }}>
                    👤 {m.user?.username || m.user?.nombre || 'Sistema'}
                </span>
                {m.observaciones ? (
                    <span
                        style={{
                            fontSize: '11px',
                            color: 'var(--text-subtle, #6b7280)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                        title={m.observaciones}
                    >
                        "{m.observaciones}"
                    </span>
                ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-dimmed, #4b5563)' }}>—</span>
                )}
            </div>
        );

        const actions: { label: string; icon: string; color?: string; onClick: () => void }[] = [
            {
                label: 'Ver Detalle Completo',
                icon: '👁️',
                onClick: () => setSelectedMovement(m),
            },
        ];

        if (!itemId && m.item?.id) {
            actions.push({
                label: 'Ver Kardex del Material',
                icon: '📊',
                color: '#818cf8',
                onClick: () => handleSelectItem(m.item.id),
            });
        }

        if (m.batch?.lotNumber && lotNumber !== m.batch.lotNumber) {
            actions.push({
                label: `Seguir Lote "${m.batch.lotNumber}"`,
                icon: '🔢',
                color: '#a5b4fc',
                onClick: () => {
                    setLotNumber(m.batch.lotNumber);
                    if (datePreset === '2d' || datePreset === '7d') applyPreset('all');
                },
            });
        }

        if (docNum) {
            actions.push({
                label: `Abrir Documento (${docNum})`,
                icon: '📄',
                color: '#38bdf8',
                onClick: () => handleViewDocument(m),
            });
        }

        if (!isAnulado && meta.canReverse && canReverse) {
            actions.push({
                label: 'Revertir Movimiento',
                icon: '🔄',
                color: '#ef4444',
                onClick: () => handleReverse(m),
            });
        }

        const actionCell = <ActionMenu options={actions} />;

        if (itemId) {
            return [dateCell, typeCell, locationCell, lotCell, docPartnerCell, qtyCell, saldoCell, userObsCell, actionCell];
        }
        return [dateCell, typeCell, materialCell, lotCell, locationCell, docPartnerCell, qtyCell, userObsCell, actionCell];
    };

    const renderMobileCard = (m: any) => {
        const isAnulado = m.status === 'ANULADO';
        const meta: TypeMeta = m._meta;
        const signedQty = m._signedQty;
        const isPositive = signedQty > 0;
        const qtyColor = isAnulado ? 'var(--text-subtle, #6b7280)' : isPositive ? '#10b981' : '#ef4444';
        const docNum = m.documentoNumero || m.documento?.numero;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} onClick={() => setSelectedMovement(m)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge color={meta.color}>
                            {meta.icon} {meta.shortLabel}
                        </Badge>
                        <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px', fontWeight: 600 }}>
                            {formatDateAR(m.fecha)} {formatTimeAR(m.createdAt)}
                        </span>
                    </div>
                    {isAnulado && <Badge color="#ef4444">ANULADO</Badge>}
                </div>

                {!itemId && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            if (m.item?.id) handleSelectItem(m.item.id);
                        }}
                        style={{ fontWeight: 700, color: '#818cf8', fontSize: '14px' }}
                    >
                        {m.item?.descripcion || '—'}{' '}
                        {m.item?.codigoInterno && (
                            <code style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                                ({m.item.codigoInterno})
                            </code>
                        )}
                    </div>
                )}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: itemId ? '1fr 1fr 1fr' : '1fr 1fr',
                        gap: '8px',
                        background: 'var(--bg-alt-row, rgba(0,0,0,0.25))',
                        padding: '10px',
                        borderRadius: '8px',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                            Variación
                        </div>
                        <div style={{ fontWeight: 800, color: qtyColor, fontSize: '14px' }}>
                            {isPositive ? '+' : ''}
                            {signedQty.toFixed(2)} {m.item?.unidadPrincipal || 'kg'}
                        </div>
                    </div>
                    {itemId && m._saldoAfter != null && (
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                Saldo
                            </div>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary, #f3f4f6)', fontSize: '14px' }}>
                                {m._saldoAfter.toFixed(2)} {m.item?.unidadPrincipal || 'kg'}
                            </div>
                        </div>
                    )}
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                            Lote
                        </div>
                        <code style={{ color: '#a5b4fc', fontWeight: 700 }}>{m.batch?.lotNumber || '—'}</code>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted, #9ca3af)', flexWrap: 'wrap', gap: '6px' }}>
                    <span>
                        📍 {m.deposito?.nombre || m.posicion?.depot?.nombre} - <strong>{m.posicion?.codigo || 'S/P'}</strong>
                    </span>
                    {docNum && <span style={{ color: '#38bdf8', fontWeight: 700 }}>📄 {docNum}</span>}
                    <span>👤 {m.user?.username || 'Sistema'}</span>
                </div>

                {m.observaciones && (
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', fontStyle: 'italic' }}>
                        "{m.observaciones}"
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1460px', margin: '0 auto' }}>
            <style>{`
                .audit-kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 14px;
                    margin-bottom: 20px;
                }
                .preset-chip {
                    background: var(--bg-primary, #0f1117);
                    border: 1px solid var(--border-strong, #374151);
                    color: var(--text-muted, #9ca3af);
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .preset-chip:hover {
                    border-color: #6366f1;
                    color: var(--text-primary, #f3f4f6);
                }
                .preset-chip.active {
                    background: rgba(99, 102, 241, 0.18);
                    border-color: #6366f1;
                    color: #a5b4fc;
                }
                .flow-tab {
                    background: transparent;
                    border: 1px solid var(--border-color, #2a2d3e);
                    color: var(--text-muted, #9ca3af);
                    padding: 7px 14px;
                    border-radius: 99px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .flow-tab.active {
                    background: #6366f1;
                    border-color: #6366f1;
                    color: #ffffff;
                }
                .date-input-audit {
                    background: var(--bg-primary, #0f1117);
                    border: 1px solid var(--border-strong, #374151);
                    border-radius: 8px;
                    color: var(--text-primary, #f3f4f6);
                    padding: 7px 10px;
                    font-size: 13px;
                    outline: none;
                    box-sizing: border-box;
                }
                .date-input-audit:focus {
                    border-color: #6366f1;
                }
            `}</style>

            <PageHeader
                title="🛡️ Auditoría e Historial de Stock (Kardex)"
                subtitle="Trazabilidad completa de movimientos por material, partida, posición y documento"
            >
                <Btn variant="secondary" onClick={() => refetch()}>
                    🔄 Actualizar
                </Btn>
                <Btn onClick={handleExportExcel} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                    📥 Exportar Excel ({filteredMovements.length})
                </Btn>
            </PageHeader>

            {/* ── SECCIÓN DESTACADA: BUSCADOR RÁPIDO DE MATERIAL (KARDEX) ── */}
            <Card
                style={{
                    marginBottom: '20px',
                    padding: isMobile ? '14px' : '18px 20px',
                    background: itemId
                        ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(26, 29, 46, 0.95) 100%)'
                        : 'var(--bg-secondary, #1a1d2e)',
                    border: itemId ? '1px solid rgba(99, 102, 241, 0.45)' : '1px solid var(--border-color, #2a2d3e)',
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr auto',
                        gap: '14px',
                        alignItems: 'flex-end',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                            🔎 Investigar Historial Completo de un Material (Kardex)
                        </div>
                        <SearchSelect
                            value={itemId}
                            onChange={handleSelectItem}
                            options={[
                                { value: '', label: '— Todos los materiales (Vista Global) —' },
                                ...rawItems.map((i: any) => ({
                                    value: i.id,
                                    label: `${i.category?.nombre || i.categoria ? `[${i.category?.nombre || i.categoria}] ` : ''}${i.codigoInterno} - ${i.descripcion}`,
                                })),
                            ]}
                            placeholder="Escribí código o nombre del material para ver todos sus movimientos históricos..."
                        />
                    </div>

                    <Input
                        label="🔍 Búsqueda instantánea (Lote, Remito, Posición, Usuario, Obs...)"
                        placeholder="Ej: Lote 450, Remito 0001, A-01, Juan..."
                        value={quickSearch}
                        onChange={setQuickSearch}
                    />

                    {(itemId || lotNumber || depositoId || posicionId || tipo || statusFilter || quickSearch || flowFilter !== 'ALL') && (
                        <Btn variant="secondary" onClick={handleClearAllFilters} style={{ height: '37px' }}>
                            ✕ Limpiar Filtros
                        </Btn>
                    )}
                </div>

                {/* RANGO DE FECHAS CON BOTONES RÁPIDOS + FILTROS SECUNDARIOS */}
                <div
                    style={{
                        marginTop: '16px',
                        paddingTop: '14px',
                        borderTop: '1px solid var(--border-subtle, #1e2133)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', fontWeight: 700, marginRight: '4px' }}>
                                📅 Período:
                            </span>
                            {(
                                [
                                    { id: '2d', label: 'Últimos 2 días' },
                                    { id: '7d', label: '7 días' },
                                    { id: '30d', label: '30 días' },
                                    { id: '90d', label: '90 días' },
                                    { id: 'year', label: `Año ${new Date().getFullYear()}` },
                                    { id: 'all', label: '♾️ Todo el Historial' },
                                ] as { id: DatePreset; label: string }[]
                            ).map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`preset-chip ${datePreset === p.id ? 'active' : ''}`}
                                    onClick={() => applyPreset(p.id)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>Desde:</span>
                                <input
                                    type="date"
                                    className="date-input-audit"
                                    value={desde}
                                    onChange={(e) => {
                                        setDesde(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>Hasta:</span>
                                <input
                                    type="date"
                                    className="date-input-audit"
                                    value={hasta}
                                    onChange={(e) => {
                                        setHasta(e.target.value);
                                        setDatePreset('custom');
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Secondary Filters Row */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(5, 1fr)',
                            gap: '10px',
                            alignItems: 'flex-end',
                        }}
                    >
                        <Select
                            label="🏢 Depósito"
                            value={depositoId}
                            onChange={(val) => {
                                setDepositoId(val);
                                setPosicionId('');
                            }}
                            options={[
                                { value: '', label: 'Todos los depósitos' },
                                ...rawDepots
                                    .filter((d: any) => d.activo !== false)
                                    .map((d: any) => ({ value: d.id, label: d.nombre })),
                            ]}
                        />
                        <SearchSelect
                            label="📍 Posición"
                            value={posicionId}
                            onChange={setPosicionId}
                            disabled={!depositoId}
                            options={[
                                { value: '', label: 'Todas las posiciones' },
                                ...availablePositions.map((p: any) => ({ value: p.id, label: p.codigo })),
                            ]}
                            placeholder={depositoId ? 'Buscar posición...' : 'Elegí un depósito primero'}
                        />
                        <Input
                            label="🔢 Lote / Partida exacta o parcial"
                            placeholder="Filtrar lote..."
                            value={lotNumber}
                            onChange={setLotNumber}
                        />
                        <Select
                            label="⚙️ Tipo Específico"
                            value={tipo}
                            onChange={setTipo}
                            options={[
                                { value: '', label: 'Todos los tipos' },
                                { value: 'REMITO_ENTRADA', label: '📥 ENTRADA (Remito)' },
                                { value: 'REMITO_SALIDA', label: '📤 SALIDA (Remito)' },
                                { value: 'AJUSTE_SUMA', label: '➕ AJUSTE (+)' },
                                { value: 'AJUSTE_RESTA', label: '➖ AJUSTE (-)' },
                                { value: 'MOVE_INTERNO', label: '🔄 TRASLADO INTERNO' },
                                { value: 'ENTREGA_PRODUCCION', label: '🏭 ENTREGA PRODUCCIÓN' },
                                { value: 'DEVOLUCION_LINEA', label: '↩️ DEVOLUCIÓN LÍNEA' },
                                { value: 'INGRESO_PRODUCCION', label: '⚙️ INGRESO PRODUCCIÓN' },
                                { value: 'ANULACION_ENTRADA', label: '🚫 ANUL. ENTRADA' },
                                { value: 'ANULACION_SALIDA', label: '🚫 ANUL. SALIDA' },
                                { value: 'ANULACION_AJUSTE_SUMA', label: '🚫 ANUL. AJUSTE (+)' },
                                { value: 'ANULACION_AJUSTE_RESTA', label: '🚫 ANUL. AJUSTE (-)' },
                            ]}
                        />
                        <Select
                            label="🛡️ Estado del Movimiento"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={[
                                { value: '', label: 'Todos (Activos + Anulados)' },
                                { value: 'ACTIVO', label: '✅ Solo Activos' },
                                { value: 'ANULADO', label: '🚫 Solo Anulados' },
                            ]}
                        />
                    </div>
                </div>
            </Card>

            {/* ── FICHA DE KARDEX DEL MATERIAL SELECCIONADO ── */}
            {itemId && selectedItemObj && (
                <Card
                    style={{
                        marginBottom: '20px',
                        padding: '18px 20px',
                        background: 'var(--bg-secondary, #1a1d2e)',
                        border: '1px solid rgba(99, 102, 241, 0.35)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px',
                            marginBottom: '16px',
                            paddingBottom: '14px',
                            borderBottom: '1px solid var(--border-subtle, #1e2133)',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <Badge color="#6366f1">FICHA KARDEX DEL MATERIAL</Badge>
                                <code style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: 800 }}>
                                    {selectedItemObj.codigoInterno}
                                </code>
                                {(selectedItemObj.category?.nombre || selectedItemObj.categoria) && (
                                    <Badge color="#38bdf8">
                                        {selectedItemObj.category?.nombre || selectedItemObj.categoria}
                                    </Badge>
                                )}
                            </div>
                            <h2 style={{ margin: '6px 0 4px', fontSize: isMobile ? '17px' : '20px', fontWeight: 800, color: 'var(--text-primary, #f3f4f6)' }}>
                                {selectedItemObj.descripcion}
                            </h2>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>
                                Proveedor habitual: <strong>{selectedItemObj.supplier?.name || 'No especificado'}</strong>
                                {selectedItemObj.stockMinimo != null && (
                                    <>
                                        {' '}
                                        &middot; Stock Mínimo: <strong>{Number(selectedItemObj.stockMinimo).toLocaleString('es-AR')} {unitLabel}</strong>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <Btn
                                small
                                variant="secondary"
                                onClick={() => navigate(`/stock?q=${encodeURIComponent(selectedItemObj.descripcion)}`)}
                            >
                                📦 Ver en Gestión de Stock
                            </Btn>
                            <Btn
                                small
                                variant="secondary"
                                onClick={() => handleSelectItem('')}
                            >
                                ✕ Cerrar Ficha Material
                            </Btn>
                        </div>
                    </div>

                    {/* Distribucion actual de stock del material */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '16px', alignItems: 'stretch' }}>
                        {/* Grafico de evolucion del saldo del material */}
                        <div
                            style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border-subtle, #1e2133)',
                                borderRadius: '10px',
                                padding: '14px',
                            }}
                        >
                            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted, #9ca3af)', marginBottom: '10px', textTransform: 'uppercase' }}>
                                📈 Evolución del Saldo Histórico ({unitLabel})
                            </div>
                            {chartData.length > 1 ? (
                                <div style={{ width: '100%', height: '170px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.45} />
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} />
                                            <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} />
                                            <RechartsTooltip
                                                contentStyle={{
                                                    backgroundColor: '#1a1d2e',
                                                    borderColor: '#374151',
                                                    borderRadius: 8,
                                                    color: '#fff',
                                                    fontSize: '12px',
                                                }}
                                                formatter={(val: any, name: any) => [
                                                    `${Number(val).toLocaleString('es-AR')} ${unitLabel}`,
                                                    name === 'saldo' ? 'Saldo al cierre' : name,
                                                ]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="saldo"
                                                stroke="#818cf8"
                                                strokeWidth={2.5}
                                                fillOpacity={1}
                                                fill="url(#colorSaldo)"
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div style={{ height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle, #6b7280)', fontSize: '12px' }}>
                                    Seleccioná un rango con más fechas para visualizar la curva de evolución.
                                </div>
                            )}
                        </div>

                        {/* Ubicaciones actuales en stock */}
                        <div
                            style={{
                                background: 'rgba(0,0,0,0.2)',
                                border: '1px solid var(--border-subtle, #1e2133)',
                                borderRadius: '10px',
                                padding: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase' }}>
                                    📍 Stock Físico Actual por Posición ({itemStockSummary.positions.length})
                                </span>
                                <span style={{ fontSize: '14px', fontWeight: 900, color: '#38bdf8' }}>
                                    Total Hoy: {itemStockSummary.totalPrincipal.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} {unitLabel}
                                </span>
                            </div>

                            {itemStockSummary.positions.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle, #6b7280)', fontSize: '12px', padding: '20px' }}>
                                    Este material no tiene stock físico activo en este momento (0 {unitLabel}).
                                </div>
                            ) : (
                                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {itemStockSummary.positions.map((pos) => (
                                        <div
                                            key={pos.id}
                                            onClick={() => setLotNumber(lotNumber === pos.lotNumber ? '' : pos.lotNumber)}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '7px 10px',
                                                background: lotNumber === pos.lotNumber ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                                                border: '1px solid var(--border-subtle, #1e2133)',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }}
                                            title="Clic para filtrar los movimientos de este lote"
                                        >
                                            <div>
                                                <strong style={{ color: '#a5b4fc' }}>📍 {pos.codigo}</strong>{' '}
                                                <span style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '11px' }}>({pos.deposito})</span>
                                                <span style={{ marginLeft: '8px', color: '#fbbf24', fontFamily: 'monospace', fontSize: '11px' }}>
                                                    Lote: {pos.lotNumber}
                                                </span>
                                            </div>
                                            <div style={{ fontWeight: 800, color: '#10b981' }}>
                                                {pos.qtyPrincipal.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} {unitLabel}
                                                {pos.qtySecundaria > 0 && (
                                                    <span style={{ color: 'var(--text-muted, #9ca3af)', fontWeight: 500, fontSize: '11px', marginLeft: '6px' }}>
                                                        ({pos.qtySecundaria} {selectedItemObj.unidadSecundaria || 'un'})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* ── KPIS RESUMEN DEL PERÍODO FILTRADO ── */}
            <div className="audit-kpi-grid">
                <Card style={{ padding: '14px 16px', borderLeft: '4px solid #10b981' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 700, textTransform: 'uppercase' }}>
                        📥 Total Entradas (Período)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                        +{kpiMetrics.entradasKg.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '12px', fontWeight: 600 }}>{unitLabel}</small>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', marginTop: '2px' }}>
                        En {kpiMetrics.entradasCount} movimientos de ingreso
                    </div>
                </Card>

                <Card style={{ padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 700, textTransform: 'uppercase' }}>
                        📤 Total Salidas (Período)
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                        -{kpiMetrics.salidasKg.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '12px', fontWeight: 600 }}>{unitLabel}</small>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', marginTop: '2px' }}>
                        En {kpiMetrics.salidasCount} despachos / entregas
                    </div>
                </Card>

                <Card style={{ padding: '14px 16px', borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 700, textTransform: 'uppercase' }}>
                        ⚖️ Ajustes Manuales (Neto)
                    </div>
                    <div
                        style={{
                            fontSize: '20px',
                            fontWeight: 900,
                            color: kpiMetrics.ajustesNetoKg >= 0 ? '#3b82f6' : '#f59e0b',
                            marginTop: '4px',
                        }}
                    >
                        {kpiMetrics.ajustesNetoKg > 0 ? '+' : ''}
                        {kpiMetrics.ajustesNetoKg.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '12px', fontWeight: 600 }}>{unitLabel}</small>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', marginTop: '2px' }}>
                        {kpiMetrics.ajustesCount} ajustes &middot; {kpiMetrics.trasladosCount} traslados internos
                    </div>
                </Card>

                <Card style={{ padding: '14px 16px', borderLeft: '4px solid #818cf8' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 700, textTransform: 'uppercase' }}>
                        📊 Variación Neta Período
                    </div>
                    <div
                        style={{
                            fontSize: '20px',
                            fontWeight: 900,
                            color: kpiMetrics.balanceNetoPeriodo >= 0 ? '#a5b4fc' : '#f87171',
                            marginTop: '4px',
                        }}
                    >
                        {kpiMetrics.balanceNetoPeriodo > 0 ? '+' : ''}
                        {kpiMetrics.balanceNetoPeriodo.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '12px', fontWeight: 600 }}>{unitLabel}</small>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', marginTop: '2px' }}>
                        {kpiMetrics.totalMovimientos} registros ({kpiMetrics.distinctMaterialsCount} mat. / {kpiMetrics.distinctLotsCount} lotes)
                    </div>
                </Card>
            </div>

            {/* ── GRÁFICO GLOBAL CUANDO NO HAY MATERIAL SELECCIONADO ── */}
            {!itemId && chartData.length > 1 && (
                <Card style={{ marginBottom: '20px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase' }}>
                            📊 Flujo Diario de Entradas vs. Salidas (Período Seleccionado)
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>
                            Hacé clic en cualquier material de la tabla para abrir su Kardex individual
                        </span>
                    </div>
                    <div style={{ width: '100%', height: '170px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} />
                                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} />
                                <RechartsTooltip
                                    contentStyle={{
                                        backgroundColor: '#1a1d2e',
                                        borderColor: '#374151',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: '12px',
                                    }}
                                />
                                <Bar dataKey="entradas" name="Entradas (+)" fill="#10b981" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="salidas" name="Salidas (-)" fill="#ef4444" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            {/* ── TABS RÁPIDOS DE TIPO DE FLUJO ── */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '14px',
                }}
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(
                        [
                            { id: 'ALL', label: `Todos (${movementsWithRunningBalance.length})`, icon: '📋' },
                            { id: 'IN', label: 'Entradas', icon: '📥' },
                            { id: 'OUT', label: 'Salidas', icon: '📤' },
                            { id: 'ADJUST', label: 'Ajustes Manuales', icon: '⚖️' },
                            { id: 'TRANSFER', label: 'Traslados Internos', icon: '🔄' },
                            { id: 'CANCELLED', label: 'Anulaciones', icon: '🚫' },
                        ] as { id: FlowFilter; label: string; icon: string }[]
                    ).map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`flow-tab ${flowFilter === tab.id ? 'active' : ''}`}
                            onClick={() => {
                                setFlowFilter(tab.id);
                                pagination.setPage(0);
                            }}
                        >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Active filter pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {lotNumber && (
                        <Badge color="#fbbf24">
                            Lote: {lotNumber}{' '}
                            <span style={{ cursor: 'pointer', marginLeft: '4px' }} onClick={() => setLotNumber('')}>
                                ✕
                            </span>
                        </Badge>
                    )}
                    {posicionId && (
                        <Badge color="#38bdf8">
                            Posición filtrada{' '}
                            <span style={{ cursor: 'pointer', marginLeft: '4px' }} onClick={() => setPosicionId('')}>
                                ✕
                            </span>
                        </Badge>
                    )}
                </div>
            </div>

            {/* ── TABLA PRINCIPAL DE MOVIMIENTOS / KARDEX ── */}
            <Card style={{ padding: isMobile ? '12px' : '0' }}>
                <ResponsiveTable
                    loading={isFetching}
                    data={pagination.pageItems}
                    desktopCols={desktopCols}
                    renderDesktopRow={renderDesktopRow}
                    renderMobileCard={renderMobileCard}
                />
            </Card>

            <PaginationControls
                count={filteredMovements.length}
                page={pagination.page}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={(value) => {
                    pagination.setPageSize(value);
                    pagination.setPage(0);
                }}
            />

            {/* ── MODAL DE DETALLE COMPLETO DEL MOVIMIENTO ── */}
            {selectedMovement && (
                <Modal
                    title="🔎 Ficha de Auditoría del Movimiento"
                    onClose={() => setSelectedMovement(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px',
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '10px',
                                border: '1px solid var(--border-color, #2a2d3e)',
                            }}
                        >
                            <Badge color={selectedMovement._meta?.color || '#6366f1'}>
                                {selectedMovement._meta?.icon} {selectedMovement._meta?.label || selectedMovement.tipo}
                            </Badge>
                            <Badge color={selectedMovement.status === 'ANULADO' ? '#ef4444' : '#10b981'}>
                                {selectedMovement.status}
                            </Badge>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Fecha Operativa
                                </div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary, #f3f4f6)' }}>
                                    {formatDateAR(selectedMovement.fecha)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Timestamp Exacto
                                </div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary, #f3f4f6)' }}>
                                    {selectedMovement.createdAt ? new Date(selectedMovement.createdAt).toLocaleString('es-AR') : '—'}
                                </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Material
                                </div>
                                <div style={{ fontWeight: 800, color: '#818cf8', fontSize: '15px' }}>
                                    {selectedMovement.item?.codigoInterno} — {selectedMovement.item?.descripcion}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Partida / Lote
                                </div>
                                <code style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '13px' }}>
                                    {selectedMovement.batch?.lotNumber || 'Sin lote'}
                                </code>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Depósito y Posición
                                </div>
                                <div style={{ fontWeight: 700 }}>
                                    {selectedMovement.deposito?.nombre || selectedMovement.posicion?.depot?.nombre || '—'} &middot;{' '}
                                    <span style={{ color: '#38bdf8' }}>📍 {selectedMovement.posicion?.codigo || 'S/P'}</span>
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Cantidad Principal
                                </div>
                                <div
                                    style={{
                                        fontWeight: 900,
                                        fontSize: '16px',
                                        color: (selectedMovement._signedQty || 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}
                                >
                                    {(selectedMovement._signedQty || 0) > 0 ? '+' : ''}
                                    {Number(selectedMovement._signedQty ?? selectedMovement.qtyPrincipal).toLocaleString('es-AR', {
                                        minimumFractionDigits: 2,
                                    })}{' '}
                                    {selectedMovement.item?.unidadPrincipal || 'kg'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Cantidad Secundaria
                                </div>
                                <div style={{ fontWeight: 700 }}>
                                    {selectedMovement.qtySecundaria != null
                                        ? `${Number(selectedMovement.qtySecundaria).toLocaleString('es-AR')} ${selectedMovement.item?.unidadSecundaria || 'un'}`
                                        : '—'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Usuario Responsable
                                </div>
                                <div style={{ fontWeight: 700 }}>
                                    👤 {selectedMovement.user?.username || selectedMovement.user?.nombre || 'Sistema'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Documento / Remito
                                </div>
                                <div style={{ fontWeight: 700, color: '#38bdf8' }}>
                                    {selectedMovement.documentoNumero || selectedMovement.documento?.numero || '—'}
                                </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase' }}>
                                    Observaciones Registradas
                                </div>
                                <div
                                    style={{
                                        marginTop: '4px',
                                        padding: '10px',
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '8px',
                                        color: 'var(--text-secondary, #d1d5db)',
                                    }}
                                >
                                    {selectedMovement.observaciones || 'Sin observaciones'}
                                </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-dimmed, #4b5563)' }}>
                                    ID Movimiento: <code>{selectedMovement.id}</code>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {selectedMovement.item?.id && itemId !== selectedMovement.item.id && (
                                    <Btn
                                        small
                                        variant="secondary"
                                        onClick={() => {
                                            handleSelectItem(selectedMovement.item.id);
                                            setSelectedMovement(null);
                                        }}
                                    >
                                        📊 Ver Todo el Historial de este Material
                                    </Btn>
                                )}
                                {selectedMovement.status !== 'ANULADO' &&
                                    selectedMovement._meta?.canReverse &&
                                    canReverse && (
                                        <Btn
                                            small
                                            variant="danger"
                                            onClick={() => {
                                                const mov = selectedMovement;
                                                setSelectedMovement(null);
                                                handleReverse(mov);
                                            }}
                                        >
                                            🔄 Revertir Movimiento
                                        </Btn>
                                    )}
                            </div>
                            <Btn small onClick={() => setSelectedMovement(null)}>
                                Cerrar
                            </Btn>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ── MODAL DE DETALLE DE REMITO ASOCIADO ── */}
            <RemitoDetailModal
                open={showRemitoModal}
                onClose={() => setShowRemitoModal(false)}
                remito={selectedRemito}
            />
        </div>
    );
}
