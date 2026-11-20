import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
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

type DatePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
type FlowFilter = 'ALL' | 'REAL_ADJUST' | 'IN' | 'OUT' | 'TRANSFER';

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

function getMovementImpactSign(tipo: string): 1 | -1 | 0 {
    switch (tipo) {
        case 'REMITO_ENTRADA':
        case 'AJUSTE_SUMA':
        case 'ANULACION_SALIDA':
        case 'ANULACION_AJUSTE_RESTA':
        case 'ANULACION_ENTREGA_PRODUCCION':
        case 'DEVOLUCION_LINEA':
        case 'INGRESO_PRODUCCION':
            return 1;
        case 'REMITO_SALIDA':
        case 'AJUSTE_RESTA':
        case 'ANULACION_ENTRADA':
        case 'ANULACION_AJUSTE_SUMA':
        case 'ENTREGA_PRODUCCION':
        case 'ANULACION_DEVOLUCION_LINEA':
        case 'ANULACION_INGRESO_PRODUCCION':
            return -1;
        default:
            return 0;
    }
}

export default function AdminMovementsPage() {
    const isMobile = useIsMobile();
    const [searchParams, setSearchParams] = useSearchParams();

    const user = useSelector(selectCurrentUser);
    const userSector = useSelector(selectUserSector);
    const role = user?.role?.toUpperCase() || '';
    const sector = (userSector || user?.sector || '').toUpperCase();
    const isAdmin = role === 'ADMIN';
    const isSupervisor = role === 'SUPERVISOR';
    const canAccess = isAdmin || sector.includes('DEPOSITO') || isSupervisor;
    const canReverse = isAdmin || (isSupervisor && sector.includes('DEPOSITO'));

    // URL params
    const initialItemId = searchParams.get('itemId') || '';
    const initialPreset: DatePreset = initialItemId ? 'all' : '30d';

    const [datePreset, setDatePreset] = useState<DatePreset>(initialPreset);
    const [desde, setDesde] = useState<string>(() => (initialPreset === 'all' ? '' : getIsoDateDaysAgo(30)));
    const [hasta, setHasta] = useState<string>(() => (initialPreset === 'all' ? '' : new Date().toISOString().split('T')[0]));
    const [showCustomDates, setShowCustomDates] = useState(false);
    const [depositoId, setDepositoId] = useState<string>('');
    const [itemId, setItemId] = useState<string>(initialItemId);
    const [quickSearch, setQuickSearch] = useState<string>('');
    const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');

    // Modals
    const [selectedMovement, setSelectedMovement] = useState<any | null>(null);
    const [selectedRemito, setSelectedRemito] = useState<any | null>(null);
    const [showRemitoModal, setShowRemitoModal] = useState(false);

    const [triggerGetRemitoSalida] = useLazyGetRemitoSalidaQuery();
    const [triggerGetRemitoEntrada] = useLazyGetRemitoEntradaQuery();

    const { data: rawDepots = [] } = useGetDepotsQuery();
    const { data: rawItems = [] } = useGetItemsQuery({});

    useEffect(() => {
        const urlItem = searchParams.get('itemId');
        if (urlItem && urlItem !== itemId) {
            setItemId(urlItem);
            setDatePreset('all');
            setDesde('');
            setHasta('');
        }
    }, [searchParams]);

    const applyPreset = (preset: DatePreset) => {
        setDatePreset(preset);
        if (preset === 'custom') {
            setShowCustomDates(true);
            return;
        }
        setShowCustomDates(false);
        const today = new Date().toISOString().split('T')[0];
        if (preset === '7d') {
            setDesde(getIsoDateDaysAgo(7));
            setHasta(today);
        } else if (preset === '30d') {
            setDesde(getIsoDateDaysAgo(30));
            setHasta(today);
        } else if (preset === '90d') {
            setDesde(getIsoDateDaysAgo(90));
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
            applyPreset('all');
        } else {
            nextParams.delete('itemId');
            if (datePreset === 'all') applyPreset('30d');
        }
        setSearchParams(nextParams, { replace: true });
    };

    const { data: movements = [], isFetching, refetch } = useGetRecentMovementsQuery({
        desde: desde || undefined,
        hasta: hasta || undefined,
        depositoId: depositoId || undefined,
        itemId: itemId || undefined,
    });

    const { data: currentItemStock = [] } = useGetStockQuery(
        { itemId: itemId || undefined, depotId: depositoId || undefined },
        { skip: !itemId }
    );

    const [reverseMovement] = useReverseMovementMutation();

    const selectedItemObj = useMemo(() => {
        if (!itemId) return null;
        return rawItems.find((i: any) => i.id === itemId) || movements[0]?.item || null;
    }, [itemId, rawItems, movements]);

    const currentStockTotal = useMemo(() => {
        if (!itemId) return 0;
        return currentItemStock.reduce((acc: number, s: any) => acc + Number(s.qtyPrincipal || 0), 0);
    }, [itemId, currentItemStock]);

    /**
     * MOTOR DE CLASIFICACIÓN INTELIGENTE Y EMPAREJAMIENTO DE CONTRAPARTIDAS (-250 / +250):
     * Detecta cuando un AJUSTE_RESTA y un AJUSTE_SUMA son en realidad las dos mitades de un
     * movimiento interno entre posiciones o una fusión/cambio de lote, los une en un solo registro
     * de TRASLADO y deja limpios los AJUSTES REALES (sin contrapartida: adición rápida, corrección manual o eliminación).
     */
    const processedData = useMemo(() => {
        const sortedDesc = [...movements].sort((a: any, b: any) => {
            const dDiff = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
            if (dDiff !== 0) return dDiff;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        const adjustCandidates = sortedDesc.filter(
            (m: any) => m.tipo === 'AJUSTE_SUMA' || m.tipo === 'AJUSTE_RESTA'
        );

        const pairedIds = new Set<string>();
        const pairPartnerMap = new Map<string, any>(); // id -> counterpart movement

        for (let i = 0; i < adjustCandidates.length; i++) {
            const a = adjustCandidates[i];
            if (pairedIds.has(a.id)) continue;

            const aTime = new Date(a.createdAt || a.fecha).getTime();
            const aQty = Number(a.qtyPrincipal || 0);

            for (let j = i + 1; j < adjustCandidates.length; j++) {
                const b = adjustCandidates[j];
                if (pairedIds.has(b.id)) continue;
                if (a.tipo === b.tipo) continue; // Debe ser uno SUMA y otro RESTA
                if (a.itemId !== b.itemId) continue; // Mismo material

                const bQty = Number(b.qtyPrincipal || 0);
                if (Math.abs(aQty - bQty) > 0.005) continue; // Misma cantidad exacta (ej. -250 y +250)

                const bTime = new Date(b.createdAt || b.fecha).getTime();
                const timeDiffSec = Math.abs(aTime - bTime) / 1000;
                const sameDoc = a.documentoId && b.documentoId && a.documentoId === b.documentoId;

                // Si comparten documento BK-* o fueron ejecutados con menos de 15 segundos de diferencia
                if (sameDoc || timeDiffSec <= 15) {
                    pairedIds.add(a.id);
                    pairedIds.add(b.id);
                    pairPartnerMap.set(a.id, b);
                    pairPartnerMap.set(b.id, a);
                    break;
                }
            }
        }

        // Calcular saldo resultante (Kardex) cuando hay un material seleccionado
        // Si miramos un material sin filtro de posición, un traslado interno (-250 y +250) tiene efecto neto 0 en el stock total del material.
        const todayStr = new Date().toISOString().split('T')[0];
        const isAnchoredToToday = !hasta || hasta >= todayStr;
        const saldoMap = new Map<string, { before: number; after: number }>();

        if (itemId) {
            if (isAnchoredToToday) {
                let running = currentStockTotal;
                sortedDesc.forEach((m: any) => {
                    const sign = getMovementImpactSign(m.tipo);
                    const delta = Number(m.qtyPrincipal || 0) * sign;
                    const after = running;
                    const before = running - delta;
                    running = before;
                    saldoMap.set(m.id, { before, after });
                });
            } else {
                const asc = [...sortedDesc].reverse();
                let running = 0;
                asc.forEach((m: any) => {
                    const sign = getMovementImpactSign(m.tipo);
                    const delta = Number(m.qtyPrincipal || 0) * sign;
                    const before = running;
                    const after = running + delta;
                    running = after;
                    saldoMap.set(m.id, { before, after });
                });
            }
        }

        // Construir lista final consolidando los pares (-250 / +250) en una sola fila de TRASLADO
        const consumedInUnifiedRow = new Set<string>();
        const rows: any[] = [];

        for (const m of sortedDesc) {
            if (consumedInUnifiedRow.has(m.id)) continue;

            const obsLower = (m.observaciones || '').toLowerCase();
            const isExplicitInternalObs =
                obsLower.includes('movimiento interno') || obsLower.includes('reasignación de partida');

            // Caso 1: Par detectado (-250 y +250) -> Lo unificamos en 1 sola fila limpia de TRASLADO
            if (pairedIds.has(m.id)) {
                const partner = pairPartnerMap.get(m.id);
                consumedInUnifiedRow.add(m.id);
                if (partner) consumedInUnifiedRow.add(partner.id);

                const outMov = m.tipo === 'AJUSTE_RESTA' ? m : partner;
                const inMov = m.tipo === 'AJUSTE_SUMA' ? m : partner;

                const originPos = outMov?.posicion?.codigo || 'Origen';
                const destPos = inMov?.posicion?.codigo || 'Destino';
                const originLot = outMov?.batch?.lotNumber;
                const destLot = inMov?.batch?.lotNumber;
                const isLotReassign = originPos === destPos && originLot !== destLot;

                // Tomamos el saldo posterior al par completo
                const saldosIn = inMov ? saldoMap.get(inMov.id) : null;
                const saldosOut = outMov ? saldoMap.get(outMov.id) : null;
                const unifiedSaldoAfter = saldosIn && saldosOut ? Math.max(saldosIn.after, saldosOut.after) : saldosIn?.after ?? null;

                rows.push({
                    ...m,
                    _category: 'TRANSFER' as const,
                    _isRealAdjust: false,
                    _isPairedTransfer: true,
                    _originPos: originPos,
                    _destPos: destPos,
                    _originDepot: outMov?.deposito?.nombre || outMov?.posicion?.depot?.nombre,
                    _destDepot: inMov?.deposito?.nombre || inMov?.posicion?.depot?.nombre,
                    _originLot: originLot,
                    _destLot: destLot,
                    _isLotReassign: isLotReassign,
                    _badgeLabel: isLotReassign ? 'CAMBIO LOTE' : 'TRASLADO',
                    _badgeIcon: '🔄',
                    _badgeColor: '#6366f1',
                    _signedQty: Number(m.qtyPrincipal || 0),
                    _saldoAfter: unifiedSaldoAfter,
                });
                continue;
            }

            // Caso 2: Tiene observación de movimiento interno pero su contrapartida quedó fuera del filtro (ej. otro depósito)
            if ((m.tipo === 'AJUSTE_SUMA' || m.tipo === 'AJUSTE_RESTA') && isExplicitInternalObs) {
                const sign = m.tipo === 'AJUSTE_SUMA' ? 1 : -1;
                rows.push({
                    ...m,
                    _category: 'TRANSFER' as const,
                    _isRealAdjust: false,
                    _isPairedTransfer: false,
                    _badgeLabel: m.tipo === 'AJUSTE_SUMA' ? 'TRASLADO (+)' : 'TRASLADO (-)',
                    _badgeIcon: '🔄',
                    _badgeColor: '#6366f1',
                    _signedQty: Number(m.qtyPrincipal || 0) * sign,
                    _saldoAfter: saldoMap.get(m.id)?.after ?? null,
                });
                continue;
            }

            // Caso 3: AJUSTE REAL SIN CONTRAPARTIDA (Lo que queremos auditar y achicar)
            if (m.tipo === 'AJUSTE_SUMA' || m.tipo === 'AJUSTE_RESTA') {
                const sign = m.tipo === 'AJUSTE_SUMA' ? 1 : -1;
                let subTypeLabel = m.tipo === 'AJUSTE_SUMA' ? 'AJUSTE (+)' : 'AJUSTE (-)';
                let subTypeIcon = '⚠️';
                let adjustKind: 'QUICK_ADD' | 'MANUAL_EDIT' | 'MANUAL_DELETE' | 'OTHER' = 'OTHER';

                if (obsLower.includes('adición rápida')) {
                    subTypeLabel = 'ADICIÓN RÁPIDA';
                    subTypeIcon = '⚡';
                    adjustKind = 'QUICK_ADD';
                } else if (obsLower.includes('eliminación')) {
                    subTypeLabel = 'BAJA MANUAL';
                    subTypeIcon = '🗑️';
                    adjustKind = 'MANUAL_DELETE';
                } else if (obsLower.includes('ajuste manual')) {
                    subTypeLabel = m.tipo === 'AJUSTE_SUMA' ? 'CORRECCIÓN (+)' : 'CORRECCIÓN (-)';
                    subTypeIcon = '✏️';
                    adjustKind = 'MANUAL_EDIT';
                }

                rows.push({
                    ...m,
                    _category: 'REAL_ADJUST' as const,
                    _isRealAdjust: true,
                    _adjustKind: adjustKind,
                    _badgeLabel: subTypeLabel,
                    _badgeIcon: subTypeIcon,
                    _badgeColor: sign > 0 ? '#f59e0b' : '#ef4444',
                    _signedQty: Number(m.qtyPrincipal || 0) * sign,
                    _saldoAfter: saldoMap.get(m.id)?.after ?? null,
                });
                continue;
            }

            // Caso 4: Entradas, Salidas y Anulaciones normales
            const sign = getMovementImpactSign(m.tipo);
            const isEntrada = ['REMITO_ENTRADA', 'DEVOLUCION_LINEA', 'INGRESO_PRODUCCION'].includes(m.tipo);
            const isSalida = ['REMITO_SALIDA', 'ENTREGA_PRODUCCION'].includes(m.tipo);

            let badgeLabel = m.tipo;
            let badgeIcon = '📋';
            let badgeColor = '#9ca3af';

            if (m.tipo === 'REMITO_ENTRADA') {
                badgeLabel = 'ENTRADA';
                badgeIcon = '📥';
                badgeColor = '#10b981';
            } else if (m.tipo === 'REMITO_SALIDA') {
                badgeLabel = 'SALIDA';
                badgeIcon = '📤';
                badgeColor = '#38bdf8';
            } else if (m.tipo === 'ENTREGA_PRODUCCION') {
                badgeLabel = 'ENT. PROD.';
                badgeIcon = '🏭';
                badgeColor = '#38bdf8';
            } else if (m.tipo === 'DEVOLUCION_LINEA') {
                badgeLabel = 'DEV. LÍNEA';
                badgeIcon = '↩️';
                badgeColor = '#10b981';
            } else if (m.tipo === 'INGRESO_PRODUCCION') {
                badgeLabel = 'ING. PROD.';
                badgeIcon = '⚙️';
                badgeColor = '#10b981';
            } else if (m.tipo.startsWith('ANULACION_')) {
                badgeLabel = m.tipo.replace('ANULACION_', 'ANUL. ');
                badgeIcon = '🚫';
                badgeColor = '#ec4899';
            }

            rows.push({
                ...m,
                _category: isEntrada ? ('IN' as const) : isSalida ? ('OUT' as const) : ('OTHER' as const),
                _isRealAdjust: false,
                _badgeLabel: badgeLabel,
                _badgeIcon: badgeIcon,
                _badgeColor: badgeColor,
                _signedQty: Number(m.qtyPrincipal || 0) * sign,
                _saldoAfter: saldoMap.get(m.id)?.after ?? null,
            });
        }

        return rows;
    }, [movements, itemId, currentStockTotal, hasta]);

    // Métricas exclusivas de AJUSTES REALES (sin contrapartida) para el Panel de Control
    const realAdjustAnalytics = useMemo(() => {
        const realAdjusts = processedData.filter((r) => r._isRealAdjust && r.status !== 'ANULADO');

        let sumaCount = 0;
        let sumaKilos = 0;
        let restaCount = 0;
        let restaKilos = 0;

        // Evolución por semana o fecha para ver si los ajustes van bajando
        const trendMap = new Map<string, { label: string; cantidad: number; sumaKg: number; restaKg: number }>();
        // Top materiales con más ajustes forzados
        const byMaterial = new Map<
            string,
            { id: string; codigo: string; descripcion: string; count: number; sumaKg: number; restaKg: number; unidad: string }
        >();

        const ascAdjusts = [...realAdjusts].reverse();
        ascAdjusts.forEach((m) => {
            const qty = Math.abs(Number(m.qtyPrincipal || 0));
            const isPos = m._signedQty > 0;

            if (isPos) {
                sumaCount++;
                sumaKilos += qty;
            } else {
                restaCount++;
                restaKilos += qty;
            }

            // Agrupar para el gráfico de tendencia (por fecha o mes según la extensión)
            const fStr = String(m.fecha).slice(0, 10);
            const key = datePreset === 'all' || datePreset === '90d' ? fStr.slice(0, 7) : fStr;
            const label =
                datePreset === 'all' || datePreset === '90d'
                    ? `${fStr.slice(5, 7)}/${fStr.slice(2, 4)}`
                    : formatDateAR(fStr).slice(0, 5);

            const curTrend = trendMap.get(key) || { label, cantidad: 0, sumaKg: 0, restaKg: 0 };
            curTrend.cantidad += 1;
            if (isPos) curTrend.sumaKg = Number((curTrend.sumaKg + qty).toFixed(1));
            else curTrend.restaKg = Number((curTrend.restaKg + qty).toFixed(1));
            trendMap.set(key, curTrend);

            // Agrupar por material
            if (m.item?.id) {
                const curMat = byMaterial.get(m.item.id) || {
                    id: m.item.id,
                    codigo: m.item.codigoInterno || 'S/C',
                    descripcion: m.item.descripcion || 'Material',
                    count: 0,
                    sumaKg: 0,
                    restaKg: 0,
                    unidad: m.item.unidadPrincipal || 'kg',
                };
                curMat.count += 1;
                if (isPos) curMat.sumaKg += qty;
                else curMat.restaKg += qty;
                byMaterial.set(m.item.id, curMat);
            }
        });

        const topMaterials = Array.from(byMaterial.values())
            .sort((a, b) => b.count - a.count || b.sumaKg + b.restaKg - (a.sumaKg + a.restaKg))
            .slice(0, 5);

        return {
            totalCount: realAdjusts.length,
            sumaCount,
            sumaKilos,
            restaCount,
            restaKilos,
            trendData: Array.from(trendMap.values()),
            topMaterials,
        };
    }, [processedData, datePreset]);

    // Curva de evolución del saldo cuando se investiga un material puntual
    const materialHistoryChart = useMemo(() => {
        if (!itemId || processedData.length === 0) return [];
        const asc = [...processedData].reverse();
        const byDate = new Map<string, { label: string; saldo: number }>();
        asc.forEach((m) => {
            if (m._saldoAfter == null) return;
            const fStr = String(m.fecha).slice(0, 10);
            byDate.set(fStr, {
                label: formatDateAR(fStr).slice(0, 5),
                saldo: Number(m._saldoAfter.toFixed(2)),
            });
        });
        return Array.from(byDate.values());
    }, [processedData, itemId]);

    // Contadores para los filtros de la tabla
    const categoryCounts = useMemo(() => {
        let realAdjust = 0;
        let inCount = 0;
        let outCount = 0;
        let transferCount = 0;
        processedData.forEach((m) => {
            if (m._category === 'REAL_ADJUST') realAdjust++;
            else if (m._category === 'IN') inCount++;
            else if (m._category === 'OUT') outCount++;
            else if (m._category === 'TRANSFER') transferCount++;
        });
        return { all: processedData.length, realAdjust, inCount, outCount, transferCount };
    }, [processedData]);

    // Mapa de lotes conocidos por material (para que en el selector de material también puedas escribir un lote, proveedor o categoría)
    const lotsByItemId = useMemo(() => {
        const map = new Map<string, Set<string>>();
        movements.forEach((m: any) => {
            if (m.itemId && m.batch?.lotNumber) {
                if (!map.has(m.itemId)) map.set(m.itemId, new Set());
                map.get(m.itemId)!.add(m.batch.lotNumber);
            }
        });
        return map;
    }, [movements]);

    const normalizeText = (str: string) =>
        (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

    // Filtrado final de la tabla (por categoría seleccionada y buscador flexible multi-palabra)
    const filteredRows = useMemo(() => {
        const tokens = normalizeText(quickSearch)
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        return processedData.filter((m) => {
            if (flowFilter === 'REAL_ADJUST' && m._category !== 'REAL_ADJUST') return false;
            if (flowFilter === 'IN' && m._category !== 'IN') return false;
            if (flowFilter === 'OUT' && m._category !== 'OUT') return false;
            if (flowFilter === 'TRANSFER' && m._category !== 'TRANSFER') return false;

            if (tokens.length > 0) {
                const hay = normalizeText(
                    [
                        m.item?.descripcion,
                        m.item?.codigoInterno,
                        m.item?.category?.nombre,
                        m.item?.categoria,
                        m.categoria,
                        m.item?.supplier?.name,
                        m.batch?.supplier?.name,
                        m.supplier?.name,
                        m.documento?.partner?.name,
                        m.batch?.lotNumber,
                        m._originLot,
                        m._destLot,
                        m.posicion?.codigo,
                        m._originPos,
                        m._destPos,
                        m.deposito?.nombre,
                        m.posicion?.depot?.nombre,
                        m.documentoNumero,
                        m.documento?.numero,
                        m.user?.username,
                        m.user?.nombre,
                        m.observaciones,
                        m._badgeLabel,
                    ]
                        .filter(Boolean)
                        .join(' ')
                );

                if (!tokens.every((t) => hay.includes(t))) return false;
            }

            return true;
        });
    }, [processedData, flowFilter, quickSearch]);

    const pagination = useClientPagination(filteredRows, 25);

    const handleReverse = async (m: any) => {
        const desc = m.item?.descripcion || 'Material';
        const qty = `${Number(m.qtyPrincipal).toFixed(2)} ${m.item?.unidadPrincipal || 'kg'}`;
        if (
            !window.confirm(
                `¿Estás seguro de revertir este movimiento de ${desc} (${qty})?\nSe generará una contrapartida y el movimiento original quedará anulado.`
            )
        )
            return;
        try {
            await reverseMovement(m.id).unwrap();
            alert('✅ Movimiento revertido con éxito.');
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
        if (!filteredRows.length) return;
        const rows = filteredRows.map((m) => ({
            'Fecha': formatDateAR(m.fecha),
            'Hora': formatTimeAR(m.createdAt),
            'Clasificación': m._badgeLabel,
            'Es Ajuste Forzado': m._isRealAdjust ? 'SÍ' : 'NO',
            'Código': m.item?.codigoInterno || '—',
            'Material': m.item?.descripcion || '—',
            'Lote': m._isPairedTransfer && m._isLotReassign ? `${m._originLot} → ${m._destLot}` : m.batch?.lotNumber || '—',
            'Ubicación': m._isPairedTransfer ? `${m._originPos} → ${m._destPos}` : m.posicion?.codigo || 'S/P',
            'Depósito': m.deposito?.nombre || m.posicion?.depot?.nombre || '—',
            'Cantidad': Number(m._signedQty.toFixed(2)),
            'Unidad': m.item?.unidadPrincipal || 'kg',
            ...(itemId ? { 'Saldo Posterior': m._saldoAfter != null ? Number(m._saldoAfter.toFixed(2)) : '' } : {}),
            'Documento / Remito': m.documentoNumero || m.documento?.numero || '—',
            'Usuario': m.user?.username || 'Sistema',
            'Observaciones': m.observaciones || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');
        XLSX.writeFile(wb, `Auditoria_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

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
        ? ['Fecha', 'Movimiento', 'Ubicación', 'Lote', 'Variación', 'Saldo', 'Detalle / Usuario', '']
        : ['Fecha', 'Movimiento', 'Material', 'Ubicación', 'Lote', 'Cantidad', 'Detalle / Usuario', ''];

    const renderDesktopRow = (m: any) => {
        const isAnulado = m.status === 'ANULADO';
        const isTransfer = m._category === 'TRANSFER';
        const isPositive = m._signedQty > 0;
        const qtyColor = isAnulado
            ? 'var(--text-subtle, #6b7280)'
            : isTransfer
            ? '#818cf8'
            : isPositive
            ? '#10b981'
            : '#ef4444';
        const docNum = m.documentoNumero || m.documento?.numero;

        const dateCell = (
            <div style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f3f4f6)' }}>
                    {formatDateAR(m.fecha)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>{formatTimeAR(m.createdAt)}</div>
            </div>
        );

        const typeCell = (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Badge color={m._badgeColor}>
                    {m._badgeIcon} {m._badgeLabel}
                </Badge>
                {isAnulado && <Badge color="#6b7280">ANULADO</Badge>}
            </div>
        );

        const materialCell = (
            <div
                onClick={() => m.item?.id && handleSelectItem(m.item.id)}
                style={{ cursor: 'pointer', maxWidth: '250px' }}
                title="Clic para ver todo el historial de este material"
            >
                <div style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '13px', lineHeight: 1.25, whiteSpace: 'normal' }}>
                    {m.item?.descripcion || '—'}
                </div>
                <code style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                    {m.item?.codigoInterno}
                </code>
            </div>
        );

        const locationCell = m._isPairedTransfer ? (
            <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary, #f3f4f6)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    📍 {m._originPos} <span style={{ color: '#818cf8' }}>→</span> 📍 {m._destPos}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                    {m._originDepot || m.deposito?.nombre || 'Traslado interno'}
                </div>
            </div>
        ) : (
            <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary, #f3f4f6)', fontSize: '13px' }}>
                    📍 {m.posicion?.codigo || 'S/P'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                    {m.deposito?.nombre || m.posicion?.depot?.nombre || '—'}
                </div>
            </div>
        );

        const lotCell =
            m._isPairedTransfer && m._isLotReassign ? (
                <code style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>
                    {m._originLot} → {m._destLot}
                </code>
            ) : (
                <code
                    onClick={() => m.batch?.lotNumber && setQuickSearch(quickSearch === m.batch.lotNumber ? '' : m.batch.lotNumber)}
                    style={{
                        fontSize: '12px',
                        color: '#a5b4fc',
                        cursor: m.batch?.lotNumber ? 'pointer' : 'default',
                    }}
                    title="Clic para filtrar este lote"
                >
                    {m.batch?.lotNumber || '—'}
                </code>
            );

        const qtyCell = (
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div
                    style={{
                        color: qtyColor,
                        fontWeight: 800,
                        fontSize: '14px',
                        textDecoration: isAnulado ? 'line-through' : 'none',
                    }}
                >
                    {!isTransfer && isPositive ? '+' : ''}
                    {m._signedQty.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
                    <small style={{ fontSize: '11px', fontWeight: 600 }}>{m.item?.unidadPrincipal || 'kg'}</small>
                </div>
                {m.qtySecundaria != null && Number(m.qtySecundaria) > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>
                        {Number(m.qtySecundaria).toLocaleString('es-AR')} {m.item?.unidadSecundaria || 'un'}
                    </div>
                )}
            </div>
        );

        const saldoCell = (
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: 'var(--text-primary, #f3f4f6)' }}>
                {m._saldoAfter != null ? (
                    <>
                        {m._saldoAfter.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
                        <small style={{ fontSize: '10px', color: 'var(--text-muted, #9ca3af)', fontWeight: 500 }}>
                            {m.item?.unidadPrincipal || 'kg'}
                        </small>
                    </>
                ) : (
                    '—'
                )}
            </div>
        );

        const detailCell = (
            <div style={{ maxWidth: '210px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #d1d5db)' }}>
                        👤 {m.user?.username || 'Sistema'}
                    </span>
                    {docNum && !docNum.startsWith('BK-') && (
                        <span
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewDocument(m);
                            }}
                            style={{
                                fontSize: '11px',
                                color: '#38bdf8',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                            }}
                        >
                            📄 {docNum}
                        </span>
                    )}
                </div>
                {m.observaciones && !m._isPairedTransfer && (
                    <div
                        style={{
                            fontSize: '11px',
                            color: 'var(--text-subtle, #6b7280)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                        }}
                        title={m.observaciones}
                    >
                        {m.observaciones}
                    </div>
                )}
            </div>
        );

        const canReverseRow =
            !isAnulado &&
            !m._isPairedTransfer &&
            canReverse &&
            ['REMITO_ENTRADA', 'REMITO_SALIDA', 'AJUSTE_SUMA', 'AJUSTE_RESTA'].includes(m.tipo);

        const actions = [
            { label: 'Ver Detalle', icon: '👁️', onClick: () => setSelectedMovement(m) },
            ...(!itemId && m.item?.id
                ? [
                      {
                          label: 'Ver Historial del Material',
                          icon: '📊',
                          color: '#a5b4fc',
                          onClick: () => handleSelectItem(m.item.id),
                      },
                  ]
                : []),
            ...(canReverseRow
                ? [
                      {
                          label: 'Revertir Movimiento',
                          icon: '🔄',
                          color: '#ef4444',
                          onClick: () => handleReverse(m),
                      },
                  ]
                : []),
        ];

        if (itemId) {
            return [dateCell, typeCell, locationCell, lotCell, qtyCell, saldoCell, detailCell, <ActionMenu options={actions} />];
        }
        return [dateCell, typeCell, materialCell, locationCell, lotCell, qtyCell, detailCell, <ActionMenu options={actions} />];
    };

    const renderMobileCard = (m: any) => {
        const isAnulado = m.status === 'ANULADO';
        const isTransfer = m._category === 'TRANSFER';
        const isPositive = m._signedQty > 0;
        const qtyColor = isAnulado ? '#6b7280' : isTransfer ? '#818cf8' : isPositive ? '#10b981' : '#ef4444';

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} onClick={() => setSelectedMovement(m)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge color={m._badgeColor}>
                        {m._badgeIcon} {m._badgeLabel}
                    </Badge>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>
                        {formatDateAR(m.fecha)} {formatTimeAR(m.createdAt)}
                    </span>
                </div>

                {!itemId && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            if (m.item?.id) handleSelectItem(m.item.id);
                        }}
                        style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '14px' }}
                    >
                        {m.item?.descripcion}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary, #d1d5db)' }}>
                        {m._isPairedTransfer ? `📍 ${m._originPos} → 📍 ${m._destPos}` : `📍 ${m.posicion?.codigo || 'S/P'}`}
                        {' · '}
                        <code>{m.batch?.lotNumber || 'S/L'}</code>
                    </span>
                    <span style={{ fontWeight: 800, color: qtyColor, fontSize: '15px' }}>
                        {!isTransfer && isPositive ? '+' : ''}
                        {m._signedQty.toFixed(1)} {m.item?.unidadPrincipal || 'kg'}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1440px', margin: '0 auto' }}>
            <style>{`
                .period-pill {
                    background: transparent;
                    border: 1px solid var(--border-strong, #374151);
                    color: var(--text-muted, #9ca3af);
                    padding: 7px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .period-pill.active {
                    background: rgba(99, 102, 241, 0.18);
                    border-color: #6366f1;
                    color: #a5b4fc;
                }
                .filter-tab-btn {
                    background: var(--bg-secondary, #1a1d2e);
                    border: 1px solid var(--border-color, #2a2d3e);
                    color: var(--text-muted, #9ca3af);
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .filter-tab-btn:hover {
                    border-color: #6366f1;
                    color: var(--text-primary, #f3f4f6);
                }
                .filter-tab-btn.active {
                    background: #6366f1;
                    border-color: #6366f1;
                    color: #ffffff;
                }
                .filter-tab-btn.warning.active {
                    background: #f59e0b;
                    border-color: #f59e0b;
                    color: #111827;
                }
            `}</style>

            <PageHeader
                title="Auditoría de Stock"
                subtitle="Seguimiento de ajustes forzados (sin contrapartida) e historial completo por material"
            >
                <Btn variant="secondary" small onClick={handleExportExcel}>
                    📥 Exportar Excel
                </Btn>
            </PageHeader>

            {/* ── 1. BARRA ÚNICA DE FILTROS (1 SOLA FILA LIMPIA) ── */}
            <Card style={{ padding: '14px 16px', marginBottom: '18px' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.5fr 0.9fr 1.1fr auto',
                        gap: '12px',
                        alignItems: 'flex-end',
                    }}
                >
                    <SearchSelect
                        label="🏷️ Material (Buscá por categoría, descripción, proveedor, código o lote)"
                        value={itemId}
                        onChange={handleSelectItem}
                        options={[
                            { value: '', label: 'Todos los materiales (Vista general)' },
                            ...rawItems.map((i: any) => {
                                const cat = i.category?.nombre || i.categoria || '';
                                const sup = i.supplier?.name || '';
                                const knownLots = lotsByItemId.get(i.id)
                                    ? Array.from(lotsByItemId.get(i.id)!).join(' ')
                                    : '';
                                return {
                                    value: i.id,
                                    label: `${cat ? `[${cat}] ` : ''}${i.codigoInterno} - ${i.descripcion}${sup ? ` (${sup})` : ''}`,
                                    searchText: `${cat} ${sup} ${i.codigoInterno} ${i.descripcion} ${knownLots}`,
                                };
                            }),
                        ]}
                        placeholder="Ej: nylon negro eurotex..."
                    />

                    <Select
                        label="🏢 Depósito"
                        value={depositoId}
                        onChange={setDepositoId}
                        options={[
                            { value: '', label: 'Todos los depósitos' },
                            ...rawDepots
                                .filter((d: any) => d.activo !== false)
                                .map((d: any) => ({ value: d.id, label: d.nombre })),
                        ]}
                    />

                    <Input
                        label="🔍 Filtro libre (Categoría, material, proveedor, lote, posición...)"
                        placeholder="Ej: nylon negro eurotex 120..."
                        value={quickSearch}
                        onChange={setQuickSearch}
                    />

                    <div>
                        <label style={{ display: 'block', color: 'var(--text-muted, #9ca3af)', fontSize: '12px', marginBottom: '4px' }}>
                            📅 Período
                        </label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(
                                [
                                    { id: '7d', label: '7d' },
                                    { id: '30d', label: '30d' },
                                    { id: '90d', label: '90d' },
                                    { id: 'all', label: 'Todo' },
                                    { id: 'custom', label: 'Fechas...' },
                                ] as { id: DatePreset; label: string }[]
                            ).map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`period-pill ${datePreset === p.id ? 'active' : ''}`}
                                    onClick={() => applyPreset(p.id)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {showCustomDates && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle, #1e2133)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <Input label="Desde" type="date" value={desde} onChange={setDesde} style={{ width: '160px' }} />
                        <Input label="Hasta" type="date" value={hasta} onChange={setHasta} style={{ width: '160px' }} />
                    </div>
                )}
            </Card>

            {/* ── 2. BLOQUE DASHBOARD (2 PANELES LADO A LADO, CERO REDUNDANCIA) ── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr',
                    gap: '16px',
                    marginBottom: '20px',
                }}
            >
                {/* PANEL IZQUIERDO: CONTROL DE AJUSTES REALES (SIN CONTRAPARTIDA) */}
                <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    ⚠️ Ajustes Forzados (Sin Contrapartida)
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginTop: '2px' }}>
                                    Excluye traslados entre posiciones (-250 / +250). Muestra solo diferencias de inventario.
                                </div>
                            </div>
                            <Btn
                                small
                                variant={flowFilter === 'REAL_ADJUST' ? 'primary' : 'secondary'}
                                onClick={() => setFlowFilter(flowFilter === 'REAL_ADJUST' ? 'ALL' : 'REAL_ADJUST')}
                            >
                                {flowFilter === 'REAL_ADJUST' ? 'Ver Todos' : 'Filtrar Tabla'}
                            </Btn>
                        </div>

                        {/* 3 Numeros claros */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '10px',
                                marginBottom: '16px',
                            }}
                        >
                            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 600 }}>Total Ajustes</div>
                                <div style={{ fontSize: '22px', fontWeight: 900, color: '#f59e0b', marginTop: '2px' }}>
                                    {realAdjustAnalytics.totalCount}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>correcciones a mano</div>
                            </div>

                            <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '10px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 600 }}>Adiciones / Suma (+)</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                                    +{realAdjustAnalytics.sumaKilos.toLocaleString('es-AR', { maximumFractionDigits: 1 })} <small style={{ fontSize: '11px' }}>{unitLabel}</small>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>en {realAdjustAnalytics.sumaCount} ajustes</div>
                            </div>

                            <div style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '10px 12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', fontWeight: 600 }}>Faltantes / Baja (-)</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                                    -{realAdjustAnalytics.restaKilos.toLocaleString('es-AR', { maximumFractionDigits: 1 })} <small style={{ fontSize: '11px' }}>{unitLabel}</small>
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>en {realAdjustAnalytics.restaCount} ajustes</div>
                            </div>
                        </div>
                    </div>

                    {/* Gráfico de tendencia de ajustes forzados */}
                    <div style={{ height: '140px', width: '100%' }}>
                        {realAdjustAnalytics.trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={realAdjustAnalytics.trendData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} allowDecimals={false} />
                                    <RechartsTooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1d2e',
                                            borderColor: '#374151',
                                            borderRadius: 8,
                                            color: '#fff',
                                            fontSize: '12px',
                                        }}
                                        formatter={(val: any) => [`${val} ajustes forzados`, 'Cantidad']}
                                    />
                                    <Bar dataKey="cantidad" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '13px', fontWeight: 600, background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px' }}>
                                ✅ Sin ajustes forzados en este período
                            </div>
                        )}
                    </div>
                </Card>

                {/* PANEL DERECHO: CONTEXTUAL (RANKING DE MATERIALES CON MÁS AJUSTES O CURVA DE STOCK DEL MATERIAL SELECCIONADO) */}
                <Card style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    {!itemId ? (
                        <>
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    🎯 Materiales con más Ajustes Manuales
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginTop: '2px' }}>
                                    Hacé clic en un material para investigar su historial completo (Kardex)
                                </div>
                            </div>

                            {realAdjustAnalytics.topMaterials.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle, #6b7280)', fontSize: '13px' }}>
                                    No hay materiales con ajustes manuales en este período.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
                                    {realAdjustAnalytics.topMaterials.map((mat, idx) => (
                                        <div
                                            key={mat.id}
                                            onClick={() => handleSelectItem(mat.id)}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '10px 12px',
                                                background: 'rgba(255,255,255,0.03)',
                                                border: '1px solid var(--border-subtle, #1e2133)',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                transition: 'border-color 0.15s',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
                                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle, #1e2133)')}
                                        >
                                            <div style={{ minWidth: 0, flex: 1, paddingRight: '10px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f3f4f6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {idx + 1}. {mat.descripcion}
                                                </div>
                                                <code style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)' }}>{mat.codigo}</code>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
                                                <div style={{ textAlign: 'right', fontSize: '12px' }}>
                                                    {mat.sumaKg > 0 && (
                                                        <span style={{ color: '#10b981', fontWeight: 700, marginRight: '6px' }}>
                                                            +{mat.sumaKg.toFixed(1)} {mat.unidad}
                                                        </span>
                                                    )}
                                                    {mat.restaKg > 0 && (
                                                        <span style={{ color: '#ef4444', fontWeight: 700 }}>
                                                            -{mat.restaKg.toFixed(1)} {mat.unidad}
                                                        </span>
                                                    )}
                                                </div>
                                                <Badge color="#f59e0b">{mat.count} aj.</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase' }}>
                                        📈 Evolución de Stock: {selectedItemObj?.codigoInterno}
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary, #f3f4f6)', marginTop: '2px' }}>
                                        {selectedItemObj?.descripcion}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ textAlign: 'right', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '6px 10px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>Stock Hoy</div>
                                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#38bdf8' }}>
                                            {currentStockTotal.toLocaleString('es-AR', { maximumFractionDigits: 1 })} {unitLabel}
                                        </div>
                                    </div>
                                    <Btn small variant="secondary" onClick={() => handleSelectItem('')} title="Volver a vista general">
                                        ✕
                                    </Btn>
                                </div>
                            </div>

                            {/* Ubicaciones actuales resumidas en pills */}
                            {currentItemStock.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                    {currentItemStock.map((s: any) => (
                                        <span
                                            key={s.id}
                                            onClick={() => s.batch?.lotNumber && setQuickSearch(quickSearch === s.batch.lotNumber ? '' : s.batch.lotNumber)}
                                            style={{
                                                fontSize: '11px',
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid var(--border-subtle, #1e2133)',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                            }}
                                            title="Clic para filtrar por este lote"
                                        >
                                            <strong style={{ color: '#a5b4fc' }}>📍 {s.posicion?.codigo}</strong>{' '}
                                            <span style={{ color: '#10b981', fontWeight: 700 }}>{Number(s.qtyPrincipal).toFixed(1)} {unitLabel}</span>{' '}
                                            <code style={{ color: 'var(--text-muted, #9ca3af)' }}>({s.batch?.lotNumber || 'S/L'})</code>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div style={{ height: '145px', width: '100%' }}>
                                {materialHistoryChart.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={materialHistoryChart}>
                                            <defs>
                                                <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
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
                                                formatter={(val: any) => [`${Number(val).toLocaleString('es-AR')} ${unitLabel}`, 'Saldo']}
                                            />
                                            <Area type="monotone" dataKey="saldo" stroke="#818cf8" strokeWidth={2.5} fill="url(#saldoGrad)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle, #6b7280)', fontSize: '12px' }}>
                                        Historial de saldo disponible en la tabla inferior
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </Card>
            </div>

            {/* ── 3. FILTROS DE TABLA (EL ÚNICO LUGAR PARA FILTRAR POR TIPO) ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`filter-tab-btn ${flowFilter === 'ALL' ? 'active' : ''}`}
                        onClick={() => {
                            setFlowFilter('ALL');
                            pagination.setPage(0);
                        }}
                    >
                        Todos ({categoryCounts.all})
                    </button>
                    <button
                        type="button"
                        className={`filter-tab-btn warning ${flowFilter === 'REAL_ADJUST' ? 'active' : ''}`}
                        onClick={() => {
                            setFlowFilter('REAL_ADJUST');
                            pagination.setPage(0);
                        }}
                    >
                        ⚠️ Solo Ajustes Forzados ({categoryCounts.realAdjust})
                    </button>
                    <button
                        type="button"
                        className={`filter-tab-btn ${flowFilter === 'IN' ? 'active' : ''}`}
                        onClick={() => {
                            setFlowFilter('IN');
                            pagination.setPage(0);
                        }}
                    >
                        📥 Entradas ({categoryCounts.inCount})
                    </button>
                    <button
                        type="button"
                        className={`filter-tab-btn ${flowFilter === 'OUT' ? 'active' : ''}`}
                        onClick={() => {
                            setFlowFilter('OUT');
                            pagination.setPage(0);
                        }}
                    >
                        📤 Salidas ({categoryCounts.outCount})
                    </button>
                    <button
                        type="button"
                        className={`filter-tab-btn ${flowFilter === 'TRANSFER' ? 'active' : ''}`}
                        onClick={() => {
                            setFlowFilter('TRANSFER');
                            pagination.setPage(0);
                        }}
                    >
                        🔄 Traslados Internos ({categoryCounts.transferCount})
                    </button>
                </div>

                {(itemId || depositoId || quickSearch || flowFilter !== 'ALL') && (
                    <Btn
                        small
                        variant="secondary"
                        onClick={() => {
                            handleSelectItem('');
                            setDepositoId('');
                            setQuickSearch('');
                            setFlowFilter('ALL');
                        }}
                    >
                        ✕ Limpiar filtros
                    </Btn>
                )}
            </div>

            {/* ── 4. TABLA PRINCIPAL ── */}
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
                count={filteredRows.length}
                page={pagination.page}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={(value) => {
                    pagination.setPageSize(value);
                    pagination.setPage(0);
                }}
            />

            {/* MODAL DE DETALLE DEL MOVIMIENTO */}
            {selectedMovement && (
                <Modal title="Detalle del Movimiento" onClose={() => setSelectedMovement(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Badge color={selectedMovement._badgeColor}>
                                {selectedMovement._badgeIcon} {selectedMovement._badgeLabel}
                            </Badge>
                            <span style={{ color: 'var(--text-muted, #9ca3af)' }}>
                                {formatDateAR(selectedMovement.fecha)} {formatTimeAR(selectedMovement.createdAt)}
                            </span>
                        </div>

                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Material</div>
                            <div style={{ fontWeight: 800, fontSize: '15px', color: '#a5b4fc' }}>
                                {selectedMovement.item?.codigoInterno} — {selectedMovement.item?.descripcion}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Ubicación</div>
                                <div style={{ fontWeight: 700 }}>
                                    {selectedMovement._isPairedTransfer
                                        ? `📍 ${selectedMovement._originPos} → 📍 ${selectedMovement._destPos}`
                                        : `📍 ${selectedMovement.posicion?.codigo || 'S/P'} (${selectedMovement.deposito?.nombre || ''})`}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Lote / Partida</div>
                                <code style={{ fontWeight: 700, color: '#a5b4fc' }}>
                                    {selectedMovement.batch?.lotNumber || 'Sin lote'}
                                </code>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Cantidad</div>
                                <div style={{ fontWeight: 800, fontSize: '15px' }}>
                                    {Number(selectedMovement.qtyPrincipal).toLocaleString('es-AR')} {selectedMovement.item?.unidadPrincipal || 'kg'}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>Usuario</div>
                                <div style={{ fontWeight: 700 }}>👤 {selectedMovement.user?.username || 'Sistema'}</div>
                            </div>
                        </div>

                        {selectedMovement.observaciones && (
                            <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)', marginBottom: '2px' }}>Observaciones</div>
                                <div>{selectedMovement.observaciones}</div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            {selectedMovement.item?.id && itemId !== selectedMovement.item.id && (
                                <Btn
                                    small
                                    variant="secondary"
                                    onClick={() => {
                                        handleSelectItem(selectedMovement.item.id);
                                        setSelectedMovement(null);
                                    }}
                                >
                                    📊 Ver Historial del Material
                                </Btn>
                            )}
                            <Btn small onClick={() => setSelectedMovement(null)}>
                                Cerrar
                            </Btn>
                        </div>
                    </div>
                </Modal>
            )}

            <RemitoDetailModal open={showRemitoModal} onClose={() => setShowRemitoModal(false)} remito={selectedRemito} />
        </div>
    );
}
