import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Button,
    Chip,
    Paper,
    TextField,
    InputAdornment,
    ToggleButton,
    ToggleButtonGroup,
    Switch,
    FormControlLabel,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Divider,
    LinearProgress,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Alert
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
    ResponsiveContainer,
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ReferenceLine
} from 'recharts';
import { useSelector } from 'react-redux';
import { selectAllowedDepots } from '../../entities/auth/model/authSlice';
import { useGetDepotsQuery } from '../../features/warehouse/deposito/api/deposito.api';
import {
    useGetItemsQuery,
    useGetItemCategoriesQuery
} from '../../features/warehouse/materiales/api/items.api';
import { useGetStockQuery, useGetRecentMovementsQuery } from '../../features/warehouse/stock/api/stock.api';
import {
    useGetCapacityDashboardQuery,
    useGetVolumesDashboardQuery
} from '../../features/warehouse/capacity/api/capacity.api';
import {
    useOrdenesCompra,
    getArribosProgramados,
    getArribosProgramadosPorCategoria,
    type ArriboProgramado
} from '../../features/purchasing/ordenesCompra/ordenesCompraStorage';
import { useIsMobile } from '../../shared/ui';
import { matchesSearch } from '../../shared/utils/search';

const colors = {
    primary: '#f59e0b',
    primaryHover: '#d97706',
    bg: '#0f1117',
    surface: '#161922',
    surfaceElevated: '#1e2230',
    surfaceHover: '#232838',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#f3f4f6',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    danger: '#ef4444',
    dangerBg: 'rgba(239, 68, 68, 0.12)',
    warning: '#f59e0b',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    success: '#10b981',
    successBg: 'rgba(16, 185, 129, 0.12)',
    info: '#38bdf8',
    infoBg: 'rgba(56, 189, 248, 0.12)',
    purple: '#a855f7',
    indigo: '#818cf8'
};

const formatDateShort = (d: Date) => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
};

const toIsoDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

interface SawtoothPoint {
    dayPos: number;
    dayIndex: number;
    dateStr: string;
    dateLabel: string;
    value: number;
    valueSinOC: number;
    arriboAmount: number;
    arribos: (ArriboProgramado & { isOverdue?: boolean })[];
    isArrivalPeak?: boolean;
}

interface SawtoothResult {
    points: SawtoothPoint[];
    stockoutDay: number | null;
    stockoutDate: string | null;
    belowMinDay: number | null;
    peakValue: number;
    peakDate: string | null;
    overMaxDays: number;
    minValue: number;
}

function buildSawtoothSeries(params: {
    initialValue: number;
    dailyConsumption: number;
    horizonDays: number;
    arribos: ArriboProgramado[];
    includeOC: boolean;
    valueMultiplier?: number; // 1 para kg, m3PerKg para volumen m3
    minThreshold?: number | null;
    maxThreshold?: number | null;
}): SawtoothResult {
    const {
        initialValue,
        dailyConsumption,
        horizonDays,
        arribos,
        includeOC,
        valueMultiplier = 1,
        minThreshold = null,
        maxThreshold = null
    } = params;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toIsoDate(today);

    // Mapear arribos por día relativo (0..horizonDays). Los atrasados se asignan al día 1 marcados como atrasados.
    const arrivalsByDay = new Map<number, (ArriboProgramado & { isOverdue?: boolean })[]>();
    if (includeOC) {
        arribos.forEach(arr => {
            if (!arr.fecha || arr.cantidadKg <= 0) return;
            const fechaIso = arr.fecha.slice(0, 10);
            const arrDate = new Date(`${fechaIso}T00:00:00`);
            if (Number.isNaN(arrDate.getTime())) return;

            const diffDays = Math.round((arrDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > horizonDays) return;

            const targetDay = diffDays <= 0 ? 1 : diffDays;
            const list = arrivalsByDay.get(targetDay) || [];
            list.push({ ...arr, isOverdue: fechaIso < todayStr });
            arrivalsByDay.set(targetDay, list);
        });
    }

    const points: SawtoothPoint[] = [];
    let current = Math.max(0, initialValue);
    let currentSinOC = Math.max(0, initialValue);

    let stockoutDay: number | null = null;
    let stockoutDate: string | null = null;
    let belowMinDay: number | null = null;
    let peakValue = current;
    let peakDate: string | null = formatDateShort(today);
    let minValue = current;
    let overMaxDays = 0;

    // Día 0 (Hoy)
    points.push({
        dayPos: 0,
        dayIndex: 0,
        dateStr: todayStr,
        dateLabel: `Hoy (${formatDateShort(today)})`,
        value: Number(current.toFixed(2)),
        valueSinOC: Number(currentSinOC.toFixed(2)),
        arriboAmount: 0,
        arribos: []
    });

    if (current <= 0 && dailyConsumption > 0) {
        stockoutDay = 0;
        stockoutDate = formatDateShort(today);
    }
    if (minThreshold !== null && minThreshold > 0 && current < minThreshold) {
        belowMinDay = 0;
    }
    if (maxThreshold !== null && maxThreshold > 0 && current > maxThreshold) {
        overMaxDays++;
    }

    for (let day = 1; day <= horizonDays; day++) {
        const d = new Date(today);
        d.setDate(today.getDate() + day);
        const dateStr = toIsoDate(d);
        const dateLabel = formatDateShort(d);

        // Decaimiento diario por consumo
        current = Math.max(0, current - dailyConsumption * valueMultiplier);
        currentSinOC = Math.max(0, currentSinOC - dailyConsumption * valueMultiplier);

        const dayArrivals = arrivalsByDay.get(day) || [];

        if (dayArrivals.length > 0) {
            // Punto valle (antes del arribo) para dibujar el salto vertical del diente de sierra
            points.push({
                dayPos: day,
                dayIndex: day,
                dateStr,
                dateLabel,
                value: Number(current.toFixed(2)),
                valueSinOC: Number(currentSinOC.toFixed(2)),
                arriboAmount: 0,
                arribos: []
            });

            if (current <= 0 && stockoutDay === null && dailyConsumption > 0) {
                stockoutDay = day;
                stockoutDate = dateLabel;
            }
            if (minThreshold !== null && minThreshold > 0 && current < minThreshold && belowMinDay === null) {
                belowMinDay = day;
            }
            if (current < minValue) minValue = current;

            // Salto vertical por ingreso de OC
            const totalKg = dayArrivals.reduce((acc, a) => acc + a.cantidadKg, 0);
            const deltaVal = totalKg * valueMultiplier;
            current = current + deltaVal;

            points.push({
                dayPos: day + 0.02,
                dayIndex: day,
                dateStr,
                dateLabel,
                value: Number(current.toFixed(2)),
                valueSinOC: Number(currentSinOC.toFixed(2)),
                arriboAmount: Number(deltaVal.toFixed(2)),
                arribos: dayArrivals,
                isArrivalPeak: true
            });

            if (current > peakValue) {
                peakValue = current;
                peakDate = dateLabel;
            }
            if (maxThreshold !== null && maxThreshold > 0 && current > maxThreshold) {
                overMaxDays++;
            }
        } else {
            points.push({
                dayPos: day,
                dayIndex: day,
                dateStr,
                dateLabel,
                value: Number(current.toFixed(2)),
                valueSinOC: Number(currentSinOC.toFixed(2)),
                arriboAmount: 0,
                arribos: []
            });

            if (current <= 0 && stockoutDay === null && dailyConsumption > 0) {
                stockoutDay = day;
                stockoutDate = dateLabel;
            }
            if (minThreshold !== null && minThreshold > 0 && current < minThreshold && belowMinDay === null) {
                belowMinDay = day;
            }
            if (current > peakValue) {
                peakValue = current;
                peakDate = dateLabel;
            }
            if (current < minValue) minValue = current;
            if (maxThreshold !== null && maxThreshold > 0 && current > maxThreshold) {
                overMaxDays++;
            }
        }
    }

    return {
        points,
        stockoutDay,
        stockoutDate,
        belowMinDay,
        peakValue: Number(peakValue.toFixed(2)),
        peakDate,
        overMaxDays,
        minValue: Number(minValue.toFixed(2))
    };
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    unit: 'kg' | 'm³';
    maxCapacity?: number | null;
}

function SawtoothTooltip({ active, payload, unit, maxCapacity }: CustomTooltipProps) {
    if (!active || !payload || !payload.length) return null;
    const pt: SawtoothPoint = payload[0].payload;
    const fmt = (v: number) => unit === 'm³' ? `${v.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m³` : `${Math.round(v).toLocaleString('es-AR')} kg`;
    const pct = maxCapacity && maxCapacity > 0 ? (pt.value / maxCapacity) * 100 : null;

    return (
        <Box
            sx={{
                background: '#161922',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 2,
                p: 1.5,
                minWidth: 220,
                boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
            }}
        >
            <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 700, display: 'block', mb: 0.5 }}>
                Día +{pt.dayIndex} · {pt.dateLabel} ({pt.dateStr})
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    Proyectado {pt.isArrivalPeak ? '(post-arribo)' : ''}:
                </Typography>
                <Typography variant="body2" sx={{ color: colors.primary, fontWeight: 800 }}>
                    {fmt(pt.value)}
                </Typography>
            </Box>
            {pct !== null && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.25 }}>
                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                        Ocupación:
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 700,
                            color: pct > 100 ? colors.danger : pct > 85 ? colors.warning : colors.success
                        }}
                    >
                        {pct.toFixed(1)}%
                    </Typography>
                </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.25 }}>
                <Typography variant="caption" sx={{ color: colors.textMuted }}>
                    Sin OC en camino:
                </Typography>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                    {fmt(pt.valueSinOC)}
                </Typography>
            </Box>

            {pt.arribos.length > 0 && (
                <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${colors.border}` }}>
                    <Typography variant="caption" sx={{ color: colors.success, fontWeight: 700, display: 'block', mb: 0.5 }}>
                        + Ingreso OC: {fmt(pt.arriboAmount)}
                    </Typography>
                    {pt.arribos.slice(0, 4).map((arr, idx) => (
                        <Typography key={idx} variant="caption" sx={{ color: colors.text, display: 'block', fontSize: '0.7rem' }}>
                            • {arr.ordenNumero} ({arr.partnerNombre}): +{Math.round(arr.cantidadKg).toLocaleString('es-AR')} kg
                            {arr.isOverdue ? ' [Atrasada]' : ''}
                        </Typography>
                    ))}
                    {pt.arribos.length > 4 && (
                        <Typography variant="caption" sx={{ color: colors.textMuted, fontSize: '0.7rem' }}>
                            ... y {pt.arribos.length - 4} líneas más
                        </Typography>
                    )}
                </Box>
            )}
        </Box>
    );
}

export default function DienteDeSierraPage() {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const allowedDepots = useSelector(selectAllowedDepots);

    // 1. Depósitos
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => {
        const active = rawDepots.filter((d: any) => d.activo !== false);
        if (!allowedDepots) return active;
        return active.filter((d: any) => allowedDepots.includes(d.id));
    }, [rawDepots, allowedDepots]);

    const [depotId, setDepotId] = useState<string>(() => sessionStorage.getItem('selectedPurchasingDepotId') || '');

    useEffect(() => {
        if (depotId) sessionStorage.setItem('selectedPurchasingDepotId', depotId);
        else sessionStorage.removeItem('selectedPurchasingDepotId');
    }, [depotId]);

    // Fechas últimos 90 días para consumo real
    const { ninetyDaysAgo, today } = useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 90);
        return {
            ninetyDaysAgo: toIsoDate(start),
            today: toIsoDate(end)
        };
    }, []);

    // 2. Consultas API
    const { data: categories = [], isLoading: loadingCategories } = useGetItemCategoriesQuery(depotId || undefined);
    const { data: items = [], isLoading: loadingItems } = useGetItemsQuery({ depositoId: depotId || undefined });
    const { data: allStock = [], isLoading: loadingStock } = useGetStockQuery({ depotId: depotId || undefined });
    const { data: recentMovements = [], isLoading: loadingMovements } = useGetRecentMovementsQuery({
        desde: ninetyDaysAgo,
        hasta: today,
        depositoId: depotId || undefined,
        tipo: 'REMITO_SALIDA'
    });
    const { data: capacityData = [], isLoading: loadingCapacity } = useGetCapacityDashboardQuery();
    const { data: volumesData = [] } = useGetVolumesDashboardQuery();

    // 3. Órdenes de compra activas (reactivo)
    const { ordenes } = useOrdenesCompra();

    // 4. Estados UI
    const [horizonDays, setHorizonDays] = useState<number>(60);
    const [includeOC, setIncludeOC] = useState<boolean>(true);
    const [categorySearch, setCategorySearch] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [warehouseUnit, setWarehouseUnit] = useState<'m3' | 'kg'>('m3');

    // Mapeo stock por item
    const stockTotalsByItem = useMemo(() => {
        const map = new Map<string, number>();
        allStock.forEach((sb: any) => {
            map.set(sb.itemId, (map.get(sb.itemId) || 0) + Number(sb.qtyPrincipal || 0));
        });
        return map;
    }, [allStock]);

    // Mapeo consumo 90 días por item
    const consumption90dByItem = useMemo(() => {
        const map = new Map<string, number>();
        recentMovements.forEach((m: any) => {
            if (m.status === 'ANULADO') return;
            if (String(m.tipo || '').toUpperCase() !== 'REMITO_SALIDA') return;
            const itemId = m.itemId || m.item?.id;
            const itemCode = m.item?.codigoInterno ? String(m.item.codigoInterno).trim().toUpperCase() : null;
            const qty = Math.abs(Number(m.qtyPrincipal || m.cantidadPrincipal || m.cantidad || 0));
            if (itemId) map.set(itemId, (map.get(itemId) || 0) + qty);
            if (itemCode) map.set(itemCode, (map.get(itemCode) || 0) + qty);
        });
        return map;
    }, [recentMovements]);

    // Agrupación por Categoría de Material
    const categoryStats = useMemo(() => {
        const map = new Map<string, {
            id: string;
            nombre: string;
            minimo: number | null;
            maximo: number | null;
            itemIds: string[];
            itemCodes: string[];
            stockActual: number;
            consumo90d: number;
            consumoDiario: number;
            arribos: ArriboProgramado[];
            porVenirKg: number;
            sawtooth: SawtoothResult;
            status: 'STOCKOUT' | 'WARNING' | 'OVERMAX' | 'OK' | 'IDLE';
        }>();

        categories.forEach((cat: any) => {
            map.set(cat.id, {
                id: cat.id,
                nombre: cat.nombre,
                minimo: cat.minimo !== null && cat.minimo !== undefined ? Number(cat.minimo) : null,
                maximo: cat.maximo !== null && cat.maximo !== undefined ? Number(cat.maximo) : null,
                itemIds: [],
                itemCodes: [],
                stockActual: 0,
                consumo90d: 0,
                consumoDiario: 0,
                arribos: [],
                porVenirKg: 0,
                sawtooth: {
                    points: [],
                    stockoutDay: null,
                    stockoutDate: null,
                    belowMinDay: null,
                    peakValue: 0,
                    peakDate: null,
                    overMaxDays: 0,
                    minValue: 0
                },
                status: 'OK'
            });
        });

        // Acumular min/max de items como fallback si la categoría no tiene configurado
        const itemMinSum = new Map<string, number>();
        const itemMaxSum = new Map<string, number>();

        items.forEach((item: any) => {
            const catId = item.categoryId || item.category?.id;
            if (!catId || !map.has(catId)) return;
            const grp = map.get(catId)!;
            const esSobrante = Boolean(item.meta?.excluirDeCompras || item.meta?.esSobrante);
            const normCode = item.codigoInterno ? String(item.codigoInterno).trim().toUpperCase() : '';

            grp.itemIds.push(item.id);
            if (normCode) grp.itemCodes.push(normCode);

            const st = stockTotalsByItem.get(item.id) || 0;
            if (!esSobrante) {
                grp.stockActual += st;
            }
            const c90 = consumption90dByItem.get(item.id) || (normCode ? consumption90dByItem.get(normCode) : 0) || 0;
            grp.consumo90d += c90;

            if (item.stockMinimo && Number(item.stockMinimo) > 0 && !esSobrante) {
                itemMinSum.set(catId, (itemMinSum.get(catId) || 0) + Number(item.stockMinimo));
            }
            if (item.stockMaximo && Number(item.stockMaximo) > 0 && !esSobrante) {
                itemMaxSum.set(catId, (itemMaxSum.get(catId) || 0) + Number(item.stockMaximo));
            }
        });

        const result = Array.from(map.values()).map(grp => {
            const minimo = grp.minimo !== null && grp.minimo > 0 ? grp.minimo : (itemMinSum.get(grp.id) || null);
            const maximo = grp.maximo !== null && grp.maximo > 0 ? grp.maximo : (itemMaxSum.get(grp.id) || null);
            const consumoDiario = grp.consumo90d / 90;
            const arribos = getArribosProgramadosPorCategoria(grp.nombre, grp.itemIds, grp.itemCodes);
            const porVenirKg = arribos.reduce((acc, a) => acc + a.cantidadKg, 0);

            const sawtooth = buildSawtoothSeries({
                initialValue: grp.stockActual,
                dailyConsumption: consumoDiario,
                horizonDays,
                arribos,
                includeOC,
                minThreshold: minimo,
                maxThreshold: maximo
            });

            let status: 'STOCKOUT' | 'WARNING' | 'OVERMAX' | 'OK' | 'IDLE' = 'OK';
            if (grp.stockActual === 0 && consumoDiario === 0 && porVenirKg === 0) {
                status = 'IDLE';
            } else if (sawtooth.stockoutDay !== null) {
                status = 'STOCKOUT';
            } else if (sawtooth.belowMinDay !== null) {
                status = 'WARNING';
            } else if (sawtooth.overMaxDays > 0) {
                status = 'OVERMAX';
            }

            return {
                ...grp,
                minimo,
                maximo,
                consumoDiario,
                arribos,
                porVenirKg,
                sawtooth,
                status
            };
        });

        // Ordenar: primero quiebres más cercanos, luego bajo mínimo, luego sobrestock, luego activos por stock/consumo
        const priority = { STOCKOUT: 0, WARNING: 1, OVERMAX: 2, OK: 3, IDLE: 4 };
        return result.sort((a, b) => {
            if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
            if (a.status === 'STOCKOUT' && b.status === 'STOCKOUT') {
                return (a.sawtooth.stockoutDay ?? 999) - (b.sawtooth.stockoutDay ?? 999);
            }
            return (b.consumoDiario + b.porVenirKg) - (a.consumoDiario + a.porVenirKg);
        });
    }, [categories, items, stockTotalsByItem, consumption90dByItem, ordenes, horizonDays, includeOC]);

    const filteredCategories = useMemo(() => {
        if (!categorySearch.trim()) return categoryStats.filter(c => c.status !== 'IDLE');
        return categoryStats.filter(c => matchesSearch(categorySearch, c.nombre));
    }, [categoryStats, categorySearch]);

    // Auto-seleccionar primera categoría relevante
    useEffect(() => {
        if (filteredCategories.length === 0) return;
        const stillExists = filteredCategories.some(c => c.id === selectedCategoryId);
        if (!selectedCategoryId || !stillExists) {
            setSelectedCategoryId(filteredCategories[0].id);
        }
    }, [filteredCategories, selectedCategoryId]);

    const selectedCategory = useMemo(
        () => categoryStats.find(c => c.id === selectedCategoryId) || null,
        [categoryStats, selectedCategoryId]
    );

    // 5. Métricas y Gráfico Diente de Sierra de CAPACIDAD TOTAL DEL DEPÓSITO
    const warehouseMetrics = useMemo(() => {
        const filteredCapacityDepots = depotId
            ? capacityData.filter((d: any) => d.depotId === depotId)
            : capacityData;

        let totalCapacityM3 = 0;
        let occupiedM3 = 0;
        filteredCapacityDepots.forEach((dep: any) => {
            dep.categories?.forEach((cat: any) => {
                totalCapacityM3 += Number(cat.totalCapacity) || 0;
                occupiedM3 += Number(cat.occupiedVolume) || 0;
            });
        });

        // Stock total en kg y consumo total en kg/día del alcance actual
        let totalStockKg = 0;
        let totalConsumoDiarioKg = 0;
        let totalMinKg = 0;
        let totalMaxKg = 0;

        categoryStats.forEach(c => {
            totalStockKg += c.stockActual;
            totalConsumoDiarioKg += c.consumoDiario;
            if (c.minimo) totalMinKg += c.minimo;
            if (c.maximo) totalMaxKg += c.maximo;
        });

        // Relación real m³ por kg del depósito para proyectar volumen con consumos y arribos en kg
        let totalVolKilosRef = 0;
        volumesData.forEach((v: any) => {
            totalVolKilosRef += Number(v.currentKilos) || 0;
        });
        const kilosRef = totalStockKg > 0 ? totalStockKg : totalVolKilosRef;
        // Fallback conservador de densidad textil (~0.004 m³/kg = 250 kg/m³) si todavía no hay relación real
        const m3PerKg = occupiedM3 > 0 && kilosRef > 0 ? occupiedM3 / kilosRef : 0.004;

        // Todos los arribos de OC activas (filtrados a ítems del depósito si hay uno seleccionado)
        const allArribos = getArribosProgramados();
        const depotItemIds = new Set(items.map((i: any) => i.id));
        const depotItemCodes = new Set(
            items.map((i: any) => (i.codigoInterno ? String(i.codigoInterno).trim().toUpperCase() : '')).filter(Boolean)
        );
        const scopedArribos = depotId
            ? allArribos.filter(a =>
                (a.itemId && depotItemIds.has(a.itemId)) ||
                (a.codigoInterno && depotItemCodes.has(a.codigoInterno.trim().toUpperCase()))
            )
            : allArribos;

        const totalPorVenirKg = scopedArribos.reduce((acc, a) => acc + a.cantidadKg, 0);

        const sawtoothM3 = buildSawtoothSeries({
            initialValue: occupiedM3 > 0 ? occupiedM3 : totalStockKg * m3PerKg,
            dailyConsumption: totalConsumoDiarioKg,
            horizonDays,
            arribos: scopedArribos,
            includeOC,
            valueMultiplier: m3PerKg,
            minThreshold: null,
            maxThreshold: totalCapacityM3 > 0 ? totalCapacityM3 : null
        });

        const capacityKgEquivalent = totalCapacityM3 > 0 && m3PerKg > 0
            ? Math.round(totalCapacityM3 / m3PerKg)
            : (totalMaxKg > 0 ? totalMaxKg : null);

        const sawtoothKg = buildSawtoothSeries({
            initialValue: totalStockKg,
            dailyConsumption: totalConsumoDiarioKg,
            horizonDays,
            arribos: scopedArribos,
            includeOC,
            valueMultiplier: 1,
            minThreshold: totalMinKg > 0 ? totalMinKg : null,
            maxThreshold: capacityKgEquivalent
        });

        return {
            hasM3Capacity: totalCapacityM3 > 0,
            totalCapacityM3: Number(totalCapacityM3.toFixed(2)),
            occupiedM3: Number(occupiedM3.toFixed(2)),
            currentPctM3: totalCapacityM3 > 0 ? Number(((occupiedM3 / totalCapacityM3) * 100).toFixed(1)) : 0,
            totalStockKg: Math.round(totalStockKg),
            totalConsumoDiarioKg: Number(totalConsumoDiarioKg.toFixed(1)),
            totalPorVenirKg: Math.round(totalPorVenirKg),
            totalMinKg: Math.round(totalMinKg),
            capacityKgEquivalent,
            m3PerKg,
            scopedArribos,
            sawtoothM3,
            sawtoothKg
        };
    }, [capacityData, volumesData, depotId, categoryStats, items, ordenes, horizonDays, includeOC]);

    // Si el depósito no tiene capacidad en m³ configurada, caer automáticamente a kg
    useEffect(() => {
        if (!loadingCapacity && !warehouseMetrics.hasM3Capacity && warehouseUnit === 'm3') {
            setWarehouseUnit('kg');
        }
    }, [loadingCapacity, warehouseMetrics.hasM3Capacity, warehouseUnit]);

    const isLoading = loadingCategories || loadingItems || loadingStock || loadingMovements;

    // Helper para formatear ticks del eje X (número de día -> DD/MM)
    const formatDayTick = (dayNum: number) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + Math.round(dayNum));
        return formatDateShort(d);
    };

    const activeWarehouseSawtooth = warehouseUnit === 'm3' ? warehouseMetrics.sawtoothM3 : warehouseMetrics.sawtoothKg;
    const activeWarehouseMax = warehouseUnit === 'm3'
        ? (warehouseMetrics.totalCapacityM3 > 0 ? warehouseMetrics.totalCapacityM3 : null)
        : warehouseMetrics.capacityKgEquivalent;
    const activeWarehouseUnitLabel: 'm³' | 'kg' = warehouseUnit === 'm3' ? 'm³' : 'kg';

    const selectedDepotName = depotId
        ? (depots.find((d: any) => d.id === depotId)?.nombre || 'Depósito Seleccionado')
        : 'Todos los Depósitos';

    return (
        <Box sx={{ p: isMobile ? 1.5 : 3, maxWidth: 1600, mx: 'auto', color: colors.text }}>
            {/* HEADER */}
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 2,
                    mb: 3
                }}
            >
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <ShowChartIcon sx={{ color: colors.primary, fontSize: 30 }} />
                        <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                            Gráfico Diente de Sierra
                        </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>
                        Proyección de stock por categoría de material y ocupación proyectada del depósito según consumo histórico (90d) y órdenes de compra en camino.
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate('/compras/materiales-criticos-dashboard')}
                        sx={{
                            borderColor: colors.border,
                            color: colors.text,
                            textTransform: 'none',
                            '&:hover': { borderColor: colors.primary, color: colors.primary }
                        }}
                    >
                        Tablero de Compras
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<ReceiptLongIcon />}
                        onClick={() => navigate('/compras/ordenes-compra')}
                        sx={{
                            bgcolor: colors.primary,
                            color: '#111827',
                            fontWeight: 700,
                            textTransform: 'none',
                            '&:hover': { bgcolor: colors.primaryHover }
                        }}
                    >
                        Órdenes de Compra
                    </Button>
                </Box>
            </Box>

            {/* BARRA DE CONTROLES GLOBALES */}
            <Paper
                elevation={0}
                sx={{
                    p: 2,
                    mb: 3,
                    bgcolor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2.5,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 2,
                    justifyContent: 'space-between'
                }}
            >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                    <FormControl size="small" sx={{ minWidth: 210 }}>
                        <InputLabel sx={{ color: colors.textSecondary }}>Depósito</InputLabel>
                        <Select
                            value={depotId}
                            label="Depósito"
                            onChange={(e) => setDepotId(e.target.value)}
                            sx={{
                                color: colors.text,
                                bgcolor: colors.surfaceElevated,
                                '.MuiOutlinedInput-notchedOutline': { borderColor: colors.border }
                            }}
                        >
                            <MenuItem value="">Todos los Depósitos</MenuItem>
                            {depots.map((d: any) => (
                                <MenuItem key={d.id} value={d.id}>
                                    {d.nombre}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: colors.textSecondary, fontWeight: 600 }}>
                            Horizonte:
                        </Typography>
                        <ToggleButtonGroup
                            size="small"
                            exclusive
                            value={horizonDays}
                            onChange={(_, val) => val && setHorizonDays(val)}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    color: colors.textSecondary,
                                    borderColor: colors.border,
                                    px: 1.5,
                                    py: 0.5,
                                    fontSize: '0.78rem',
                                    '&.Mui-selected': {
                                        bgcolor: 'rgba(245, 158, 11, 0.18)',
                                        color: colors.primary,
                                        borderColor: colors.primary,
                                        fontWeight: 700
                                    }
                                }
                            }}
                        >
                            <ToggleButton value={30}>30 días</ToggleButton>
                            <ToggleButton value={60}>60 días</ToggleButton>
                            <ToggleButton value={90}>90 días</ToggleButton>
                            <ToggleButton value={120}>120 días</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>

                <FormControlLabel
                    control={
                        <Switch
                            checked={includeOC}
                            onChange={(e) => setIncludeOC(e.target.checked)}
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': { color: colors.success },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: colors.success }
                            }}
                        />
                    }
                    label={
                        <Typography variant="body2" sx={{ color: colors.text, fontWeight: 600 }}>
                            Incluir arribos de OC en camino
                        </Typography>
                    }
                />
            </Paper>

            {isLoading && <LinearProgress sx={{ mb: 2, borderRadius: 1, bgcolor: colors.surfaceElevated, '& .MuiLinearProgress-bar': { bgcolor: colors.primary } }} />}

            {/* ================================================================= */}
            {/* SECCIÓN 1: GRÁFICO DIENTE DE SIERRA POR CATEGORÍA DE MATERIAL     */}
            {/* ================================================================= */}
            <Paper
                elevation={0}
                sx={{
                    p: isMobile ? 1.5 : 2.5,
                    mb: 3.5,
                    bgcolor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ShowChartIcon sx={{ color: colors.primary }} />
                            1. Proyección por Categoría de Material
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                            Seleccioná una categoría para analizar su curva de consumo diario, saltos de ingreso por OC y riesgo de quiebre.
                        </Typography>
                    </Box>

                    <TextField
                        size="small"
                        placeholder="Buscar categoría..."
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: colors.textMuted, fontSize: 18 }} />
                                </InputAdornment>
                            )
                        }}
                        sx={{
                            minWidth: 240,
                            '& .MuiOutlinedInput-root': {
                                color: colors.text,
                                bgcolor: colors.surfaceElevated,
                                '& fieldset': { borderColor: colors.border }
                            }
                        }}
                    />
                </Box>

                {/* Layout Master-Detail: Lista de categorías a la izquierda + Gráfico a la derecha */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '290px 1fr',
                        gap: 2.5,
                        alignItems: 'start'
                    }}
                >
                    {/* Lista de Categorías */}
                    <Box
                        sx={{
                            maxHeight: isMobile ? 220 : 540,
                            overflowY: 'auto',
                            pr: 0.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1
                        }}
                    >
                        {filteredCategories.length === 0 ? (
                            <Typography variant="body2" sx={{ color: colors.textMuted, p: 2, textAlign: 'center' }}>
                                No se encontraron categorías activas.
                            </Typography>
                        ) : (
                            filteredCategories.map(cat => {
                                const isSelected = cat.id === selectedCategoryId;
                                const statusColor =
                                    cat.status === 'STOCKOUT' ? colors.danger
                                        : cat.status === 'WARNING' ? colors.warning
                                            : cat.status === 'OVERMAX' ? colors.purple
                                                : colors.success;

                                return (
                                    <Box
                                        key={cat.id}
                                        onClick={() => setSelectedCategoryId(cat.id)}
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 2,
                                            cursor: 'pointer',
                                            bgcolor: isSelected ? colors.surfaceElevated : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isSelected ? colors.primary : colors.border}`,
                                            borderLeft: `4px solid ${statusColor}`,
                                            transition: 'all 0.15s ease',
                                            '&:hover': { bgcolor: colors.surfaceHover }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: colors.text }} noWrap>
                                                {cat.nombre}
                                            </Typography>
                                            {cat.status === 'STOCKOUT' && (
                                                <Chip
                                                    size="small"
                                                    label={`Quiebre +${cat.sawtooth.stockoutDay}d`}
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        bgcolor: colors.dangerBg,
                                                        color: colors.danger
                                                    }}
                                                />
                                            )}
                                            {cat.status === 'WARNING' && (
                                                <Chip
                                                    size="small"
                                                    label="Bajo mín."
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        bgcolor: colors.warningBg,
                                                        color: colors.warning
                                                    }}
                                                />
                                            )}
                                            {cat.status === 'OK' && (
                                                <Chip
                                                    size="small"
                                                    label="OK"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        bgcolor: colors.successBg,
                                                        color: colors.success
                                                    }}
                                                />
                                            )}
                                        </Box>

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75, fontSize: '0.74rem', color: colors.textSecondary }}>
                                            <span>Stock: <strong style={{ color: colors.text }}>{Math.round(cat.stockActual).toLocaleString('es-AR')} kg</strong></span>
                                            <span>Cons: {cat.consumoDiario.toFixed(1)} kg/d</span>
                                        </Box>
                                        {cat.porVenirKg > 0 && (
                                            <Typography variant="caption" sx={{ color: colors.success, display: 'block', mt: 0.25, fontWeight: 600 }}>
                                                + {Math.round(cat.porVenirKg).toLocaleString('es-AR')} kg en camino ({cat.arribos.length} OC)
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })
                        )}
                    </Box>

                    {/* Panel del Gráfico de la Categoría Seleccionada */}
                    <Box>
                        {!selectedCategory ? (
                            <Box sx={{ p: 6, textAlign: 'center', color: colors.textMuted }}>
                                Seleccioná una categoría para visualizar su gráfico diente de sierra.
                            </Box>
                        ) : (
                            <>
                                {/* KPIs de la categoría */}
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                                        gap: 1.5,
                                        mb: 2
                                    }}
                                >
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Stock Actual</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.text }}>
                                            {Math.round(selectedCategory.stockActual).toLocaleString('es-AR')} kg
                                        </Typography>
                                    </Box>
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Consumo Diario (90d)</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.info }}>
                                            {selectedCategory.consumoDiario.toFixed(1)} kg/d
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                            ~{Math.round(selectedCategory.consumoDiario * 30).toLocaleString('es-AR')} kg/mes
                                        </Typography>
                                    </Box>
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>En Camino (OC)</Typography>
                                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.success }}>
                                            +{Math.round(selectedCategory.porVenirKg).toLocaleString('es-AR')} kg
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                            {selectedCategory.arribos.length} arribo(s) prog.
                                        </Typography>
                                    </Box>
                                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Mínimo / Máximo</Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 800, color: colors.warning, mt: 0.25 }}>
                                            {selectedCategory.minimo ? `${Math.round(selectedCategory.minimo).toLocaleString('es-AR')} kg` : '—'}
                                            <span style={{ color: colors.textMuted, fontWeight: 400 }}> / </span>
                                            <span style={{ color: colors.purple }}>
                                                {selectedCategory.maximo ? `${Math.round(selectedCategory.maximo).toLocaleString('es-AR')} kg` : '—'}
                                            </span>
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 2,
                                            bgcolor: selectedCategory.sawtooth.stockoutDay !== null ? colors.dangerBg : colors.successBg,
                                            border: `1px solid ${selectedCategory.sawtooth.stockoutDay !== null ? colors.danger : colors.success}44`
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Proyección Quiebre</Typography>
                                        <Typography
                                            variant="h6"
                                            sx={{
                                                fontWeight: 800,
                                                color: selectedCategory.sawtooth.stockoutDay !== null ? colors.danger : colors.success,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.5
                                            }}
                                        >
                                            {selectedCategory.sawtooth.stockoutDay !== null ? (
                                                <>
                                                    <ErrorOutlineIcon fontSize="small" />
                                                    Día +{selectedCategory.sawtooth.stockoutDay}
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircleOutlineIcon fontSize="small" />
                                                    Cubierto
                                                </>
                                            )}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                                            {selectedCategory.sawtooth.stockoutDate
                                                ? `Est. ${selectedCategory.sawtooth.stockoutDate}`
                                                : `Sin quiebre en ${horizonDays}d`}
                                        </Typography>
                                    </Box>
                                </Box>

                                {/* Gráfico Diente de Sierra de la Categoría */}
                                <Box
                                    sx={{
                                        height: 360,
                                        width: '100%',
                                        bgcolor: 'rgba(15,17,23,0.5)',
                                        borderRadius: 2,
                                        p: 1.5,
                                        border: `1px solid ${colors.border}`
                                    }}
                                >
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart
                                            data={selectedCategory.sawtooth.points}
                                            margin={{ top: 18, right: 24, left: 10, bottom: 5 }}
                                        >
                                            <defs>
                                                <linearGradient id="catSierraGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor={colors.primary} stopOpacity={0.02} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                            <XAxis
                                                dataKey="dayPos"
                                                type="number"
                                                domain={[0, horizonDays]}
                                                tickCount={Math.min(10, Math.floor(horizonDays / 5) + 1)}
                                                tickFormatter={formatDayTick}
                                                stroke={colors.textMuted}
                                                tick={{ fill: colors.textSecondary, fontSize: 11 }}
                                            />
                                            <YAxis
                                                stroke={colors.textMuted}
                                                tick={{ fill: colors.textSecondary, fontSize: 11 }}
                                                tickFormatter={(v) => `${Math.round(v).toLocaleString('es-AR')}`}
                                                width={62}
                                            />
                                            <RechartsTooltip content={<SawtoothTooltip unit="kg" maxCapacity={selectedCategory.maximo} />} />

                                            {selectedCategory.maximo && selectedCategory.maximo > 0 && (
                                                <ReferenceLine
                                                    y={selectedCategory.maximo}
                                                    stroke={colors.purple}
                                                    strokeDasharray="5 5"
                                                    label={{
                                                        value: `Máx: ${Math.round(selectedCategory.maximo).toLocaleString('es-AR')} kg`,
                                                        position: 'insideTopRight',
                                                        fill: colors.purple,
                                                        fontSize: 11
                                                    }}
                                                />
                                            )}

                                            {selectedCategory.minimo && selectedCategory.minimo > 0 && (
                                                <ReferenceLine
                                                    y={selectedCategory.minimo}
                                                    stroke={colors.danger}
                                                    strokeDasharray="4 4"
                                                    label={{
                                                        value: `Punto Reposición / Mín: ${Math.round(selectedCategory.minimo).toLocaleString('es-AR')} kg`,
                                                        position: 'insideTopRight',
                                                        fill: colors.danger,
                                                        fontSize: 11
                                                    }}
                                                />
                                            )}

                                            {includeOC && selectedCategory.porVenirKg > 0 && (
                                                <Line
                                                    type="linear"
                                                    dataKey="valueSinOC"
                                                    name="Sin OC"
                                                    stroke="#64748b"
                                                    strokeWidth={1.8}
                                                    strokeDasharray="4 4"
                                                    dot={false}
                                                    isAnimationActive={false}
                                                />
                                            )}

                                            <Area
                                                type="linear"
                                                dataKey="value"
                                                name="Stock Proyectado"
                                                stroke={colors.primary}
                                                strokeWidth={2.8}
                                                fill="url(#catSierraGrad)"
                                                dot={(props: any) => {
                                                    const { cx, cy, payload } = props;
                                                    if (!payload?.isArrivalPeak) return <g key={`empty-${props.index}`} />;
                                                    return (
                                                        <circle
                                                            key={`peak-${props.index}`}
                                                            cx={cx}
                                                            cy={cy}
                                                            r={5}
                                                            fill={colors.success}
                                                            stroke="#0f1117"
                                                            strokeWidth={2}
                                                        />
                                                    );
                                                }}
                                                activeDot={{ r: 6, fill: colors.primary, stroke: '#0f1117', strokeWidth: 2 }}
                                                isAnimationActive={false}
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </Box>

                                {/* Cronograma de Arribos de esta categoría */}
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <LocalShippingIcon sx={{ fontSize: 18, color: colors.success }} />
                                        Arribos programados para {selectedCategory.nombre} ({selectedCategory.arribos.length})
                                    </Typography>
                                    {selectedCategory.arribos.length === 0 ? (
                                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                            No hay órdenes de compra activas (EN CAMINO / PARCIAL) asociadas a esta categoría.
                                        </Typography>
                                    ) : (
                                        <TableContainer sx={{ maxHeight: 170, border: `1px solid ${colors.border}`, borderRadius: 2 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell sx={{ bgcolor: colors.surfaceElevated, color: colors.textSecondary, fontWeight: 700 }}>Fecha Est.</TableCell>
                                                        <TableCell sx={{ bgcolor: colors.surfaceElevated, color: colors.textSecondary, fontWeight: 700 }}>OC</TableCell>
                                                        <TableCell sx={{ bgcolor: colors.surfaceElevated, color: colors.textSecondary, fontWeight: 700 }}>Proveedor</TableCell>
                                                        <TableCell sx={{ bgcolor: colors.surfaceElevated, color: colors.textSecondary, fontWeight: 700 }}>Material</TableCell>
                                                        <TableCell align="right" sx={{ bgcolor: colors.surfaceElevated, color: colors.textSecondary, fontWeight: 700 }}>Pendiente</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {selectedCategory.arribos.map((arr, idx) => (
                                                        <TableRow key={idx} hover>
                                                            <TableCell sx={{ color: arr.fecha < today ? colors.danger : colors.text, fontWeight: 600 }}>
                                                                {arr.fecha} {arr.fecha < today ? '(Atrasada)' : ''}
                                                            </TableCell>
                                                            <TableCell sx={{ color: colors.primary, fontWeight: 700 }}>{arr.ordenNumero}</TableCell>
                                                            <TableCell sx={{ color: colors.textSecondary }}>{arr.partnerNombre}</TableCell>
                                                            <TableCell sx={{ color: colors.text }}>{arr.codigoInterno} · {arr.descripcion}</TableCell>
                                                            <TableCell align="right" sx={{ color: colors.success, fontWeight: 700 }}>
                                                                +{Math.round(arr.cantidadKg).toLocaleString('es-AR')} kg
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </Box>
                            </>
                        )}
                    </Box>
                </Box>
            </Paper>

            {/* ================================================================= */}
            {/* SECCIÓN 2: DIENTE DE SIERRA DE CAPACIDAD TOTAL DEL DEPÓSITO       */}
            {/* ================================================================= */}
            <Paper
                elevation={0}
                sx={{
                    p: isMobile ? 1.5 : 2.5,
                    bgcolor: colors.surface,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3
                }}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <WarehouseIcon sx={{ color: colors.indigo }} />
                            2. Capacidad Proyectada de Todo el Depósito — {selectedDepotName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                            Curva agregada diente de sierra de todo el depósito: consumo total diario vs. ingresos programados de todas las OC en camino frente a la capacidad máxima física.
                        </Typography>
                    </Box>

                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={warehouseUnit}
                        onChange={(_, val) => val && setWarehouseUnit(val)}
                        sx={{
                            '& .MuiToggleButton-root': {
                                color: colors.textSecondary,
                                borderColor: colors.border,
                                px: 1.5,
                                fontSize: '0.78rem',
                                textTransform: 'none',
                                '&.Mui-selected': {
                                    bgcolor: 'rgba(129, 140, 248, 0.2)',
                                    color: colors.indigo,
                                    borderColor: colors.indigo,
                                    fontWeight: 700
                                }
                            }
                        }}
                    >
                        <ToggleButton value="m3" disabled={!warehouseMetrics.hasM3Capacity}>
                            Capacidad Física (m³)
                        </ToggleButton>
                        <ToggleButton value="kg">
                            Stock Total (kg)
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>

                {/* Alerta de saturación si algún pico supera la capacidad máxima */}
                {activeWarehouseSawtooth.overMaxDays > 0 && activeWarehouseMax && (
                    <Alert
                        severity="warning"
                        icon={<WarningAmberIcon />}
                        sx={{
                            mb: 2,
                            bgcolor: colors.warningBg,
                            color: colors.text,
                            border: `1px solid ${colors.warning}55`,
                            '& .MuiAlert-icon': { color: colors.warning }
                        }}
                    >
                        <strong>Alerta de capacidad:</strong> La ocupación proyectada del depósito supera el 100% de la capacidad máxima (
                        {activeWarehouseUnitLabel === 'm³'
                            ? `${activeWarehouseMax.toLocaleString('es-AR')} m³`
                            : `${Math.round(activeWarehouseMax).toLocaleString('es-AR')} kg`}
                        ) durante <strong>{activeWarehouseSawtooth.overMaxDays} día(s)</strong>, con un pico estimado el <strong>{activeWarehouseSawtooth.peakDate}</strong>.
                    </Alert>
                )}

                {/* KPIs Globales del Depósito */}
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                        gap: 1.5,
                        mb: 2.5
                    }}
                >
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                            {warehouseUnit === 'm3' ? 'Ocupación Actual' : 'Stock Total Actual'}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.text }}>
                            {warehouseUnit === 'm3'
                                ? `${warehouseMetrics.occupiedM3.toLocaleString('es-AR')} m³`
                                : `${warehouseMetrics.totalStockKg.toLocaleString('es-AR')} kg`}
                        </Typography>
                        {warehouseUnit === 'm3' && warehouseMetrics.hasM3Capacity && (
                            <Typography variant="caption" sx={{ color: warehouseMetrics.currentPctM3 > 85 ? colors.warning : colors.success, fontWeight: 700 }}>
                                {warehouseMetrics.currentPctM3}% ocupado
                            </Typography>
                        )}
                    </Box>

                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                            {warehouseUnit === 'm3' ? 'Capacidad Máxima' : 'Capacidad Est. (kg)'}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.danger }}>
                            {activeWarehouseMax
                                ? (warehouseUnit === 'm3'
                                    ? `${activeWarehouseMax.toLocaleString('es-AR')} m³`
                                    : `${Math.round(activeWarehouseMax).toLocaleString('es-AR')} kg`)
                                : 'Sin definir'}
                        </Typography>
                    </Box>

                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Consumo Total Diario</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.info }}>
                            {warehouseMetrics.totalConsumoDiarioKg.toLocaleString('es-AR')} kg/d
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                            ~{(warehouseMetrics.totalConsumoDiarioKg * warehouseMetrics.m3PerKg).toFixed(2)} m³/d
                        </Typography>
                    </Box>

                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: colors.surfaceElevated, border: `1px solid ${colors.border}` }}>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Total OC en Camino</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 800, color: colors.success }}>
                            +{warehouseMetrics.totalPorVenirKg.toLocaleString('es-AR')} kg
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.textMuted }}>
                            {warehouseMetrics.scopedArribos.length} línea(s) de OC
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: activeWarehouseSawtooth.overMaxDays > 0 ? colors.dangerBg : colors.surfaceElevated,
                            border: `1px solid ${activeWarehouseSawtooth.overMaxDays > 0 ? colors.danger : colors.border}`
                        }}
                    >
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>Pico Proyectado ({horizonDays}d)</Typography>
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                color: activeWarehouseSawtooth.overMaxDays > 0 ? colors.danger : colors.indigo
                            }}
                        >
                            {warehouseUnit === 'm3'
                                ? `${activeWarehouseSawtooth.peakValue.toLocaleString('es-AR')} m³`
                                : `${Math.round(activeWarehouseSawtooth.peakValue).toLocaleString('es-AR')} kg`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                            Fecha pico: {activeWarehouseSawtooth.peakDate || '—'}
                            {activeWarehouseMax
                                ? ` (${((activeWarehouseSawtooth.peakValue / activeWarehouseMax) * 100).toFixed(0)}%)`
                                : ''}
                        </Typography>
                    </Box>
                </Box>

                {/* Gráfico Diente de Sierra del Depósito Completo */}
                <Box
                    sx={{
                        height: 380,
                        width: '100%',
                        bgcolor: 'rgba(15,17,23,0.5)',
                        borderRadius: 2,
                        p: 1.5,
                        border: `1px solid ${colors.border}`
                    }}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={activeWarehouseSawtooth.points}
                            margin={{ top: 20, right: 28, left: 12, bottom: 5 }}
                        >
                            <defs>
                                <linearGradient id="warehouseSierraGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={colors.indigo} stopOpacity={0.38} />
                                    <stop offset="95%" stopColor={colors.indigo} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis
                                dataKey="dayPos"
                                type="number"
                                domain={[0, horizonDays]}
                                tickCount={Math.min(10, Math.floor(horizonDays / 5) + 1)}
                                tickFormatter={formatDayTick}
                                stroke={colors.textMuted}
                                tick={{ fill: colors.textSecondary, fontSize: 11 }}
                            />
                            <YAxis
                                stroke={colors.textMuted}
                                tick={{ fill: colors.textSecondary, fontSize: 11 }}
                                domain={[
                                    0,
                                    (dataMax: number) => {
                                        const top = Math.max(dataMax, activeWarehouseMax || 0);
                                        return top > 0 ? Math.ceil(top * 1.12) : 100;
                                    }
                                ]}
                                tickFormatter={(v) =>
                                    warehouseUnit === 'm3'
                                        ? `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })} m³`
                                        : `${Math.round(v).toLocaleString('es-AR')}`
                                }
                                width={72}
                            />
                            <RechartsTooltip
                                content={
                                    <SawtoothTooltip
                                        unit={activeWarehouseUnitLabel}
                                        maxCapacity={activeWarehouseMax}
                                    />
                                }
                            />

                            {activeWarehouseMax && activeWarehouseMax > 0 && (
                                <>
                                    <ReferenceLine
                                        y={activeWarehouseMax}
                                        stroke={colors.danger}
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        label={{
                                            value: `Capacidad Máxima 100% (${warehouseUnit === 'm3'
                                                ? `${activeWarehouseMax.toLocaleString('es-AR')} m³`
                                                : `${Math.round(activeWarehouseMax).toLocaleString('es-AR')} kg`})`,
                                            position: 'insideTopRight',
                                            fill: colors.danger,
                                            fontSize: 11,
                                            fontWeight: 700
                                        }}
                                    />
                                    <ReferenceLine
                                        y={Number((activeWarehouseMax * 0.85).toFixed(2))}
                                        stroke={colors.warning}
                                        strokeDasharray="3 4"
                                        label={{
                                            value: 'Alerta 85%',
                                            position: 'insideTopRight',
                                            fill: colors.warning,
                                            fontSize: 11
                                        }}
                                    />
                                </>
                            )}

                            {includeOC && warehouseMetrics.totalPorVenirKg > 0 && (
                                <Line
                                    type="linear"
                                    dataKey="valueSinOC"
                                    name="Sin OC"
                                    stroke="#64748b"
                                    strokeWidth={1.8}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            )}

                            <Area
                                type="linear"
                                dataKey="value"
                                name="Ocupación Proyectada"
                                stroke={colors.indigo}
                                strokeWidth={2.8}
                                fill="url(#warehouseSierraGrad)"
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload?.isArrivalPeak) return <g key={`w-empty-${props.index}`} />;
                                    const isOver = activeWarehouseMax ? payload.value > activeWarehouseMax : false;
                                    return (
                                        <circle
                                            key={`w-peak-${props.index}`}
                                            cx={cx}
                                            cy={cy}
                                            r={5}
                                            fill={isOver ? colors.danger : colors.success}
                                            stroke="#0f1117"
                                            strokeWidth={2}
                                        />
                                    );
                                }}
                                activeDot={{ r: 6, fill: colors.indigo, stroke: '#0f1117', strokeWidth: 2 }}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </Box>

                <Divider sx={{ my: 2, borderColor: colors.border }} />

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'center', fontSize: '0.78rem', color: colors.textSecondary }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 12, height: 3, bgcolor: colors.indigo, borderRadius: 1 }} />
                        <span>Proyección con OC en camino</span>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 12, height: 0, borderTop: '2px dashed #64748b' }} />
                        <span>Tendencia sin OC (solo consumo)</span>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors.success }} />
                        <span>Arribo de OC (dentro de capacidad)</span>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colors.danger }} />
                        <span>Arribo de OC con sobresaturación (&gt;100%)</span>
                    </Box>
                </Box>
            </Paper>
        </Box>
    );
}
