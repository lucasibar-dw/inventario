import React, { useState, useMemo } from 'react';
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
    Tooltip,
    Tabs,
    Tab,
    Autocomplete
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CategoryIcon from '@mui/icons-material/Category';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ClearIcon from '@mui/icons-material/Clear';
import * as XLSX from 'xlsx';
import {
    ResponsiveContainer, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    PieChart, Pie, Cell, Legend
} from 'recharts';

import { useGetRecentMovementsQuery, useGetStockQuery } from '../../features/warehouse/stock/api/stock.api';
import { useGetDepotsQuery } from '../../features/warehouse/deposito/api/deposito.api';
import { useGetItemsQuery, useGetItemCategoriesQuery } from '../../features/warehouse/materiales/api/items.api';
import { useLazyGetRemitoSalidaQuery } from '../../features/warehouse/remitosSalida/api/remitos-salida.api';
import { RemitoDetailModal } from '../../features/warehouse/remitos/ui/RemitoDetailModal';
import { PaginationControls, useClientPagination } from '../../shared/pagination';

const themeColors = {
    primary: '#f59e0b',
    primaryLight: 'rgba(245, 158, 11, 0.15)',
    secondary: 'var(--text-mui-secondary, #475569)',
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
    // ── Pestaña Activa ──
    // 0: Ficha por Material, 1: Histórico Mensual (Matriz), 2: Por Categoría
    const [currentTab, setCurrentTab] = useState<number>(0);

    // ── Filtros Globales de Período ──
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [periodPreset, setPeriodPreset] = useState<'30D' | '90D' | 'YEAR' | 'ALL'>('YEAR');

    const [desde, setDesde] = useState(() => `${currentYear}-01-01`);
    const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // Manejo de presets
    const handlePresetChange = (preset: '30D' | '90D' | 'YEAR' | 'ALL') => {
        setPeriodPreset(preset);
        const today = new Date();
        const endStr = today.toISOString().split('T')[0];
        setHasta(endStr);

        if (preset === '30D') {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            setDesde(d.toISOString().split('T')[0]);
        } else if (preset === '90D') {
            const d = new Date();
            d.setDate(d.getDate() - 90);
            setDesde(d.toISOString().split('T')[0]);
        } else if (preset === 'YEAR') {
            setDesde(`${selectedYear}-01-01`);
            setHasta(`${selectedYear}-12-31`);
        } else if (preset === 'ALL') {
            setDesde('');
            setHasta('');
        }
    };

    const handleYearChange = (year: number) => {
        setSelectedYear(year);
        if (periodPreset === 'YEAR') {
            setDesde(`${year}-01-01`);
            setHasta(`${year}-12-31`);
        }
    };

    // ── Depósito y Categoría ──
    const [depositoId, setDepositoId] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

    // ── Material Seleccionado (para Tab 0: Ficha) ──
    const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

    // ── Búsqueda de texto en listas ──
    const [searchQuery, setSearchQuery] = useState('');

    // ── Consultas Backend ──
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => rawDepots.filter((d: any) => d.activo !== false), [rawDepots]);

    const { data: categories = [] } = useGetItemCategoriesQuery(depositoId || undefined);
    const { data: allItems = [], isFetching: isFetchingItems } = useGetItemsQuery({});

    // Consulta exclusiva de REMITO_SALIDA en el rango seleccionado
    const { data: rawMovements = [], isFetching: isFetchingMovements } = useGetRecentMovementsQuery({
        desde: desde || undefined,
        hasta: hasta || undefined,
        depositoId: depositoId || undefined,
        tipo: 'REMITO_SALIDA'
    });

    // Stock actual disponible
    const { data: rawStock = [], isFetching: isFetchingStock } = useGetStockQuery({
        depotId: depositoId || undefined
    });

    // Modal de comprobante de remito
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

    // ── Stock agrupado por itemId ──
    const stockMap = useMemo(() => {
        const map = new Map<string, number>();
        rawStock.forEach((s: any) => {
            const current = map.get(s.itemId) || 0;
            map.set(s.itemId, current + Math.max(0, Number(s.qtyPrincipal || 0)));
        });
        return map;
    }, [rawStock]);

    // ── Helper cliente ──
    const getClientName = (m: any): string => {
        return m.documento?.partner?.name || m.partner?.name || 'Consumidor Final / Sin Asignar';
    };

    // ── Movimientos válidos (REMITO_SALIDA sin anulados) ──
    const validMovements = useMemo(() => {
        return rawMovements.filter((m: any) => {
            if (m.status === 'ANULADO') return false;
            if (m.tipo !== 'REMITO_SALIDA') return false;
            return true;
        });
    }, [rawMovements]);

    // ── Agrupación maestra de consumos por material ──
    const materialsSummaryMap = useMemo(() => {
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
            movements: any[];
            monthlyKilos: number[]; // 12 meses (0 a 11)
            clientsMap: Record<string, number>;
        }>();

        // Inicializar con todos los items que tengan movimientos o stock
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
                    movements: [],
                    monthlyKilos: Array(12).fill(0),
                    clientsMap: {}
                };
                map.set(itemId, entry);
            }

            entry.totalKilos += qty;
            entry.totalBultos += bultos;
            entry.movements.push(m);
            entry.clientsMap[client] = (entry.clientsMap[client] || 0) + qty;

            // Extraer mes de la fecha del remito
            if (m.fecha) {
                const datePart = String(m.fecha).slice(0, 10);
                const [yStr, mStr] = datePart.split('-');
                const y = parseInt(yStr, 10);
                const monthIndex = parseInt(mStr, 10) - 1;
                // Si coincide con el año seleccionado (o para la matriz anual)
                if (monthIndex >= 0 && monthIndex < 12 && (!selectedYear || y === selectedYear)) {
                    entry.monthlyKilos[monthIndex] += qty;
                }
            }
        });

        return map;
    }, [validMovements, stockMap, selectedYear]);

    // Lista ordenada de materiales por consumo total descendente
    const materialsList = useMemo(() => {
        let list = Array.from(materialsSummaryMap.values());
        if (selectedCategoryId) {
            list = list.filter(m => m.categoryId === selectedCategoryId || m.categoria === selectedCategoryId);
        }
        return list.sort((a, b) => b.totalKilos - a.totalKilos);
    }, [materialsSummaryMap, selectedCategoryId]);

    // Autoseleccionar el primer material para la Ficha si no hay uno seleccionado
    const currentMaterial = useMemo(() => {
        if (!materialsList.length) return null;
        if (selectedMaterialId) {
            const found = materialsSummaryMap.get(selectedMaterialId);
            if (found) return found;
        }
        return materialsList[0];
    }, [materialsList, selectedMaterialId, materialsSummaryMap]);

    // ── Resumen por Categorías ──
    const categoriesSummary = useMemo(() => {
        const catMap: Record<string, {
            nombre: string;
            totalKilos: number;
            totalMateriales: number;
            materiales: { codigo: string; descripcion: string; kilos: number }[];
        }> = {};

        materialsList.forEach((m) => {
            const catName = m.categoria || 'Sin Categoría';
            if (!catMap[catName]) {
                catMap[catName] = {
                    nombre: catName,
                    totalKilos: 0,
                    totalMateriales: 0,
                    materiales: []
                };
            }
            catMap[catName].totalKilos += m.totalKilos;
            catMap[catName].totalMateriales += 1;
            catMap[catName].materiales.push({
                codigo: m.codigoInterno,
                descripcion: m.descripcion,
                kilos: m.totalKilos
            });
        });

        return Object.values(catMap).sort((a, b) => b.totalKilos - a.totalKilos);
    }, [materialsList]);

    // ── KPIs Globales Rápidos ──
    const globalKPIs = useMemo(() => {
        let totalConsumoKilos = 0;
        let totalBultos = 0;
        let remitosSet = new Set<string>();

        validMovements.forEach((m: any) => {
            totalConsumoKilos += Math.abs(Number(m.qtyPrincipal || 0));
            totalBultos += Math.abs(Number(m.qtySecundaria || 0));
            if (m.documentoId || m.documentoNumero) {
                remitosSet.add(m.documentoId || m.documentoNumero);
            }
        });

        const activeMaterialsCount = materialsSummaryMap.size;
        const topMaterial = materialsList[0] || null;

        return {
            totalConsumoKilos,
            totalBultos,
            totalRemitos: remitosSet.size || validMovements.length,
            activeMaterialsCount,
            topMaterial
        };
    }, [validMovements, materialsSummaryMap, materialsList]);

    // ── Filtro de búsqueda en la Matriz Histórica ──
    const filteredMatrixRows = useMemo(() => {
        const q = normalizeText(searchQuery);
        if (!q) return materialsList;
        return materialsList.filter(m =>
            normalizeText(m.codigoInterno).includes(q) ||
            normalizeText(m.descripcion).includes(q) ||
            normalizeText(m.proveedor).includes(q)
        );
    }, [materialsList, searchQuery]);

    const matrixPagination = useClientPagination(filteredMatrixRows, 15);

    // ── Exportación a Excel ──
    const handleExportExcel = () => {
        let rows: any[] = [];

        if (currentTab === 1) {
            // Exportar Matriz Histórica Mensual
            rows = filteredMatrixRows.map(m => {
                const rowObj: Record<string, any> = {
                    'Código': m.codigoInterno,
                    'Descripción': m.descripcion,
                    'Categoría': m.categoria,
                    'Proveedor': m.proveedor,
                };
                MONTH_NAMES.forEach((mes, idx) => {
                    rowObj[mes] = Number(m.monthlyKilos[idx].toFixed(2));
                });
                rowObj[`Total ${selectedYear}`] = Number(m.totalKilos.toFixed(2));
                rowObj['Stock Actual'] = Number(m.stockActual.toFixed(2));
                return rowObj;
            });
        } else if (currentTab === 2) {
            // Exportar Resumen por Categoría
            rows = categoriesSummary.map(c => ({
                'Categoría': c.nombre,
                'Materiales Distintos': c.totalMateriales,
                'Consumo Total (kg)': Number(c.totalKilos.toFixed(2)),
                '% del Total': globalKPIs.totalConsumoKilos > 0
                    ? `${((c.totalKilos / globalKPIs.totalConsumoKilos) * 100).toFixed(1)}%`
                    : '0%'
            }));
        } else if (currentMaterial) {
            // Exportar Detalle del Material Seleccionado
            rows = currentMaterial.movements.map((m: any) => ({
                'Fecha': formatDate(m.fecha),
                'N° Remito': m.documentoNumero || m.documento?.numero || 'S/N',
                'Cliente': getClientName(m),
                'Cantidad (kg)': Math.abs(Number(m.qtyPrincipal || 0)),
                'Bultos': Math.abs(Number(m.qtySecundaria || 0)),
                'Lote': m.batch?.lotNumber || '—',
                'Observaciones': m.observaciones || '—'
            }));
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        const sheetTitle = currentTab === 1 ? 'Historico_Mensual' : (currentTab === 2 ? 'Consumo_Categorias' : 'Ficha_Material');
        XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
        XLSX.writeFile(wb, `${sheetTitle}_${desde || 'inicio'}_al_${hasta || 'hoy'}.xlsx`);
    };

    const isLoading = isFetchingMovements || isFetchingStock || isFetchingItems;

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, bgcolor: themeColors.bg, minHeight: '100vh', color: themeColors.text }}>

            {/* ── HEADER PRINCIPAL ── */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.primary, letterSpacing: '-0.5px' }}>
                            📊 Consumo de Materiales
                        </Typography>
                        <Chip
                            label="Remitos de Salida"
                            size="small"
                            sx={{ bgcolor: 'rgba(56, 189, 248, 0.15)', color: themeColors.info, fontWeight: 800, fontSize: '0.68rem' }}
                        />
                    </Box>
                    <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                        Análisis real y limpio de materiales despachados por remito a clientes
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
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
                        Exportar Excel
                    </Button>
                </Box>
            </Box>

            {/* ── BARRA SUPERIOR DE FILTROS LIMPIOS ── */}
            <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                    
                    {/* Presets Rápidos */}
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, mr: 0.5 }}>
                            PERÍODO:
                        </Typography>
                        {(['30D', '90D', 'YEAR', 'ALL'] as const).map((preset) => (
                            <Button
                                key={preset}
                                size="small"
                                variant={periodPreset === preset ? 'contained' : 'outlined'}
                                onClick={() => handlePresetChange(preset)}
                                sx={{
                                    borderRadius: 2,
                                    py: 0.4,
                                    px: 1.5,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    bgcolor: periodPreset === preset ? themeColors.primary : 'transparent',
                                    color: periodPreset === preset ? '#000' : themeColors.textDim,
                                    borderColor: periodPreset === preset ? themeColors.primary : themeColors.border,
                                    '&:hover': {
                                        borderColor: themeColors.primary,
                                        bgcolor: periodPreset === preset ? themeColors.primary : 'rgba(245, 158, 11, 0.08)'
                                    }
                                }}
                            >
                                {preset === '30D' ? 'Últimos 30 días' :
                                 preset === '90D' ? 'Últimos 90 días' :
                                 preset === 'YEAR' ? `Año ${selectedYear}` : 'Histórico Total'}
                            </Button>
                        ))}
                    </Box>

                    {/* Selector de Año, Depósito y Categoría */}
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Selector de Año */}
                        <TextField
                            select
                            size="small"
                            label="Año"
                            value={selectedYear}
                            onChange={(e) => handleYearChange(Number(e.target.value))}
                            sx={{
                                width: 105,
                                '& .MuiOutlinedInput-root': { bgcolor: themeColors.inputBg, borderRadius: 2, fontSize: '0.85rem' }
                            }}
                        >
                            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
                                <MenuItem key={y} value={y}>{y}</MenuItem>
                            ))}
                        </TextField>

                        {/* Selector de Depósito */}
                        <TextField
                            select
                            size="small"
                            label="Depósito"
                            value={depositoId}
                            onChange={(e) => setDepositoId(e.target.value)}
                            sx={{
                                minWidth: 150,
                                '& .MuiOutlinedInput-root': { bgcolor: themeColors.inputBg, borderRadius: 2, fontSize: '0.85rem' }
                            }}
                        >
                            <MenuItem value="">Todos los depósitos</MenuItem>
                            {depots.map((d: any) => (
                                <MenuItem key={d.id} value={d.id}>{d.nombre}</MenuItem>
                            ))}
                        </TextField>

                        {/* Selector de Categoría */}
                        <TextField
                            select
                            size="small"
                            label="Categoría"
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(e.target.value)}
                            sx={{
                                minWidth: 160,
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

            {/* ── KPIS GLOBALES RESUMIDOS ── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Total Salidas del Período
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.primary, mt: 0.5 }}>
                        {globalKPIs.totalConsumoKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
                        <small style={{ fontSize: '0.8rem', fontWeight: 500 }}>kg</small>
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Despachado en {globalKPIs.totalRemitos} remitos
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Bultos Despachados
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.info, mt: 0.5 }}>
                        {globalKPIs.totalBultos.toLocaleString('es-AR')}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Cajas / bolsas registradas
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Materiales con Salida
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.text, mt: 0.5 }}>
                        {globalKPIs.activeMaterialsCount}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Artículos con consumo en el período
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Material Más Despachado
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.success, mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {globalKPIs.topMaterial ? globalKPIs.topMaterial.codigoInterno : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {globalKPIs.topMaterial ? `${globalKPIs.topMaterial.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg (${globalKPIs.topMaterial.descripcion})` : 'Sin datos'}
                    </Typography>
                </Paper>
            </Box>

            {/* ── PESTAÑAS PRINCIPALES DE NAVEGACIÓN ── */}
            <Box sx={{ borderBottom: 1, borderColor: themeColors.border }}>
                <Tabs
                    value={currentTab}
                    onChange={(_, val) => setCurrentTab(val)}
                    textColor="inherit"
                    TabIndicatorProps={{ sx: { bgcolor: themeColors.primary, height: 3 } }}
                    sx={{
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 800,
                            fontSize: '0.92rem',
                            color: themeColors.textDim,
                            '&.Mui-selected': { color: themeColors.primary }
                        }
                    }}
                >
                    <Tab icon={<AssessmentIcon sx={{ fontSize: '1.2rem', mr: 0.8 }} />} iconPosition="start" label="Ficha por Material" />
                    <Tab icon={<ViewModuleIcon sx={{ fontSize: '1.2rem', mr: 0.8 }} />} iconPosition="start" label="Histórico Mensual (Matriz)" />
                    <Tab icon={<CategoryIcon sx={{ fontSize: '1.2rem', mr: 0.8 }} />} iconPosition="start" label="Consumo por Categorías" />
                </Tabs>
            </Box>

            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                    <CircularProgress sx={{ color: themeColors.primary }} />
                </Box>
            )}

            {!isLoading && (
                <>
                    {/* ══════════════════════════════════════════════════════════════════
                        TAB 0: FICHA ESPECÍFICA POR MATERIAL
                       ══════════════════════════════════════════════════════════════════ */}
                    {currentTab === 0 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            {/* Selector / Buscador Rápido del Material */}
                            <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                                    <Box sx={{ flex: 1, minWidth: 280 }}>
                                        <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block', mb: 0.5 }}>
                                            SELECCIONÁ O BUSCÁ UN MATERIAL PARA VER SU CONSUMO DETALLADO:
                                        </Typography>
                                        <Autocomplete
                                            options={materialsList}
                                            getOptionLabel={(option) => `${option.codigoInterno} - ${option.descripcion} (${option.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg consumidos)`}
                                            value={currentMaterial}
                                            onChange={(_, val) => setSelectedMaterialId(val?.id || null)}
                                            isOptionEqualToValue={(option, val) => option.id === val.id}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    size="small"
                                                    placeholder="Escribí código o descripción del material..."
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: themeColors.inputBg,
                                                            borderRadius: 2,
                                                            color: themeColors.text
                                                        }
                                                    }}
                                                />
                                            )}
                                        />
                                    </Box>

                                    {currentMaterial && (
                                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            <Box sx={{ p: 1.2, px: 2, bgcolor: 'rgba(245, 158, 11, 0.08)', borderRadius: 2, border: `1px solid rgba(245, 158, 11, 0.2)` }}>
                                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block' }}>
                                                    TOTAL SALIDAS
                                                </Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                                    {currentMaterial.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                                                </Typography>
                                            </Box>

                                            <Box sx={{ p: 1.2, px: 2, bgcolor: 'rgba(56, 189, 248, 0.08)', borderRadius: 2, border: `1px solid rgba(56, 189, 248, 0.2)` }}>
                                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block' }}>
                                                    STOCK ACTUAL
                                                </Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.info }}>
                                                    {currentMaterial.stockActual.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg
                                                </Typography>
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            </Paper>

                            {!currentMaterial ? (
                                <Paper sx={{ p: 4, textAlign: 'center', bgcolor: themeColors.cardBg, borderRadius: 2.5 }}>
                                    <Typography variant="body1" sx={{ color: themeColors.textDim }}>
                                        No se encontraron salidas para los filtros seleccionados.
                                    </Typography>
                                </Paper>
                            ) : (
                                <>
                                    {/* Gráfico Histórico Mes a Mes del Material Seleccionado */}
                                    <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Box>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: themeColors.text }}>
                                                    📈 Evolución de Consumo Mes a Mes ({selectedYear})
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                                                    Salidas mensuales por remito para <strong>{currentMaterial.codigoInterno}</strong> ({currentMaterial.descripcion})
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={`Categoría: ${currentMaterial.categoria}`}
                                                size="small"
                                                sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: themeColors.textDim, fontWeight: 700 }}
                                            />
                                        </Box>

                                        <Box sx={{ height: 260, width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={MONTH_NAMES.map((name, idx) => ({
                                                    mes: name,
                                                    kilos: Number(currentMaterial.monthlyKilos[idx].toFixed(1))
                                                }))}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                    <XAxis dataKey="mes" stroke={themeColors.textDim} fontSize={12} tickLine={false} />
                                                    <YAxis stroke={themeColors.textDim} fontSize={12} tickLine={false} unit=" kg" />
                                                    <RechartsTooltip
                                                        contentStyle={{ backgroundColor: '#1e2230', borderColor: themeColors.border, borderRadius: 8, color: '#fff' }}
                                                        formatter={(value: any) => [`${Number(value).toLocaleString('es-AR')} kg`, 'Consumo']}
                                                    />
                                                    <Bar dataKey="kilos" fill={themeColors.primary} radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </Box>
                                    </Paper>

                                    {/* Grilla 2 Columnas: Clientes Destino + Tabla de Movimientos */}
                                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 2fr' }, gap: 2 }}>
                                        
                                        {/* Ranking de Clientes */}
                                        <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, color: themeColors.text }}>
                                                🏢 Destino / Clientes
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                {Object.entries(currentMaterial.clientsMap)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .map(([client, qty], idx) => {
                                                        const pct = currentMaterial.totalKilos > 0 ? (qty / currentMaterial.totalKilos) * 100 : 0;
                                                        return (
                                                            <Box key={client} sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: `1px solid ${themeColors.border}` }}>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 700, color: themeColors.text }}>
                                                                        {idx + 1}. {client}
                                                                    </Typography>
                                                                    <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.primary }}>
                                                                        {qty.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg ({pct.toFixed(0)}%)
                                                                    </Typography>
                                                                </Box>
                                                                <Box sx={{ width: '100%', height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                                    <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: themeColors.primary }} />
                                                                </Box>
                                                            </Box>
                                                        );
                                                    })}
                                            </Box>
                                        </Paper>

                                        {/* Detalle de Remitos de Salida */}
                                        <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, color: themeColors.text }}>
                                                📋 Remitos de Salida Registrados ({currentMaterial.movements.length})
                                            </Typography>
                                            <TableContainer sx={{ maxHeight: 380 }}>
                                                <MuiTable size="small" stickyHeader>
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1 }}>Fecha</TableCell>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1 }}>Remito</TableCell>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1 }}>Cliente</TableCell>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1, textAlign: 'right' }}>Kilos</TableCell>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1, textAlign: 'right' }}>Bultos</TableCell>
                                                            <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, py: 1, textAlign: 'center' }}>Ver</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {currentMaterial.movements.map((m: any, idx: number) => (
                                                            <TableRow key={m.id || idx} hover sx={{ '&:last-child td': { border: 0 } }}>
                                                                <TableCell sx={{ color: themeColors.text, fontSize: '0.8rem' }}>
                                                                    {formatDate(m.fecha)}
                                                                </TableCell>
                                                                <TableCell sx={{ color: themeColors.info, fontWeight: 700, fontSize: '0.8rem' }}>
                                                                    {m.documentoNumero || m.documento?.numero || 'S/N'}
                                                                </TableCell>
                                                                <TableCell sx={{ color: themeColors.text, fontSize: '0.8rem' }}>
                                                                    {getClientName(m)}
                                                                </TableCell>
                                                                <TableCell sx={{ color: themeColors.primary, fontWeight: 800, textAlign: 'right', fontSize: '0.82rem' }}>
                                                                    {Math.abs(Number(m.qtyPrincipal || 0)).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                                </TableCell>
                                                                <TableCell sx={{ color: themeColors.textDim, textAlign: 'right', fontSize: '0.8rem' }}>
                                                                    {Math.abs(Number(m.qtySecundaria || 0)) || '—'}
                                                                </TableCell>
                                                                <TableCell sx={{ textAlign: 'center', py: 0.5 }}>
                                                                    {m.documentoId ? (
                                                                        <Tooltip title="Ver Remito Formal">
                                                                            <IconButton
                                                                                size="small"
                                                                                onClick={() => handleViewRemito(m.documentoId)}
                                                                                sx={{ color: themeColors.textDim, '&:hover': { color: themeColors.info } }}
                                                                            >
                                                                                <VisibilityIcon fontSize="small" />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                    ) : '—'}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </MuiTable>
                                            </TableContainer>
                                        </Paper>
                                    </Box>
                                </>
                            )}
                        </Box>
                    )}

                    {/* ══════════════════════════════════════════════════════════════════
                        TAB 1: MATRIZ HISTÓRICA MENSUAL (TODOS LOS MATERIALES)
                       ══════════════════════════════════════════════════════════════════ */}
                    {currentTab === 1 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {/* Barra de Filtro de Matriz */}
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                                <TextField
                                    size="small"
                                    placeholder="Buscar material por código o descripción..."
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
                                        minWidth: 320,
                                        '& .MuiOutlinedInput-root': { bgcolor: themeColors.cardBg, borderRadius: 2 }
                                    }}
                                />

                                <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                                    Mostrando <strong>{filteredMatrixRows.length}</strong> materiales con salida en {selectedYear}
                                </Typography>
                            </Box>

                            {/* Tabla Matriz Anual */}
                            <Paper sx={{ bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5, overflow: 'hidden' }}>
                                <TableContainer sx={{ maxHeight: 600 }}>
                                    <MuiTable size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 100 }}>Código</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 200 }}>Descripción</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 120 }}>Categoría</TableCell>
                                                {MONTH_NAMES.map((m) => (
                                                    <TableCell key={m} sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right', minWidth: 65 }}>
                                                        {m}
                                                    </TableCell>
                                                ))}
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.primary, fontWeight: 900, textAlign: 'right', minWidth: 95 }}>
                                                    Total {selectedYear}
                                                </TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.info, fontWeight: 800, textAlign: 'right', minWidth: 85 }}>
                                                    Stock
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {matrixPagination.paginatedItems.map((row) => (
                                                <TableRow
                                                    key={row.id}
                                                    hover
                                                    sx={{
                                                        cursor: 'pointer',
                                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)' }
                                                    }}
                                                    onClick={() => {
                                                        setSelectedMaterialId(row.id);
                                                        setCurrentTab(0);
                                                    }}
                                                >
                                                    <TableCell sx={{ color: themeColors.primary, fontWeight: 800, fontSize: '0.82rem' }}>
                                                        {row.codigoInterno}
                                                    </TableCell>
                                                    <TableCell sx={{ color: themeColors.text, fontSize: '0.82rem' }}>
                                                        {row.descripcion}
                                                    </TableCell>
                                                    <TableCell sx={{ color: themeColors.textDim, fontSize: '0.78rem' }}>
                                                        {row.categoria}
                                                    </TableCell>
                                                    {MONTH_NAMES.map((_, idx) => {
                                                        const val = row.monthlyKilos[idx];
                                                        return (
                                                            <TableCell
                                                                key={idx}
                                                                sx={{
                                                                    textAlign: 'right',
                                                                    fontSize: '0.78rem',
                                                                    color: val > 0 ? themeColors.text : 'rgba(255,255,255,0.15)',
                                                                    fontWeight: val > 0 ? 600 : 400
                                                                }}
                                                            >
                                                                {val > 0 ? Math.round(val).toLocaleString('es-AR') : '—'}
                                                            </TableCell>
                                                        );
                                                    })}
                                                    <TableCell sx={{ textAlign: 'right', color: themeColors.primary, fontWeight: 900, fontSize: '0.85rem' }}>
                                                        {row.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                    </TableCell>
                                                    <TableCell sx={{ textAlign: 'right', color: themeColors.info, fontWeight: 700, fontSize: '0.82rem' }}>
                                                        {row.stockActual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {matrixPagination.paginatedItems.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={17} sx={{ textAlign: 'center', py: 4, color: themeColors.textDim }}>
                                                        No hay datos de consumo para los filtros aplicados.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </MuiTable>
                                </TableContainer>

                                {/* Paginador */}
                                <Box sx={{ p: 1.5, borderTop: `1px solid ${themeColors.border}` }}>
                                    <PaginationControls
                                        currentPage={matrixPagination.page}
                                        totalPages={matrixPagination.totalPages}
                                        totalItems={matrixPagination.totalItems}
                                        pageSize={matrixPagination.pageSize}
                                        onPageChange={matrixPagination.setPage}
                                        onPageSizeChange={matrixPagination.setPageSize}
                                    />
                                </Box>
                            </Paper>
                        </Box>
                    )}

                    {/* ══════════════════════════════════════════════════════════════════
                        TAB 2: CONSUMO POR CATEGORÍAS
                       ══════════════════════════════════════════════════════════════════ */}
                    {currentTab === 2 && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 2 }}>
                                
                                {/* Gráfico de Torta / Distribución por Categoría */}
                                <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1, color: themeColors.text }}>
                                        Distribución de Consumo por Categoría
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: themeColors.textDim, display: 'block', mb: 2 }}>
                                        Proporción del volumen despachado según familia de producto
                                    </Typography>

                                    <Box sx={{ height: 280, width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={categoriesSummary}
                                                    dataKey="totalKilos"
                                                    nameKey="nombre"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={95}
                                                    innerRadius={50}
                                                    paddingAngle={3}
                                                >
                                                    {categoriesSummary.map((_, index) => (
                                                        <Cell key={`cell-${index}`} fill={PIE_PALETTE[index % PIE_PALETTE.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    contentStyle={{ backgroundColor: '#1e2230', borderColor: themeColors.border, borderRadius: 8, color: '#fff' }}
                                                    formatter={(value: any) => [`${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`, 'Consumo']}
                                                />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </Box>
                                </Paper>

                                {/* Resumen Numérico por Categoría */}
                                <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: themeColors.text }}>
                                        Ranking de Familias de Materiales
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 310, overflowY: 'auto' }}>
                                        {categoriesSummary.map((cat, idx) => {
                                            const pct = globalKPIs.totalConsumoKilos > 0 ? (cat.totalKilos / globalKPIs.totalConsumoKilos) * 100 : 0;
                                            return (
                                                <Box
                                                    key={cat.nombre}
                                                    sx={{
                                                        p: 1.5,
                                                        bgcolor: 'rgba(255,255,255,0.02)',
                                                        borderRadius: 2,
                                                        border: `1px solid ${themeColors.border}`,
                                                        cursor: 'pointer',
                                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                                                    }}
                                                    onClick={() => {
                                                        setSelectedCategoryId(cat.nombre);
                                                        setCurrentTab(1); // Ir a la matriz filtrada
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.8 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PIE_PALETTE[idx % PIE_PALETTE.length] }} />
                                                            <Typography variant="body2" sx={{ fontWeight: 800, color: themeColors.text }}>
                                                                {cat.nombre}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                                                                ({cat.totalMateriales} materiales)
                                                            </Typography>
                                                        </Box>
                                                        <Typography variant="body2" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                                            {cat.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg{' '}
                                                            <span style={{ fontSize: '0.75rem', color: themeColors.textDim }}>({pct.toFixed(1)}%)</span>
                                                        </Typography>
                                                    </Box>
                                                    <Box sx={{ width: '100%', height: 5, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                                        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: PIE_PALETTE[idx % PIE_PALETTE.length] }} />
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Paper>
                            </Box>

                            {/* Desglose de Materiales por Categoría */}
                            <Paper sx={{ p: 2, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, color: themeColors.text }}>
                                    Detalle de Materiales por Cada Categoría
                                </Typography>
                                <TableContainer sx={{ maxHeight: 400 }}>
                                    <MuiTable size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700 }}>Categoría</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700 }}>Código Material</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700 }}>Descripción</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right' }}>Consumo (kg)</TableCell>
                                                <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'center' }}>Acción</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {materialsList.map((m) => (
                                                <TableRow key={m.id} hover>
                                                    <TableCell sx={{ color: themeColors.textDim, fontSize: '0.8rem' }}>{m.categoria}</TableCell>
                                                    <TableCell sx={{ color: themeColors.primary, fontWeight: 700, fontSize: '0.8rem' }}>{m.codigoInterno}</TableCell>
                                                    <TableCell sx={{ color: themeColors.text, fontSize: '0.8rem' }}>{m.descripcion}</TableCell>
                                                    <TableCell sx={{ color: themeColors.text, fontWeight: 800, textAlign: 'right', fontSize: '0.8rem' }}>
                                                        {m.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                    </TableCell>
                                                    <TableCell sx={{ textAlign: 'center' }}>
                                                        <Button
                                                            size="small"
                                                            variant="text"
                                                            onClick={() => {
                                                                setSelectedMaterialId(m.id);
                                                                setCurrentTab(0);
                                                            }}
                                                            sx={{ fontSize: '0.75rem', textTransform: 'none', color: themeColors.info }}
                                                        >
                                                            Ver Ficha
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </MuiTable>
                                </TableContainer>
                            </Paper>
                        </Box>
                    )}
                </>
            )}

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
