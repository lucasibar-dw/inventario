import { useState, useMemo } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    TextField,
    MenuItem,
    IconButton,
    Chip,
    Table as MuiTable,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Drawer,
    Divider
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import ClearIcon from '@mui/icons-material/Clear';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip
} from 'recharts';

import { useGetRecentMovementsQuery, useGetStockQuery } from '../../features/warehouse/stock/api/stock.api';
import { useGetDepotsQuery } from '../../features/warehouse/deposito/api/deposito.api';
import { useGetItemCategoriesQuery } from '../../features/warehouse/materiales/api/items.api';
import { useLazyGetRemitoSalidaQuery } from '../../features/warehouse/remitosSalida/api/remitos-salida.api';
import { RemitoDetailModal } from '../../features/warehouse/remitos/ui/RemitoDetailModal';
import { PaginationControls, useClientPagination } from '../../shared/pagination';

const themeColors = {
    primary: '#f59e0b',
    primaryLight: 'rgba(245, 158, 11, 0.15)',
    bg: 'var(--bg-primary, #0f1117)',
    cardBg: 'var(--bg-hover-row, rgba(255,255,255,0.03))',
    border: 'rgba(255, 255, 255, 0.08)',
    text: 'var(--text-primary, #f3f4f6)',
    textDim: 'var(--text-muted, #9ca3af)',
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#38bdf8',
    inputBg: 'var(--bg-action-btn, rgba(255,255,255,0.05))'
};

const PIE_PALETTE = ['#f59e0b', '#38bdf8', '#10b981', '#ec4899', '#8b5cf6', '#f97316', '#06b6d4', '#64748b'];

const MONTH_NAMES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const normalizeText = (text: string) =>
    (text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
};

export default function ReporteConsumoDetalladoPage() {
    // ── Filtros Globales Reales del Sistema ──
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [depositoId, setDepositoId] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');

    // Rango de fechas correspondiente al año seleccionado
    const desde = `${selectedYear}-01-01`;
    const hasta = `${selectedYear}-12-31`;

    // ── Material Seleccionado para el Drawer Lateral ──
    const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

    // ── Consultas Backend Reales (Sin endpoints inventados) ──
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => rawDepots.filter((d: any) => d.activo !== false), [rawDepots]);

    const { data: categories = [] } = useGetItemCategoriesQuery(depositoId || undefined);

    // Movimientos reales: solo REMITO_SALIDA en el año seleccionado
    const { data: rawMovements = [], isFetching: isFetchingMovements } = useGetRecentMovementsQuery({
        desde,
        hasta,
        depositoId: depositoId || undefined,
        tipo: 'REMITO_SALIDA'
    });

    // Stock actual disponible real
    const { data: rawStock = [], isFetching: isFetchingStock } = useGetStockQuery({
        depotId: depositoId || undefined
    });

    // Remito modal detail
    const [selectedRemito, setSelectedRemito] = useState<any | null>(null);
    const [showRemitoModal, setShowRemitoModal] = useState(false);
    const [triggerGetRemitoDetail] = useLazyGetRemitoSalidaQuery();

    const handleViewRemito = async (docId: string | null) => {
        if (!docId) {
            alert('Este movimiento no tiene remito formal asociado.');
            return;
        }
        try {
            const doc = await triggerGetRemitoDetail(docId).unwrap();
            setSelectedRemito(doc);
            setShowRemitoModal(true);
        } catch {
            alert('No se pudo obtener el detalle del remito.');
        }
    };

    // ── Mapa de Stock Actual Disponible por itemId ──
    const stockMap = useMemo(() => {
        const map = new Map<string, number>();
        rawStock.forEach((s: any) => {
            const current = map.get(s.itemId) || 0;
            map.set(s.itemId, current + Math.max(0, Number(s.qtyPrincipal || 0)));
        });
        return map;
    }, [rawStock]);

    // ── Helper cliente real del remito ──
    const getClientName = (m: any): string => {
        return m.documento?.partner?.name || m.partner?.name || 'Sin Asignar';
    };

    // ── Filtrado estricto: REMITO_SALIDA y no ANULADO ──
    const validMovements = useMemo(() => {
        return rawMovements.filter((m: any) => {
            if (m.status === 'ANULADO') return false;
            if (m.tipo !== 'REMITO_SALIDA') return false;
            return true;
        });
    }, [rawMovements]);

    // Mes actual para cálculos de promedio transcurrido
    const now = new Date();
    const monthsElapsed = selectedYear === currentYear ? (now.getMonth() + 1) : 12;

    // ── Agrupación Maestra por Material ──
    const materialsMap = useMemo(() => {
        const map = new Map<string, {
            id: string;
            codigoInterno: string;
            descripcion: string;
            unidad: string;
            categoria: string;
            categoryId: string;
            proveedor: string;
            totalKilos: number;
            totalBultos: number;
            stockActual: number;
            promedioMensual: number;
            mesesCobertura: number;
            monthlyKilos: number[]; // 12 meses
            clientsMap: Record<string, number>;
            movements: any[];
        }>();

        validMovements.forEach((m: any) => {
            if (!m.item) return;
            const item = m.item;
            const itemId = item.id;
            const qty = Math.abs(Number(m.qtyPrincipal || 0));
            const bultos = Math.abs(Number(m.qtySecundaria || 0));
            const client = getClientName(m);

            let entry = map.get(itemId);
            if (!entry) {
                entry = {
                    id: itemId,
                    codigoInterno: item.codigoInterno || 'S/C',
                    descripcion: item.descripcion || item.codigoInterno || 'Material',
                    unidad: item.unidadPrincipal || 'KG',
                    categoria: item.category?.nombre || item.categoria || 'Sin Categoría',
                    categoryId: item.categoryId || item.category?.id || '',
                    proveedor: item.supplier?.name || m.supplier?.name || '—',
                    totalKilos: 0,
                    totalBultos: 0,
                    stockActual: stockMap.get(itemId) || 0,
                    promedioMensual: 0,
                    mesesCobertura: Infinity,
                    monthlyKilos: Array(12).fill(0),
                    clientsMap: {},
                    movements: []
                };
                map.set(itemId, entry);
            }

            entry.totalKilos += qty;
            entry.totalBultos += bultos;
            entry.movements.push(m);
            entry.clientsMap[client] = (entry.clientsMap[client] || 0) + qty;

            if (m.fecha) {
                const datePart = String(m.fecha).slice(0, 10);
                const [, mStr] = datePart.split('-');
                const monthIndex = parseInt(mStr, 10) - 1;
                if (monthIndex >= 0 && monthIndex < 12) {
                    entry.monthlyKilos[monthIndex] += qty;
                }
            }
        });

        // Calcular promedios mensuales y cobertura real de stock
        map.forEach((entry) => {
            entry.promedioMensual = monthsElapsed > 0 ? (entry.totalKilos / monthsElapsed) : 0;
            entry.mesesCobertura = entry.promedioMensual > 0 ? (entry.stockActual / entry.promedioMensual) : Infinity;
        });

        return map;
    }, [validMovements, stockMap, monthsElapsed]);

    // Lista ordenada de materiales por consumo total descendente
    const allMaterialsList = useMemo(() => {
        return Array.from(materialsMap.values()).sort((a, b) => b.totalKilos - a.totalKilos);
    }, [materialsMap]);

    // Lista filtrada por categoría y búsqueda de texto
    const filteredMaterialsList = useMemo(() => {
        let list = allMaterialsList;

        if (selectedCategoryId) {
            list = list.filter(m => m.categoryId === selectedCategoryId || m.categoria === selectedCategoryId);
        }

        const q = normalizeText(searchQuery);
        if (q) {
            list = list.filter(m =>
                normalizeText(m.codigoInterno).includes(q) ||
                normalizeText(m.descripcion).includes(q) ||
                normalizeText(m.proveedor).includes(q)
            );
        }

        return list;
    }, [allMaterialsList, selectedCategoryId, searchQuery]);

    const pagination = useClientPagination(filteredMaterialsList, 15);

    // Material actualmente abierto en el Drawer lateral
    const currentDrawerMaterial = useMemo(() => {
        if (!selectedMaterialId) return null;
        return materialsMap.get(selectedMaterialId) || null;
    }, [selectedMaterialId, materialsMap]);

    // ── Resumen Global Mensual (Macro: 12 meses sumados de todos los materiales) ──
    const globalMonthlyEvolution = useMemo(() => {
        const months = Array(12).fill(0);
        validMovements.forEach((m: any) => {
            if (m.fecha) {
                const datePart = String(m.fecha).slice(0, 10);
                const [, mStr] = datePart.split('-');
                const monthIndex = parseInt(mStr, 10) - 1;
                if (monthIndex >= 0 && monthIndex < 12) {
                    months[monthIndex] += Math.abs(Number(m.qtyPrincipal || 0));
                }
            }
        });

        return MONTH_NAMES.map((name, idx) => ({
            mes: name,
            kilos: Number(months[idx].toFixed(1))
        }));
    }, [validMovements]);

    // ── Resumen por Categorías Reales ──
    const categoriesSummary = useMemo(() => {
        const catMap: Record<string, { nombre: string; totalKilos: number; totalMateriales: number }> = {};

        allMaterialsList.forEach((m) => {
            const catName = m.categoria || 'Sin Categoría';
            if (!catMap[catName]) {
                catMap[catName] = { nombre: catName, totalKilos: 0, totalMateriales: 0 };
            }
            catMap[catName].totalKilos += m.totalKilos;
            catMap[catName].totalMateriales += 1;
        });

        return Object.values(catMap).sort((a, b) => b.totalKilos - a.totalKilos);
    }, [allMaterialsList]);

    // ── KPIs Ejecutivos ──
    const kpis = useMemo(() => {
        let totalKilos = 0;
        let totalBultos = 0;
        const remitosSet = new Set<string>();

        validMovements.forEach((m: any) => {
            totalKilos += Math.abs(Number(m.qtyPrincipal || 0));
            totalBultos += Math.abs(Number(m.qtySecundaria || 0));
            if (m.documentoId || m.documentoNumero) {
                remitosSet.add(m.documentoId || m.documentoNumero);
            }
        });

        const promMensualGlobal = monthsElapsed > 0 ? (totalKilos / monthsElapsed) : 0;
        const topMaterial = allMaterialsList[0] || null;

        return {
            totalKilos,
            totalBultos,
            totalRemitos: remitosSet.size || validMovements.length,
            promMensualGlobal,
            topMaterial
        };
    }, [validMovements, monthsElapsed, allMaterialsList]);

    // ── Exportación a Excel ──
    const handleExportExcel = () => {
        const rows = filteredMaterialsList.map(m => {
            const rowObj: Record<string, any> = {
                'Código': m.codigoInterno,
                'Descripción': m.descripcion,
                'Categoría': m.categoria,
                'Proveedor': m.proveedor,
            };
            MONTH_NAMES.forEach((mes, idx) => {
                rowObj[mes] = Number(m.monthlyKilos[idx].toFixed(2));
            });
            rowObj[`Total Salidas ${selectedYear}`] = Number(m.totalKilos.toFixed(2));
            rowObj['Promedio Mensual (kg)'] = Number(m.promedioMensual.toFixed(2));
            rowObj['Stock Actual (kg)'] = Number(m.stockActual.toFixed(2));
            rowObj['Meses de Cobertura'] = m.mesesCobertura !== Infinity ? Number(m.mesesCobertura.toFixed(1)) : 'Sin salida regular';
            return rowObj;
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Consumo_${selectedYear}`);
        XLSX.writeFile(wb, `Consumo_Materiales_${selectedYear}.xlsx`);
    };

    const isLoading = isFetchingMovements || isFetchingStock;

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, bgcolor: themeColors.bg, minHeight: '100vh', color: themeColors.text }}>

            {/* ── HEADER PRINCIPAL Y ACCIONES ── */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.primary, letterSpacing: '-0.5px' }}>
                            📊 Consumo y Salidas de Materiales
                        </Typography>
                        <Chip
                            label="Remitos de Salida"
                            size="small"
                            sx={{ bgcolor: 'rgba(56, 189, 248, 0.15)', color: themeColors.info, fontWeight: 800, fontSize: '0.68rem' }}
                        />
                    </Box>
                    <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                        Análisis operativo de salidas reales por remito, evolución mensual y cobertura de stock
                    </Typography>
                </Box>

                <Button
                    size="small"
                    variant="contained"
                    startIcon={<FileDownloadIcon />}
                    onClick={handleExportExcel}
                    sx={{
                        bgcolor: '#10b981',
                        color: '#fff',
                        fontWeight: 800,
                        borderRadius: 2,
                        textTransform: 'none',
                        '&:hover': { bgcolor: '#059669' }
                    }}
                >
                    Exportar Tabla Completa
                </Button>
            </Box>

            {/* ── BARRA SUPERIOR DE FILTROS REALES ── */}
            <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                    
                    {/* Selector de Año */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700 }}>
                            AÑO:
                        </Typography>
                        {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                            <Button
                                key={y}
                                size="small"
                                variant={selectedYear === y ? 'contained' : 'outlined'}
                                onClick={() => setSelectedYear(y)}
                                sx={{
                                    borderRadius: 2,
                                    py: 0.3,
                                    px: 1.5,
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    bgcolor: selectedYear === y ? themeColors.primary : 'transparent',
                                    color: selectedYear === y ? '#000' : themeColors.textDim,
                                    borderColor: selectedYear === y ? themeColors.primary : themeColors.border,
                                    '&:hover': {
                                        borderColor: themeColors.primary,
                                        bgcolor: selectedYear === y ? themeColors.primary : 'rgba(245, 158, 11, 0.08)'
                                    }
                                }}
                            >
                                {y}
                            </Button>
                        ))}
                    </Box>

                    {/* Filtros de Depósito y Categoría */}
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField
                            select
                            size="small"
                            label="Depósito"
                            value={depositoId}
                            onChange={(e) => setDepositoId(e.target.value)}
                            sx={{
                                minWidth: 160,
                                '& .MuiOutlinedInput-root': { bgcolor: themeColors.inputBg, borderRadius: 2, fontSize: '0.85rem' }
                            }}
                        >
                            <MenuItem value="">Todos los depósitos</MenuItem>
                            {depots.map((d: any) => (
                                <MenuItem key={d.id} value={d.id}>{d.nombre}</MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            size="small"
                            label="Categoría"
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            sx={{
                                minWidth: 170,
                                '& .MuiOutlinedInput-root': { bgcolor: themeColors.inputBg, borderRadius: 2, fontSize: '0.85rem' }
                            }}
                        >
                            <MenuItem value="">Todas las categorías</MenuItem>
                            {categories.map((c: any) => (
                                <MenuItem key={c.id || c.nombre} value={c.id || c.nombre}>{c.nombre}</MenuItem>
                            ))}
                        </TextField>
                    </Box>
                </Box>
            </Paper>

            {/* ── 4 KPIS EJECUTIVOS ── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Total Despachado ({selectedYear})
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.primary, mt: 0.5 }}>
                        {kpis.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '0.8rem', fontWeight: 500 }}>kg</small>
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        {kpis.totalBultos.toLocaleString('es-AR')} bultos en {kpis.totalRemitos} remitos
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Promedio Mensual Real
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.info, mt: 0.5 }}>
                        {kpis.promMensualGlobal.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '0.8rem', fontWeight: 500 }}>kg/mes</small>
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Calculado sobre {monthsElapsed} meses transcurridos
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Materiales con Salida
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.text, mt: 0.5 }}>
                        {allMaterialsList.length}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Artículos diferentes con movimiento
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Mayor Salida ({selectedYear})
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.success, mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kpis.topMaterial ? kpis.topMaterial.codigoInterno : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kpis.topMaterial ? `${kpis.topMaterial.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg (${kpis.topMaterial.descripcion})` : 'Sin datos'}
                    </Typography>
                </Paper>
            </Box>

            {/* ── VISIÓN MACRO: BARRAS MENSUALES TOTALES + CATEGORÍAS (Lado a lado) ── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2 }}>
                
                {/* Evolución Mensual Global de Salidas */}
                <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: themeColors.text }}>
                                📈 Salidas Totales por Mes ({selectedYear})
                            </Typography>
                            <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                                Volumen consolidado despachado por remito mes a mes
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ height: 210, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={globalMonthlyEvolution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="mes" stroke={themeColors.textDim} fontSize={12} tickLine={false} />
                                <YAxis stroke={themeColors.textDim} fontSize={12} tickLine={false} unit=" kg" />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e2230', borderColor: themeColors.border, borderRadius: 8, color: '#fff' }}
                                    formatter={(value: any) => [`${Number(value).toLocaleString('es-AR')} kg`, 'Total Despachado']}
                                />
                                <Bar dataKey="kilos" fill={themeColors.primary} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </Paper>

                {/* Distribución por Categoría Real */}
                <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5, display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: themeColors.text }}>
                        🏷️ Participación por Categoría
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, mb: 1.5 }}>
                        Porcentaje del volumen total despachado
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, overflowY: 'auto', maxHeight: 200 }}>
                        {categoriesSummary.map((cat, idx) => {
                            const pct = kpis.totalKilos > 0 ? (cat.totalKilos / kpis.totalKilos) * 100 : 0;
                            return (
                                <Box
                                    key={cat.nombre}
                                    sx={{
                                        p: 1,
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        borderRadius: 1.5,
                                        border: `1px solid ${themeColors.border}`,
                                        cursor: 'pointer',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                    }}
                                    onClick={() => setSelectedCategoryId(selectedCategoryId === cat.nombre ? '' : cat.nombre)}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.4 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PIE_PALETTE[idx % PIE_PALETTE.length] }} />
                                            <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.text }}>
                                                {cat.nombre}
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                            {cat.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg ({pct.toFixed(0)}%)
                                        </Typography>
                                    </Box>
                                    <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: PIE_PALETTE[idx % PIE_PALETTE.length] }} />
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Paper>
            </Box>

            {/* ── TABLA MAESTRA INTEGRADA: MATRIZ MENSUAL + COBERTURA + ACCESO A FICHA ── */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                
                {/* Barra de Búsqueda sobre la Tabla */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <TextField
                        size="small"
                        placeholder="Buscar por código de material, descripción o proveedor..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: <SearchIcon sx={{ color: themeColors.textDim, mr: 1, fontSize: '1.2rem' }} />,
                            endAdornment: searchQuery ? (
                                <IconButton size="small" onClick={() => setSearchQuery('')}>
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            ) : null
                        }}
                        sx={{
                            minWidth: 340,
                            '& .MuiOutlinedInput-root': { bgcolor: themeColors.cardBg, borderRadius: 2 }
                        }}
                    />

                    <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                        Mostrando <strong>{filteredMaterialsList.length}</strong> materiales con salida en {selectedYear}
                    </Typography>
                </Box>

                {/* Tabla Maestra */}
                <Paper sx={{ bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5, overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 600 }}>
                        <MuiTable size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 100 }}>Código</TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 220 }}>Descripción</TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 120 }}>Categoría</TableCell>
                                    {MONTH_NAMES.map((m) => (
                                        <TableCell key={m} sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right', minWidth: 60, fontSize: '0.75rem' }}>
                                            {m}
                                        </TableCell>
                                    ))}
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.primary, fontWeight: 900, textAlign: 'right', minWidth: 95 }}>
                                        Total {selectedYear}
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right', minWidth: 85 }}>
                                        Prom/Mes
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.info, fontWeight: 800, textAlign: 'right', minWidth: 85 }}>
                                        Stock
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'center', minWidth: 90 }}>
                                        Cobertura
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'center', minWidth: 60 }}>
                                        Ficha
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={19} sx={{ textAlign: 'center', py: 5 }}>
                                            <CircularProgress size={30} sx={{ color: themeColors.primary }} />
                                        </TableCell>
                                    </TableRow>
                                ) : pagination.pageItems.map((m) => {
                                    // Cobertura visual: meses de stock restantes
                                    const cob = m.mesesCobertura;
                                    let cobColor = themeColors.success;
                                    let cobLabel = `${cob.toFixed(1)} m`;

                                    if (cob === Infinity) {
                                        cobColor = themeColors.textDim;
                                        cobLabel = '—';
                                    } else if (cob < 0.5) { // menos de 15 días
                                        cobColor = themeColors.danger;
                                    } else if (cob < 1) { // menos de 1 mes
                                        cobColor = themeColors.warning;
                                    }

                                    return (
                                        <TableRow
                                            key={m.id}
                                            hover
                                            sx={{
                                                cursor: 'pointer',
                                                bgcolor: selectedMaterialId === m.id ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)' }
                                            }}
                                            onClick={() => setSelectedMaterialId(m.id)}
                                        >
                                            <TableCell sx={{ color: themeColors.primary, fontWeight: 800, fontSize: '0.82rem' }}>
                                                {m.codigoInterno}
                                            </TableCell>
                                            <TableCell sx={{ color: themeColors.text, fontSize: '0.82rem' }}>
                                                {m.descripcion}
                                            </TableCell>
                                            <TableCell sx={{ color: themeColors.textDim, fontSize: '0.78rem' }}>
                                                {m.categoria}
                                            </TableCell>
                                            {MONTH_NAMES.map((_, idx) => {
                                                const val = m.monthlyKilos[idx];
                                                return (
                                                    <TableCell
                                                        key={idx}
                                                        sx={{
                                                            textAlign: 'right',
                                                            fontSize: '0.76rem',
                                                            color: val > 0 ? themeColors.text : 'rgba(255,255,255,0.12)',
                                                            fontWeight: val > 0 ? 600 : 400
                                                        }}
                                                    >
                                                        {val > 0 ? Math.round(val).toLocaleString('es-AR') : '—'}
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.primary, fontWeight: 900, fontSize: '0.85rem' }}>
                                                {m.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.textDim, fontSize: '0.8rem' }}>
                                                {m.promedioMensual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.info, fontWeight: 800, fontSize: '0.82rem' }}>
                                                {m.stockActual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Chip
                                                    label={cobLabel}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: `${cobColor}15`,
                                                        color: cobColor,
                                                        fontWeight: 800,
                                                        fontSize: '0.72rem',
                                                        height: 20
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedMaterialId(m.id);
                                                    }}
                                                    sx={{ color: themeColors.info }}
                                                >
                                                    <VisibilityIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}

                                {!isLoading && pagination.pageItems.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={19} sx={{ textAlign: 'center', py: 4, color: themeColors.textDim }}>
                                            No se encontraron salidas para los filtros seleccionados.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </MuiTable>
                    </TableContainer>

                    {/* Controles de Paginación */}
                    <Box sx={{ p: 1.5, borderTop: `1px solid ${themeColors.border}` }}>
                        <PaginationControls
                            count={filteredMaterialsList.length}
                            page={pagination.page}
                            pageSize={pagination.pageSize}
                            onPageChange={pagination.setPage}
                            onPageSizeChange={pagination.setPageSize}
                        />
                    </Box>
                </Paper>
            </Box>

            {/* ── PANEL LATERAL (DRAWER): FICHA EN PROFUNDIDAD DEL MATERIAL SELECCIONADO ── */}
            <Drawer
                anchor="right"
                open={Boolean(currentDrawerMaterial)}
                onClose={() => setSelectedMaterialId(null)}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 540, md: 620 },
                        bgcolor: '#131620',
                        color: themeColors.text,
                        borderLeft: `1px solid ${themeColors.border}`,
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2.5
                    }
                }}
            >
                {currentDrawerMaterial && (
                    <>
                        {/* Header del Drawer */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                    {currentDrawerMaterial.codigoInterno}
                                </Typography>
                                <Typography variant="body2" sx={{ color: themeColors.text }}>
                                    {currentDrawerMaterial.descripcion}
                                </Typography>
                                <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                                    Categoría: <strong>{currentDrawerMaterial.categoria}</strong> · Proveedor: <strong>{currentDrawerMaterial.proveedor}</strong>
                                </Typography>
                            </Box>
                            <IconButton onClick={() => setSelectedMaterialId(null)} sx={{ color: themeColors.textDim }}>
                                <CloseIcon />
                            </IconButton>
                        </Box>

                        <Divider sx={{ borderColor: themeColors.border }} />

                        {/* Tarjetas Clave de Stock y Consumo del Material */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                            <Paper sx={{ p: 1.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, fontSize: '0.65rem' }}>
                                    TOTAL {selectedYear}
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                    {currentDrawerMaterial.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg
                                </Typography>
                            </Paper>

                            <Paper sx={{ p: 1.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, fontSize: '0.65rem' }}>
                                    STOCK ACTUAL
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: themeColors.info }}>
                                    {currentDrawerMaterial.stockActual.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg
                                </Typography>
                            </Paper>

                            <Paper sx={{ p: 1.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, fontSize: '0.65rem' }}>
                                    COBERTURA
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: currentDrawerMaterial.mesesCobertura < 1 ? themeColors.danger : themeColors.success }}>
                                    {currentDrawerMaterial.mesesCobertura !== Infinity ? `${currentDrawerMaterial.mesesCobertura.toFixed(1)} meses` : '—'}
                                </Typography>
                            </Paper>
                        </Box>

                        {/* Gráfico Histórico Mensual Específico */}
                        <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.textDim, display: 'block', mb: 1.5, textTransform: 'uppercase' }}>
                                📈 Evolución Mes a Mes ({selectedYear})
                            </Typography>
                            <Box sx={{ height: 180, width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={MONTH_NAMES.map((name, idx) => ({
                                        mes: name,
                                        kilos: Number(currentDrawerMaterial.monthlyKilos[idx].toFixed(1))
                                    }))}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis dataKey="mes" stroke={themeColors.textDim} fontSize={11} tickLine={false} />
                                        <YAxis stroke={themeColors.textDim} fontSize={11} tickLine={false} unit=" kg" />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: '#1e2230', borderColor: themeColors.border, borderRadius: 8, color: '#fff' }}
                                            formatter={(value: any) => [`${Number(value).toLocaleString('es-AR')} kg`, 'Salida']}
                                        />
                                        <Bar dataKey="kilos" fill={themeColors.primary} radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Box>
                        </Paper>

                        {/* Ranking de Clientes */}
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.textDim, display: 'block', mb: 1, textTransform: 'uppercase' }}>
                                🏢 Destinos / Clientes del Material
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {Object.entries(currentDrawerMaterial.clientsMap)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([client, qty], idx) => {
                                        const pct = currentDrawerMaterial.totalKilos > 0 ? (qty / currentDrawerMaterial.totalKilos) * 100 : 0;
                                        return (
                                            <Box key={client} sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: `1px solid ${themeColors.border}` }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 700, color: themeColors.text }}>
                                                        {idx + 1}. {client}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.primary }}>
                                                        {qty.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg ({pct.toFixed(0)}%)
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                    <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: themeColors.primary }} />
                                                </Box>
                                            </Box>
                                        );
                                    })}
                            </Box>
                        </Box>

                        {/* Remitos Detallados */}
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.textDim, display: 'block', mb: 1, textTransform: 'uppercase' }}>
                                📋 Últimos Remitos de Salida ({currentDrawerMaterial.movements.length})
                            </Typography>
                            <TableContainer sx={{ maxHeight: 250, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                                <MuiTable size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, py: 0.8, fontSize: '0.75rem' }}>Fecha</TableCell>
                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, py: 0.8, fontSize: '0.75rem' }}>Remito</TableCell>
                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, py: 0.8, fontSize: '0.75rem' }}>Cliente</TableCell>
                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, py: 0.8, fontSize: '0.75rem', textAlign: 'right' }}>Kilos</TableCell>
                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, py: 0.8, fontSize: '0.75rem', textAlign: 'center' }}>Ver</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {currentDrawerMaterial.movements.map((m: any, idx: number) => (
                                            <TableRow key={m.id || idx}>
                                                <TableCell sx={{ color: themeColors.text, fontSize: '0.75rem', py: 0.6 }}>{formatDate(m.fecha)}</TableCell>
                                                <TableCell sx={{ color: themeColors.info, fontWeight: 700, fontSize: '0.75rem', py: 0.6 }}>
                                                    {m.documentoNumero || m.documento?.numero || 'S/N'}
                                                </TableCell>
                                                <TableCell sx={{ color: themeColors.textDim, fontSize: '0.75rem', py: 0.6 }}>{getClientName(m)}</TableCell>
                                                <TableCell sx={{ color: themeColors.primary, fontWeight: 800, textAlign: 'right', fontSize: '0.75rem', py: 0.6 }}>
                                                    {Math.abs(Number(m.qtyPrincipal || 0)).toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                                                </TableCell>
                                                <TableCell sx={{ textAlign: 'center', py: 0.4 }}>
                                                    {m.documentoId ? (
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleViewRemito(m.documentoId)}
                                                            sx={{ color: themeColors.textDim, '&:hover': { color: themeColors.info } }}
                                                        >
                                                            <VisibilityIcon sx={{ fontSize: '1rem' }} />
                                                        </IconButton>
                                                    ) : '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </MuiTable>
                            </TableContainer>
                        </Box>
                    </>
                )}
            </Drawer>

            {/* Modal de Remito Formal */}
            {showRemitoModal && selectedRemito && (
                <RemitoDetailModal
                    open={showRemitoModal}
                    onClose={() => {
                        setShowRemitoModal(false);
                        setSelectedRemito(null);
                    }}
                    remito={selectedRemito}
                />
            )}
        </Box>
    );
}
