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
    Autocomplete
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ClearIcon from '@mui/icons-material/Clear';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import ViewListIcon from '@mui/icons-material/ViewList';
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
import { matchesSearch, createSmartFilterOptions, getItemSearchFields } from '../../shared/utils/search';

const themeColors = {
    primary: '#f59e0b',
    primaryLight: 'rgba(245, 158, 11, 0.12)',
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

const MONTH_NAMES = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const filterMaterials = createSmartFilterOptions(getItemSearchFields);

const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return clean;
};

type FilterFocus = 'ALL' | 'CRITICAL' | 'TOP' | 'LOW';

export default function ReporteConsumoDetalladoPage() {
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [depositoId, setDepositoId] = useState<string>('');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterFocus, setFilterFocus] = useState<FilterFocus>('ALL');

    const desde = `${selectedYear}-01-01`;
    const hasta = `${selectedYear}-12-31`;

    // ── Material Seleccionado en la Ficha Principal ──
    const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);

    // ── Consultas Backend Reales ──
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => rawDepots.filter((d: any) => d.activo !== false), [rawDepots]);
    const { data: categories = [] } = useGetItemCategoriesQuery(depositoId || undefined);

    const { data: rawMovements = [], isFetching: isFetchingMovements } = useGetRecentMovementsQuery({
        desde,
        hasta,
        depositoId: depositoId || undefined,
        tipo: 'REMITO_SALIDA'
    });

    const { data: rawStock = [], isFetching: isFetchingStock } = useGetStockQuery({
        depotId: depositoId || undefined
    });

    // Remito modal
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

    // Mapa de Stock actual disponible
    const stockMap = useMemo(() => {
        const map = new Map<string, number>();
        rawStock.forEach((s: any) => {
            const current = map.get(s.itemId) || 0;
            map.set(s.itemId, current + Math.max(0, Number(s.qtyPrincipal || 0)));
        });
        return map;
    }, [rawStock]);

    const getClientName = (m: any): string => {
        return m.documento?.partner?.name || m.partner?.name || 'Sin Asignar';
    };

    const validMovements = useMemo(() => {
        return rawMovements.filter((m: any) => {
            if (m.status === 'ANULADO') return false;
            if (m.tipo !== 'REMITO_SALIDA') return false;
            return true;
        });
    }, [rawMovements]);

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
            monthlyKilos: number[];
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

        map.forEach((entry) => {
            entry.promedioMensual = monthsElapsed > 0 ? (entry.totalKilos / monthsElapsed) : 0;
            entry.mesesCobertura = entry.promedioMensual > 0 ? (entry.stockActual / entry.promedioMensual) : Infinity;
        });

        return map;
    }, [validMovements, stockMap, monthsElapsed]);

    const allMaterialsList = useMemo(() => {
        return Array.from(materialsMap.values()).sort((a, b) => b.totalKilos - a.totalKilos);
    }, [materialsMap]);

    // Materiales filtrados por la categoría seleccionada
    const categoryMaterialsList = useMemo(() => {
        if (!selectedCategoryId) return allMaterialsList;
        return allMaterialsList.filter(m => m.categoryId === selectedCategoryId || m.categoria === selectedCategoryId);
    }, [allMaterialsList, selectedCategoryId]);

    // Material activo para la Ficha Destacada (se adapta a la categoría seleccionada)
    const activeMaterial = useMemo(() => {
        if (!categoryMaterialsList.length) return null;
        if (selectedMaterialId) {
            const found = categoryMaterialsList.find(m => m.id === selectedMaterialId);
            if (found) return found;
        }
        return categoryMaterialsList[0];
    }, [categoryMaterialsList, selectedMaterialId]);

    // Conteo para los botones de foco (respetando la categoría seleccionada)
    const countCritical = useMemo(() => categoryMaterialsList.filter(m => m.mesesCobertura < 1 && m.mesesCobertura !== Infinity).length, [categoryMaterialsList]);
    const countLow = useMemo(() => categoryMaterialsList.filter(m => m.mesesCobertura > 6 && m.stockActual > 0).length, [categoryMaterialsList]);

    // Lista filtrada según Foco + Categoría + Búsqueda
    const filteredMaterialsList = useMemo(() => {
        let list = categoryMaterialsList;

        if (filterFocus === 'CRITICAL') {
            list = list.filter(m => m.mesesCobertura < 1 && m.mesesCobertura !== Infinity);
        } else if (filterFocus === 'TOP') {
            list = list.slice(0, 10);
        } else if (filterFocus === 'LOW') {
            list = list.filter(m => m.mesesCobertura > 6 && m.stockActual > 0);
        }

        if (searchQuery.trim()) {
            list = list.filter(m =>
                matchesSearch(searchQuery, m.codigoInterno, m.descripcion, m.proveedor, m.categoria)
            );
        }

        return list;
    }, [categoryMaterialsList, filterFocus, searchQuery]);

    const pagination = useClientPagination(filteredMaterialsList, 15);

    // ── Resumen de Evolución Mensual de la Categoría Seleccionada (o Global si no hay filtro) ──
    const monthlyCategoryEvolution = useMemo(() => {
        const months = Array(12).fill(0);
        categoryMaterialsList.forEach((m) => {
            m.monthlyKilos.forEach((kg, idx) => {
                months[idx] += kg;
            });
        });

        return MONTH_NAMES.map((name, idx) => ({
            mes: name,
            kilos: Number(months[idx].toFixed(1))
        }));
    }, [categoryMaterialsList]);

    // Totales rápidos para los KPIs (respetando la categoría seleccionada)
    const kpis = useMemo(() => {
        let totalKilos = 0;
        let totalBultos = 0;
        const remitosSet = new Set<string>();

        categoryMaterialsList.forEach((m) => {
            totalKilos += m.totalKilos;
            totalBultos += m.totalBultos;
            m.movements.forEach((mov: any) => {
                if (mov.documentoId || mov.documentoNumero) {
                    remitosSet.add(mov.documentoId || mov.documentoNumero);
                }
            });
        });

        const promMensualGlobal = monthsElapsed > 0 ? (totalKilos / monthsElapsed) : 0;
        const topMaterial = categoryMaterialsList[0] || null;

        return {
            totalKilos,
            totalBultos,
            totalRemitos: remitosSet.size,
            promMensualGlobal,
            topMaterial
        };
    }, [categoryMaterialsList, monthsElapsed]);

    // Exportación a Excel
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
            rowObj['Meses de Cobertura'] = m.mesesCobertura !== Infinity ? Number(m.mesesCobertura.toFixed(1)) : 'Sin salida';
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

            {/* ── HEADER Y ACCIONES ── */}
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
                        Análisis operativo de salidas reales por remito, evolución mensual y cobertura de stock
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

            {/* ── BARRA SUPERIOR DE FILTROS ── */}
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
                            onChange={(e) => {
                                setDepositoId(e.target.value);
                                setSelectedCategoryId('');
                                setSelectedMaterialId(null);
                            }}
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
                            onChange={(e) => {
                                setSelectedCategoryId(e.target.value);
                                setSelectedMaterialId(null); // Resetear material seleccionado al cambiar de categoría
                            }}
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

            {/* ── KPIS RESUMIDOS DE LA SELECCIÓN ── */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Total Despachado {selectedCategoryId ? `(${selectedCategoryId})` : `(${selectedYear})`}
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
                        Materiales en esta selección
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: themeColors.text, mt: 0.5 }}>
                        {categoryMaterialsList.length}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem' }}>
                        Artículos con salida registrada
                    </Typography>
                </Paper>

                <Paper sx={{ p: 1.8, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        Mayor Salida {selectedCategoryId ? 'en Categoría' : `(${selectedYear})`}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 900, color: themeColors.success, mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kpis.topMaterial ? kpis.topMaterial.codigoInterno : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: themeColors.textDim, fontSize: '0.72rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {kpis.topMaterial ? `${kpis.topMaterial.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg (${kpis.topMaterial.descripcion})` : 'Sin datos'}
                    </Typography>
                </Paper>
            </Box>

            {/* ── GRÁFICO DE EVOLUCIÓN MENSUAL DEL CONJUNTO SELECCIONADO ── */}
            <Paper sx={{ p: 2.5, bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: themeColors.text }}>
                            📈 Salidas Mensuales {selectedCategoryId ? `de Categoría: ${selectedCategoryId}` : `Totales de Fábrica`} ({selectedYear})
                        </Typography>
                        <Typography variant="caption" sx={{ color: themeColors.textDim }}>
                            {selectedCategoryId
                                ? `Volumen consolidado despachado por remito para todos los materiales de ${selectedCategoryId}`
                                : `Volumen consolidado despachado por remito de todos los materiales`}
                        </Typography>
                    </Box>
                    <Chip
                        label={`${kpis.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg en el año`}
                        size="small"
                        sx={{ bgcolor: themeColors.primaryLight, color: themeColors.primary, fontWeight: 800 }}
                    />
                </Box>

                <Box sx={{ height: 210, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyCategoryEvolution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="mes" stroke={themeColors.textDim} fontSize={12} tickLine={false} />
                            <YAxis stroke={themeColors.textDim} fontSize={12} tickLine={false} unit=" kg" />
                            <RechartsTooltip
                                contentStyle={{ backgroundColor: '#1e2230', borderColor: themeColors.border, borderRadius: 8, color: '#fff' }}
                                formatter={(value: any) => [`${Number(value).toLocaleString('es-AR')} kg`, selectedCategoryId ? `Salida ${selectedCategoryId}` : 'Salida Total']}
                            />
                            <Bar dataKey="kilos" fill={themeColors.primary} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Box>
            </Paper>

            {/* ══════════════════════════════════════════════════════════════════════
                SECCIÓN 1: CONSULTA RÁPIDA Y FICHA DEL MATERIAL (El 80% del uso)
               ══════════════════════════════════════════════════════════════════════ */}
            <Paper sx={{ p: 2.5, bgcolor: '#12151f', border: `1px solid ${themeColors.primary}40`, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                {/* Selector / Buscador Rápido del Material */}
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { xs: 'stretch', md: 'center' }, mb: 2.5 }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" sx={{ color: themeColors.primary, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', mb: 0.5 }}>
                            🔍 CONSULTA DIRECTA DE CUALQUIER MATERIAL:
                        </Typography>
                        <Autocomplete
                            options={categoryMaterialsList}
                            getOptionLabel={(option) => `${option.codigoInterno} - ${option.descripcion} (${option.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg)`}
                            value={activeMaterial}
                            onChange={(_, val) => setSelectedMaterialId(val?.id || null)}
                            isOptionEqualToValue={(option, val) => option.id === val.id}
                            filterOptions={filterMaterials}
                            autoHighlight
                            selectOnFocus
                            openOnFocus
                            handleHomeEndKeys
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    size="small"
                                    placeholder={selectedCategoryId ? `Filtrando por ${selectedCategoryId}... Escribí código o nombre` : "Escribí código o nombre del material para ver su ficha inmediata..."}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: 'rgba(255,255,255,0.06)',
                                            borderRadius: 2,
                                            color: themeColors.text
                                        }
                                    }}
                                />
                            )}
                        />
                    </Box>

                    {activeMaterial && (
                        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Box sx={{ p: 1, px: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: `1px solid ${themeColors.border}` }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block', fontSize: '0.65rem' }}>
                                    TOTAL {selectedYear}
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: themeColors.primary }}>
                                    {activeMaterial.totalKilos.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1, px: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: `1px solid ${themeColors.border}` }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block', fontSize: '0.65rem' }}>
                                    STOCK HOY
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: themeColors.info }}>
                                    {activeMaterial.stockActual.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg
                                </Typography>
                            </Box>

                            <Box sx={{ p: 1, px: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: `1px solid ${themeColors.border}` }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 700, display: 'block', fontSize: '0.65rem' }}>
                                    COBERTURA
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: activeMaterial.mesesCobertura < 1 ? themeColors.danger : themeColors.success }}>
                                    {activeMaterial.mesesCobertura !== Infinity ? `${activeMaterial.mesesCobertura.toFixed(1)} meses` : '—'}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </Box>

                {activeMaterial && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, gap: 2 }}>
                        {/* Gráfico Mes a Mes del Material */}
                        <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', border: `1px solid ${themeColors.border}`, borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 800, textTransform: 'uppercase' }}>
                                    📈 Salidas Mes a Mes ({selectedYear}) de <strong>{activeMaterial.codigoInterno}</strong>
                                </Typography>
                                <Chip
                                    label={activeMaterial.categoria}
                                    size="small"
                                    sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: themeColors.textDim, fontSize: '0.7rem' }}
                                />
                            </Box>
                            <Box sx={{ height: 180, width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={MONTH_NAMES.map((name, idx) => ({
                                        mes: name,
                                        kilos: Number(activeMaterial.monthlyKilos[idx].toFixed(1))
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

                        {/* Ranking de Clientes y Últimos Remitos (Lado derecho de la ficha) */}
                        <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', border: `1px solid ${themeColors.border}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Box>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 800, textTransform: 'uppercase', display: 'block', mb: 0.8 }}>
                                    🏢 Principales Clientes Destino
                                </Typography>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                                    {Object.entries(activeMaterial.clientsMap)
                                        .sort(([, a], [, b]) => b - a)
                                        .slice(0, 3)
                                        .map(([client, qty], idx) => {
                                            const pct = activeMaterial.totalKilos > 0 ? (qty / activeMaterial.totalKilos) * 100 : 0;
                                            return (
                                                <Box key={client} sx={{ p: 0.8, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5, border: `1px solid ${themeColors.border}` }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                                                        <Typography variant="caption" sx={{ fontWeight: 700, color: themeColors.text }}>
                                                            {idx + 1}. {client}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ fontWeight: 800, color: themeColors.primary }}>
                                                            {qty.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg ({pct.toFixed(0)}%)
                                                        </Typography>
                                                    </Box>
                                                    <Box sx={{ width: '100%', height: 3, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                                        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: themeColors.primary }} />
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                </Box>
                            </Box>

                            {/* Últimos Remitos del Material */}
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" sx={{ color: themeColors.textDim, fontWeight: 800, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                                    📋 Últimos Remitos ({activeMaterial.movements.length})
                                </Typography>
                                <TableContainer sx={{ maxHeight: 95, bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 1.5 }}>
                                    <MuiTable size="small">
                                        <TableBody>
                                            {activeMaterial.movements.slice(0, 5).map((m: any, idx: number) => (
                                                <TableRow key={m.id || idx}>
                                                    <TableCell sx={{ color: themeColors.textDim, fontSize: '0.72rem', py: 0.4 }}>{formatDate(m.fecha)}</TableCell>
                                                    <TableCell sx={{ color: themeColors.info, fontWeight: 700, fontSize: '0.72rem', py: 0.4 }}>
                                                        {m.documentoNumero || m.documento?.numero || 'S/N'}
                                                    </TableCell>
                                                    <TableCell sx={{ color: themeColors.text, fontSize: '0.72rem', py: 0.4 }}>{getClientName(m)}</TableCell>
                                                    <TableCell sx={{ color: themeColors.primary, fontWeight: 800, textAlign: 'right', fontSize: '0.72rem', py: 0.4 }}>
                                                        {Math.abs(Number(m.qtyPrincipal || 0)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg
                                                    </TableCell>
                                                    <TableCell sx={{ textAlign: 'center', py: 0.3 }}>
                                                        {m.documentoId && (
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleViewRemito(m.documentoId)}
                                                                sx={{ color: themeColors.textDim, p: 0.2 }}
                                                            >
                                                                <VisibilityIcon sx={{ fontSize: '0.9rem' }} />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </MuiTable>
                                </TableContainer>
                            </Box>
                        </Paper>
                    </Box>
                )}
            </Paper>

            {/* ══════════════════════════════════════════════════════════════════════
                SECCIÓN 2: TABLERO Y MATRIZ HISTÓRICA COMPLETA (Planificación)
               ══════════════════════════════════════════════════════════════════════ */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                
                {/* Botones de Foco Operativo + Buscador en Tabla */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button
                            size="small"
                            variant={filterFocus === 'ALL' ? 'contained' : 'outlined'}
                            startIcon={<ViewListIcon />}
                            onClick={() => setFilterFocus('ALL')}
                            sx={{
                                borderRadius: 2,
                                py: 0.4,
                                textTransform: 'none',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                bgcolor: filterFocus === 'ALL' ? themeColors.primary : 'transparent',
                                color: filterFocus === 'ALL' ? '#000' : themeColors.textDim,
                                borderColor: filterFocus === 'ALL' ? themeColors.primary : themeColors.border
                            }}
                        >
                            Todos ({allMaterialsList.length})
                        </Button>

                        <Button
                            size="small"
                            variant={filterFocus === 'CRITICAL' ? 'contained' : 'outlined'}
                            startIcon={<WarningAmberIcon />}
                            onClick={() => setFilterFocus('CRITICAL')}
                            sx={{
                                borderRadius: 2,
                                py: 0.4,
                                textTransform: 'none',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                bgcolor: filterFocus === 'CRITICAL' ? themeColors.danger : 'transparent',
                                color: filterFocus === 'CRITICAL' ? '#fff' : themeColors.danger,
                                borderColor: themeColors.danger
                            }}
                        >
                            Riesgo de Agotamiento ({countCritical})
                        </Button>

                        <Button
                            size="small"
                            variant={filterFocus === 'TOP' ? 'contained' : 'outlined'}
                            startIcon={<WhatshotIcon />}
                            onClick={() => setFilterFocus('TOP')}
                            sx={{
                                borderRadius: 2,
                                py: 0.4,
                                textTransform: 'none',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                bgcolor: filterFocus === 'TOP' ? themeColors.info : 'transparent',
                                color: filterFocus === 'TOP' ? '#000' : themeColors.info,
                                borderColor: themeColors.info
                            }}
                        >
                            Top 10 Más Salidos
                        </Button>

                        <Button
                            size="small"
                            variant={filterFocus === 'LOW' ? 'contained' : 'outlined'}
                            startIcon={<BedtimeIcon />}
                            onClick={() => setFilterFocus('LOW')}
                            sx={{
                                borderRadius: 2,
                                py: 0.4,
                                textTransform: 'none',
                                fontWeight: 800,
                                fontSize: '0.78rem',
                                bgcolor: filterFocus === 'LOW' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: filterFocus === 'LOW' ? '#fff' : themeColors.textDim,
                                borderColor: themeColors.border
                            }}
                        >
                            Sobrestockeados ({countLow})
                        </Button>
                    </Box>

                    {/* Buscador de Tabla */}
                    <TextField
                        size="small"
                        placeholder="Filtrar por código o descripción..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: <SearchIcon sx={{ color: themeColors.textDim, mr: 1, fontSize: '1.1rem' }} />,
                            endAdornment: searchQuery ? (
                                <IconButton size="small" onClick={() => setSearchQuery('')}>
                                    <ClearIcon fontSize="small" />
                                </IconButton>
                            ) : null
                        }}
                        sx={{
                            minWidth: 260,
                            '& .MuiOutlinedInput-root': { bgcolor: themeColors.cardBg, borderRadius: 2, fontSize: '0.85rem' }
                        }}
                    />
                </Box>

                {/* Tabla Maestra Interactiva */}
                <Paper sx={{ bgcolor: themeColors.cardBg, border: `1px solid ${themeColors.border}`, borderRadius: 2.5, overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 520 }}>
                        <MuiTable size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 90 }}>Código</TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 200 }}>Descripción</TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, minWidth: 120 }}>Categoría</TableCell>
                                    {MONTH_NAMES.map((m) => (
                                        <TableCell key={m} sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right', minWidth: 55, fontSize: '0.75rem' }}>
                                            {m}
                                        </TableCell>
                                    ))}
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.primary, fontWeight: 900, textAlign: 'right', minWidth: 90 }}>
                                        Total {selectedYear}
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'right', minWidth: 80 }}>
                                        Prom/Mes
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.info, fontWeight: 800, textAlign: 'right', minWidth: 80 }}>
                                        Stock
                                    </TableCell>
                                    <TableCell sx={{ bgcolor: '#161922', color: themeColors.textDim, fontWeight: 700, textAlign: 'center', minWidth: 85 }}>
                                        Cobertura
                                    </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={18} sx={{ textAlign: 'center', py: 5 }}>
                                            <CircularProgress size={30} sx={{ color: themeColors.primary }} />
                                        </TableCell>
                                    </TableRow>
                                ) : pagination.pageItems.map((m) => {
                                    const cob = m.mesesCobertura;
                                    let cobColor = themeColors.success;
                                    let cobLabel = `${cob.toFixed(1)} m`;

                                    if (cob === Infinity) {
                                        cobColor = themeColors.textDim;
                                        cobLabel = '—';
                                    } else if (cob < 0.5) {
                                        cobColor = themeColors.danger;
                                    } else if (cob < 1) {
                                        cobColor = themeColors.warning;
                                    }

                                    const isSelected = activeMaterial?.id === m.id;

                                    return (
                                        <TableRow
                                            key={m.id}
                                            hover
                                            sx={{
                                                cursor: 'pointer',
                                                bgcolor: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' }
                                            }}
                                            onClick={() => {
                                                setSelectedMaterialId(m.id);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                        >
                                            <TableCell sx={{ color: isSelected ? themeColors.primary : themeColors.text, fontWeight: 800, fontSize: '0.8rem' }}>
                                                {m.codigoInterno}
                                            </TableCell>
                                            <TableCell sx={{ color: themeColors.text, fontSize: '0.8rem' }}>
                                                {m.descripcion}
                                            </TableCell>
                                            <TableCell sx={{ color: themeColors.textDim, fontSize: '0.75rem' }}>
                                                {m.categoria}
                                            </TableCell>
                                            {MONTH_NAMES.map((_, idx) => {
                                                const val = m.monthlyKilos[idx];
                                                return (
                                                    <TableCell
                                                        key={idx}
                                                        sx={{
                                                            textAlign: 'right',
                                                            fontSize: '0.74rem',
                                                            color: val > 0 ? themeColors.text : 'rgba(255,255,255,0.12)',
                                                            fontWeight: val > 0 ? 600 : 400
                                                        }}
                                                    >
                                                        {val > 0 ? Math.round(val).toLocaleString('es-AR') : '—'}
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.primary, fontWeight: 900, fontSize: '0.82rem' }}>
                                                {m.totalKilos.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.textDim, fontSize: '0.78rem' }}>
                                                {m.promedioMensual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'right', color: themeColors.info, fontWeight: 800, fontSize: '0.8rem' }}>
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
                                                        fontSize: '0.7rem',
                                                        height: 20
                                                    }}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}

                                {!isLoading && pagination.pageItems.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={18} sx={{ textAlign: 'center', py: 4, color: themeColors.textDim }}>
                                            No se encontraron salidas para los filtros seleccionados.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </MuiTable>
                    </TableContainer>

                    {/* Paginación */}
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
