import { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
    Stack,
    TablePagination,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { PageHeader, PageLoader, useIsMobile } from '../../shared/ui';
import {
    type BatchInspectionStatus,
    type BatchQualityCheckItem,
    type QualityCheckResultStatus,
    type QualityLot,
    useCreateQualityTemplateMutation,
    useDeleteQualityTemplateMutation,
    useGetLocalizedQualityFiltersQuery,
    useGetQualityLotsQuery,
    useGetQualityTemplatesQuery,
    useInspectQualityLotMutation,
} from '../../features/quality/lots/quality-lots.api';

const INSPECTION_META: Record<
    BatchInspectionStatus,
    { label: string; color: 'default' | 'info' | 'success' | 'warning' | 'error'; desc: string }
> = {
    SIN_TESTEAR: {
        label: 'Sin testear',
        color: 'default',
        desc: 'Todavía no se realizó ningún control de calidad sobre esta partida.',
    },
    EN_PROCESO: {
        label: 'En proceso',
        color: 'info',
        desc: 'Se guardan las pruebas intermedias cargadas sin cerrar todavía el resultado final.',
    },
    APROBADO: {
        label: 'Aprobado',
        color: 'success',
        desc: 'La partida pasó los controles y queda liberada para producción y despachos.',
    },
    OBSERVADO: {
        label: 'Observado',
        color: 'warning',
        desc: 'Aprobado con observaciones o bajo seguimiento. Podés elegir si retenerlo en cuarentena.',
    },
    RECHAZADO: {
        label: 'Rechazado',
        color: 'error',
        desc: 'Bloquea automáticamente esta partida para que no pueda salir a producción ni remitos.',
    },
    IGNORADO: {
        label: 'Ignorado',
        color: 'default',
        desc: 'Se omite del chequeo por el momento sin bloquear el stock. Podés retomarlo cuando quieras.',
    },
};

function renderInspectionIcon(status: BatchInspectionStatus) {
    switch (status) {
        case 'APROBADO':
            return <VerifiedOutlinedIcon fontSize="small" />;
        case 'EN_PROCESO':
            return <ScienceOutlinedIcon fontSize="small" />;
        case 'OBSERVADO':
            return <WarningAmberOutlinedIcon fontSize="small" />;
        case 'RECHAZADO':
            return <BlockOutlinedIcon fontSize="small" />;
        case 'IGNORADO':
            return <DoNotDisturbOnOutlinedIcon fontSize="small" />;
        default:
            return <PendingOutlinedIcon fontSize="small" />;
    }
}

export default function ChequeoLocalizadoPage() {
    const isMobile = useIsMobile();

    // Filtros en cascada
    const [categoryId, setCategoryId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [itemId, setItemId] = useState('');
    const [inspectionStatus, setInspectionStatus] = useState<string>('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(25);

    // Feedback
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Modal de chequeo de partida
    const [targetLot, setTargetLot] = useState<QualityLot | null>(null);
    const [draftStatus, setDraftStatus] = useState<BatchInspectionStatus>('APROBADO');
    const [draftChecks, setDraftChecks] = useState<BatchQualityCheckItem[]>([]);
    const [draftNotes, setDraftNotes] = useState('');
    const [draftBlockStock, setDraftBlockStock] = useState(false);

    // Modal de configuración de pruebas por categoría
    const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
    const [newTestName, setNewTestName] = useState('');
    const [newTestDesc, setNewTestDesc] = useState('');

    // Queries
    const filtersQuery = useGetLocalizedQualityFiltersQuery({
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
    });

    const selectedCategoryObj = useMemo(
        () => filtersQuery.data?.categories.find((c) => c.id === categoryId) ?? null,
        [filtersQuery.data?.categories, categoryId],
    );

    const activeTemplateCategoryId = targetLot?.item?.categoryId || categoryId || undefined;
    const templatesQuery = useGetQualityTemplatesQuery(
        { categoryId: activeTemplateCategoryId },
        { skip: !activeTemplateCategoryId },
    );

    const lotsQuery = useGetQualityLotsQuery(
        {
            page: page + 1,
            pageSize,
            categoryId: categoryId || undefined,
            supplierId: supplierId || undefined,
            itemId: itemId || undefined,
            inspectionStatus: inspectionStatus || undefined,
            q: query || undefined,
        },
        { skip: !categoryId },
    );

    // Mutations
    const [inspectLot, { isLoading: savingInspection }] = useInspectQualityLotMutation();
    const [createTemplate, { isLoading: creatingTemplate }] = useCreateQualityTemplateMutation();
    const [deleteTemplate] = useDeleteQualityTemplateMutation();

    const handleCategoryChange = (nextCategoryId: string) => {
        setCategoryId(nextCategoryId);
        setSupplierId('');
        setItemId('');
        setPage(0);
    };

    const handleSupplierChange = (nextSupplierId: string) => {
        setSupplierId(nextSupplierId);
        setItemId('');
        setPage(0);
    };

    const handleItemChange = (nextItemId: string) => {
        setItemId(nextItemId);
        setPage(0);
    };

    const openInspectModal = (lot: QualityLot) => {
        setTargetLot(lot);
        setDraftStatus(lot.inspectionStatus === 'SIN_TESTEAR' ? 'APROBADO' : lot.inspectionStatus);
        setDraftNotes(lot.qualityNotes ?? '');
        setDraftBlockStock(lot.qualityStatus === 'QUARANTINE' || lot.qualityStatus === 'REJECTED');

        const existingMap = new Map<string, BatchQualityCheckItem>(
            (lot.qualityChecks ?? []).map((c) => [c.templateId, c]),
        );

        const activeTemplates = templatesQuery.data ?? [];
        const merged: BatchQualityCheckItem[] = activeTemplates.map((tpl) => {
            const existing = existingMap.get(tpl.id);
            existingMap.delete(tpl.id);
            return {
                templateId: tpl.id,
                name: tpl.nombre,
                status: existing?.status ?? 'PENDIENTE',
                notes: existing?.notes ?? '',
                checkedAt: existing?.checkedAt ?? null,
                checkedBy: existing?.checkedBy ?? null,
            };
        });

        // Preservar pruebas históricas que existían en el lote aunque la plantilla se haya borrado
        existingMap.forEach((legacy) => {
            merged.push({ ...legacy, notes: legacy.notes ?? '' });
        });

        setDraftChecks(merged);
        setMessage(null);
    };

    const updateCheckItem = (
        templateId: string,
        patch: Partial<Pick<BatchQualityCheckItem, 'status' | 'notes'>>,
    ) => {
        setDraftChecks((prev) =>
            prev.map((item) => (item.templateId === templateId ? { ...item, ...patch } : item)),
        );
    };

    const handleSaveInspection = async () => {
        if (!targetLot) return;
        try {
            await inspectLot({
                id: targetLot.id,
                inspectionStatus: draftStatus,
                checks: draftChecks,
                notes: draftNotes.trim() || null,
                blockStock: draftStatus === 'OBSERVADO' ? draftBlockStock : undefined,
            }).unwrap();

            setTargetLot(null);
            setMessage({
                type: 'success',
                text: `Partida ${targetLot.lotNumber} actualizada a "${INSPECTION_META[draftStatus].label}".`,
            });
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error?.data?.message ?? 'No se pudo guardar el chequeo de la partida.',
            });
        }
    };

    const handleQuickIgnore = async (lot: QualityLot, nextStatus: 'IGNORADO' | 'SIN_TESTEAR') => {
        try {
            await inspectLot({
                id: lot.id,
                inspectionStatus: nextStatus,
            }).unwrap();
            setMessage({
                type: 'success',
                text:
                    nextStatus === 'IGNORADO'
                        ? `Partida ${lot.lotNumber} marcada como ignorada.`
                        : `Partida ${lot.lotNumber} vuelta a "Sin testear".`,
            });
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error?.data?.message ?? 'No se pudo actualizar el estado de la partida.',
            });
        }
    };

    const handleAddTemplate = async () => {
        const targetCatId = activeTemplateCategoryId;
        if (!targetCatId || !newTestName.trim()) return;
        try {
            const created = await createTemplate({
                categoryId: targetCatId,
                nombre: newTestName.trim(),
                descripcion: newTestDesc.trim() || null,
            }).unwrap();
            setNewTestName('');
            setNewTestDesc('');
            // Si el modal de chequeo está abierto, agregarla en vivo al borrador
            if (targetLot) {
                setDraftChecks((prev) => [
                    ...prev,
                    {
                        templateId: created.id,
                        name: created.nombre,
                        status: 'PENDIENTE',
                        notes: '',
                        checkedAt: null,
                        checkedBy: null,
                    },
                ]);
            }
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error?.data?.message ?? 'No se pudo crear la prueba.',
            });
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            await deleteTemplate(id).unwrap();
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error?.data?.message ?? 'No se pudo eliminar la prueba.',
            });
        }
    };

    const inspSummary = lotsQuery.data?.inspectionSummary ?? {
        sinTestear: 0,
        enProceso: 0,
        aprobado: 0,
        observado: 0,
        rechazado: 0,
        ignorado: 0,
        total: 0,
    };

    const evaluatedCount =
        inspSummary.aprobado + inspSummary.observado + inspSummary.rechazado + inspSummary.ignorado;
    const progressPct = inspSummary.total ? Math.round((evaluatedCount / inspSummary.total) * 100) : 0;

    return (
        <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1300, mx: 'auto' }}>
            <PageHeader
                title="Chequeos localizados"
                subtitle="Seleccioná categoría, proveedor e ítem para testear partidas específicas con pruebas configurables."
            />

            {message && (
                <Alert severity={message.type} onClose={() => setMessage(null)} sx={{ mb: 2 }}>
                    {message.text}
                </Alert>
            )}

            {/* Selector en cascada: Categoría -> Proveedor -> Ítem */}
            <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} gap={1} flexWrap="wrap">
                    <Typography variant="subtitle2" fontWeight={800}>
                        1. Seleccioná el alcance del chequeo
                    </Typography>
                    {categoryId && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<TuneOutlinedIcon />}
                            onClick={() => setTemplatesModalOpen(true)}
                            sx={{ fontWeight: 700 }}
                        >
                            Pruebas de esta categoría ({templatesQuery.data?.length ?? 0})
                        </Button>
                    )}
                </Stack>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                        gap: 1.5,
                    }}
                >
                    <TextField
                        select
                        size="small"
                        label="Categoría de material"
                        value={categoryId}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        disabled={filtersQuery.isLoading}
                    >
                        <MenuItem value="">
                            <em>Seleccioná una categoría...</em>
                        </MenuItem>
                        {(filtersQuery.data?.categories ?? []).map((cat) => (
                            <MenuItem key={cat.id} value={cat.id}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }} spacing={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" fontWeight={700} noWrap>
                                            {cat.nombre}
                                        </Typography>
                                        {cat.depositoNombre && (
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {cat.depositoNombre}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={`${cat.untestedCount}/${cat.lotsCount}`}
                                        color={cat.untestedCount > 0 ? 'warning' : 'default'}
                                        variant="outlined"
                                    />
                                </Stack>
                            </MenuItem>
                        ))}
                    </TextField>

                    <TextField
                        select
                        size="small"
                        label="Proveedor"
                        value={supplierId}
                        onChange={(e) => handleSupplierChange(e.target.value)}
                        disabled={!categoryId || filtersQuery.isFetching}
                    >
                        <MenuItem value="">Todos los proveedores</MenuItem>
                        {(filtersQuery.data?.suppliers ?? []).map((sup) => (
                            <MenuItem key={sup.id} value={sup.id}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }} spacing={1}>
                                    <Typography variant="body2" noWrap>
                                        {sup.name}
                                    </Typography>
                                    <Chip size="small" label={`${sup.lotsCount} part.`} variant="outlined" />
                                </Stack>
                            </MenuItem>
                        ))}
                    </TextField>

                    <TextField
                        select
                        size="small"
                        label="Ítem / Material"
                        value={itemId}
                        onChange={(e) => handleItemChange(e.target.value)}
                        disabled={!categoryId || filtersQuery.isFetching}
                    >
                        <MenuItem value="">Todos los ítems</MenuItem>
                        {(filtersQuery.data?.items ?? []).map((it) => (
                            <MenuItem key={it.id} value={it.id}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%' }} spacing={1}>
                                    <Typography variant="body2" noWrap>
                                        {it.codigoInterno} · {it.descripcion}
                                    </Typography>
                                    <Chip size="small" label={`${it.lotsCount}`} variant="outlined" />
                                </Stack>
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
            </Paper>

            {!categoryId ? (
                <Paper
                    variant="outlined"
                    sx={{
                        p: 4,
                        borderRadius: 3,
                        textAlign: 'center',
                        bgcolor: 'action.hover',
                    }}
                >
                    <FactCheckOutlinedIcon sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="h6" fontWeight={800} gutterBottom>
                        Elegí una categoría de material para empezar
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto' }}>
                        Solo se muestran categorías, proveedores e ítems que tienen partidas con stock físico activo.
                        Una vez elegida la categoría, vas a poder configurar sus pruebas (ej. prueba de lavado) y chequear partida por partida.
                    </Typography>
                </Paper>
            ) : (
                <>
                    {/* Métricas y barra de avance */}
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2 }}>
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            justifyContent="space-between"
                            alignItems={{ sm: 'center' }}
                            spacing={1}
                            sx={{ mb: 1 }}
                        >
                            <Typography variant="subtitle2" fontWeight={800}>
                                Avance del lote seleccionado ({evaluatedCount} de {inspSummary.total} resueltas · {progressPct}%)
                            </Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={`Sin testear: ${inspSummary.sinTestear}`} variant="outlined" />
                                {inspSummary.enProceso > 0 && (
                                    <Chip size="small" color="info" label={`En proceso: ${inspSummary.enProceso}`} />
                                )}
                                <Chip size="small" color="success" label={`Aprobadas: ${inspSummary.aprobado}`} />
                                {inspSummary.observado > 0 && (
                                    <Chip size="small" color="warning" label={`Observadas: ${inspSummary.observado}`} />
                                )}
                                {inspSummary.rechazado > 0 && (
                                    <Chip size="small" color="error" label={`Rechazadas: ${inspSummary.rechazado}`} />
                                )}
                                {inspSummary.ignorado > 0 && (
                                    <Chip size="small" label={`Ignoradas: ${inspSummary.ignorado}`} />
                                )}
                            </Stack>
                        </Stack>
                        <LinearProgress
                            variant="determinate"
                            value={progressPct}
                            color="success"
                            sx={{ height: 8, borderRadius: 5 }}
                        />
                    </Paper>

                    {/* Filtros rápidos de estado y búsqueda */}
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, mb: 2 }}>
                        <Stack spacing={1.25}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    label="Buscar por número de partida / lote o descripción"
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setPage(0);
                                    }}
                                />
                            </Stack>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                {[
                                    { value: '', label: `Todas (${inspSummary.total})` },
                                    { value: 'SIN_TESTEAR', label: `Sin testear (${inspSummary.sinTestear})` },
                                    { value: 'EN_PROCESO', label: `En proceso (${inspSummary.enProceso})` },
                                    { value: 'APROBADO', label: `Aprobadas (${inspSummary.aprobado})` },
                                    { value: 'OBSERVADO', label: `Observadas (${inspSummary.observado})` },
                                    { value: 'RECHAZADO', label: `Rechazadas (${inspSummary.rechazado})` },
                                    { value: 'IGNORADO', label: `Ignoradas (${inspSummary.ignorado})` },
                                ].map((opt) => (
                                    <Chip
                                        key={opt.value || 'ALL'}
                                        label={opt.label}
                                        size="small"
                                        clickable
                                        color={inspectionStatus === opt.value ? 'primary' : 'default'}
                                        variant={inspectionStatus === opt.value ? 'filled' : 'outlined'}
                                        onClick={() => {
                                            setInspectionStatus(opt.value);
                                            setPage(0);
                                        }}
                                        sx={{ fontWeight: inspectionStatus === opt.value ? 700 : 500 }}
                                    />
                                ))}
                            </Stack>
                        </Stack>
                    </Paper>

                    {/* Listado de partidas */}
                    {lotsQuery.isLoading ? (
                        <PageLoader text="Cargando partidas..." />
                    ) : !lotsQuery.data?.data.length ? (
                        <Alert severity="info">No hay partidas con stock para los filtros seleccionados.</Alert>
                    ) : (
                        <Stack spacing={1.25} sx={{ opacity: lotsQuery.isFetching ? 0.7 : 1 }}>
                            {lotsQuery.data.data.map((lot) => {
                                const inspMeta = INSPECTION_META[lot.inspectionStatus ?? 'SIN_TESTEAR'];
                                const checks = lot.qualityChecks ?? [];
                                const isBlocked = lot.qualityStatus === 'QUARANTINE' || lot.qualityStatus === 'REJECTED';

                                return (
                                    <Paper
                                        key={lot.id}
                                        variant="outlined"
                                        sx={{
                                            p: { xs: 1.5, sm: 2 },
                                            borderRadius: 3,
                                            opacity: lot.inspectionStatus === 'IGNORADO' ? 0.75 : 1,
                                            borderColor:
                                                lot.inspectionStatus === 'RECHAZADO'
                                                    ? 'error.main'
                                                    : lot.inspectionStatus === 'APROBADO'
                                                      ? 'success.light'
                                                      : undefined,
                                        }}
                                    >
                                        <Stack
                                            direction={{ xs: 'column', sm: 'row' }}
                                            alignItems={{ sm: 'flex-start' }}
                                            justifyContent="space-between"
                                            spacing={1}
                                        >
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography fontWeight={900}>
                                                    {lot.item?.codigoInterno} · {lot.item?.descripcion}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    Partida / Lote <strong>{lot.lotNumber}</strong> ·{' '}
                                                    {lot.supplier?.name || 'Sin proveedor'} · Ingreso:{' '}
                                                    {new Date(lot.createdAt).toLocaleDateString('es-AR')}
                                                </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                <Chip
                                                    icon={renderInspectionIcon(lot.inspectionStatus ?? 'SIN_TESTEAR')}
                                                    label={inspMeta.label}
                                                    color={inspMeta.color}
                                                    size="small"
                                                    sx={{ fontWeight: 700 }}
                                                />
                                                {isBlocked && (
                                                    <Chip
                                                        label={
                                                            lot.qualityStatus === 'REJECTED'
                                                                ? 'Stock bloqueado'
                                                                : 'En cuarentena'
                                                        }
                                                        color={lot.qualityStatus === 'REJECTED' ? 'error' : 'warning'}
                                                        variant="outlined"
                                                        size="small"
                                                    />
                                                )}
                                            </Stack>
                                        </Stack>

                                        {/* Chips de pruebas intermedias realizadas */}
                                        {checks.length > 0 && (
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                                                {checks.map((c) => (
                                                    <Chip
                                                        key={c.templateId}
                                                        size="small"
                                                        variant="outlined"
                                                        icon={
                                                            c.status === 'OK' ? (
                                                                <CheckCircleOutlineIcon />
                                                            ) : c.status === 'FALLO' ? (
                                                                <CancelOutlinedIcon />
                                                            ) : (
                                                                <HelpOutlineIcon />
                                                            )
                                                        }
                                                        label={`${c.name}: ${
                                                            c.status === 'OK'
                                                                ? 'OK'
                                                                : c.status === 'FALLO'
                                                                  ? 'Falló'
                                                                  : c.status === 'NA'
                                                                    ? 'N/A'
                                                                    : 'Pendiente'
                                                        }`}
                                                        color={
                                                            c.status === 'OK'
                                                                ? 'success'
                                                                : c.status === 'FALLO'
                                                                  ? 'error'
                                                                  : 'default'
                                                        }
                                                    />
                                                ))}
                                            </Stack>
                                        )}

                                        <Stack
                                            direction={{ xs: 'column', sm: 'row' }}
                                            spacing={1.5}
                                            alignItems={{ sm: 'center' }}
                                            sx={{ mt: 1.5 }}
                                        >
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Stock físico
                                                </Typography>
                                                <Typography fontWeight={900}>
                                                    {Number(lot.totalQtyPrincipal).toLocaleString('es-AR')}{' '}
                                                    {lot.item?.unidadPrincipal}
                                                </Typography>
                                            </Box>

                                            <Box sx={{ flex: 2 }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    Ubicación
                                                </Typography>
                                                <Typography variant="body2">
                                                    {lot.locations
                                                        .map(
                                                            (loc) =>
                                                                `${loc.deposito || 'Depósito'} / ${loc.posicion || 's/p'} (${Number(loc.qtyPrincipal).toLocaleString('es-AR')})`,
                                                        )
                                                        .join(' · ')}
                                                </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                                                {lot.inspectionStatus === 'IGNORADO' ? (
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        startIcon={<ReplayOutlinedIcon />}
                                                        onClick={() => handleQuickIgnore(lot, 'SIN_TESTEAR')}
                                                        disabled={savingInspection}
                                                    >
                                                        Retomar
                                                    </Button>
                                                ) : lot.inspectionStatus === 'SIN_TESTEAR' ? (
                                                    <Tooltip title="Omitir del chequeo por el momento sin bloquear stock">
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="inherit"
                                                            startIcon={<DoNotDisturbOnOutlinedIcon />}
                                                            onClick={() => handleQuickIgnore(lot, 'IGNORADO')}
                                                            disabled={savingInspection}
                                                        >
                                                            Ignorar
                                                        </Button>
                                                    </Tooltip>
                                                ) : null}

                                                <Button
                                                    fullWidth={isMobile}
                                                    variant="contained"
                                                    size="small"
                                                    startIcon={<FactCheckOutlinedIcon />}
                                                    onClick={() => openInspectModal(lot)}
                                                    sx={{ fontWeight: 700 }}
                                                >
                                                    {lot.inspectionStatus === 'SIN_TESTEAR' ? 'Chequear' : 'Editar chequeo'}
                                                </Button>
                                            </Stack>
                                        </Stack>

                                        {(lot.qualityTestedAt || lot.qualityNotes) && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                                {lot.qualityTestedAt
                                                    ? `Último chequeo por ${lot.qualityTestedBy || 'Usuario'} el ${new Date(lot.qualityTestedAt).toLocaleString('es-AR')}`
                                                    : ''}
                                                {lot.qualityNotes ? ` — ${lot.qualityNotes}` : ''}
                                            </Typography>
                                        )}
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}

                    <TablePagination
                        component="div"
                        count={lotsQuery.data?.total ?? 0}
                        page={page}
                        onPageChange={(_, value) => setPage(value)}
                        rowsPerPage={pageSize}
                        onRowsPerPageChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(0);
                        }}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        labelRowsPerPage="Por página"
                        labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
                    />
                </>
            )}

            {/* Modal de Chequeo de Partida */}
            <Dialog
                open={Boolean(targetLot)}
                onClose={() => !savingInspection && setTargetLot(null)}
                fullScreen={isMobile}
                fullWidth
                maxWidth="md"
            >
                <DialogTitle>
                    Chequeo de partida {targetLot?.lotNumber}
                    <Typography variant="body2" color="text.secondary">
                        {targetLot?.item?.codigoInterno} · {targetLot?.item?.descripcion} ({targetLot?.supplier?.name || 'Sin proveedor'})
                    </Typography>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2.5}>
                        {/* Pruebas intermedias */}
                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle2" fontWeight={800}>
                                    Pruebas intermedias ({selectedCategoryObj?.nombre ?? targetLot?.item?.category?.nombre ?? 'Categoría'})
                                </Typography>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => setTemplatesModalOpen(true)}
                                >
                                    Configurar pruebas
                                </Button>
                            </Stack>

                            {draftChecks.length === 0 ? (
                                <Alert severity="info" variant="outlined">
                                    Esta categoría todavía no tiene pruebas configuradas (ej. Prueba de lavado, Tono, etc.). Podés agregarlas desde{' '}
                                    <strong>Configurar pruebas</strong> o directamente cargar el resultado final abajo.
                                </Alert>
                            ) : (
                                <Stack spacing={1.25}>
                                    {draftChecks.map((check) => (
                                        <Paper key={check.templateId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                            <Stack
                                                direction={{ xs: 'column', sm: 'row' }}
                                                alignItems={{ sm: 'center' }}
                                                justifyContent="space-between"
                                                spacing={1}
                                            >
                                                <Typography fontWeight={700} variant="body2">
                                                    {check.name}
                                                </Typography>

                                                <ToggleButtonGroup
                                                    size="small"
                                                    exclusive
                                                    value={check.status}
                                                    onChange={(_, val: QualityCheckResultStatus | null) => {
                                                        if (val) updateCheckItem(check.templateId, { status: val });
                                                    }}
                                                >
                                                    <ToggleButton value="PENDIENTE">Pendiente</ToggleButton>
                                                    <ToggleButton value="OK" color="success">
                                                        OK
                                                    </ToggleButton>
                                                    <ToggleButton value="FALLO" color="error">
                                                        Falló
                                                    </ToggleButton>
                                                    <ToggleButton value="NA">N/A</ToggleButton>
                                                </ToggleButtonGroup>
                                            </Stack>

                                            <TextField
                                                size="small"
                                                fullWidth
                                                placeholder="Observación de esta prueba (opcional)"
                                                value={check.notes ?? ''}
                                                onChange={(e) =>
                                                    updateCheckItem(check.templateId, { notes: e.target.value })
                                                }
                                                sx={{ mt: 1 }}
                                            />
                                        </Paper>
                                    ))}
                                </Stack>
                            )}
                        </Box>

                        <Divider />

                        {/* Resultado final */}
                        <Box>
                            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                                Resultado de la partida
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                {(
                                    [
                                        'APROBADO',
                                        'EN_PROCESO',
                                        'OBSERVADO',
                                        'RECHAZADO',
                                        'IGNORADO',
                                        'SIN_TESTEAR',
                                    ] as BatchInspectionStatus[]
                                ).map((st) => {
                                    const meta = INSPECTION_META[st];
                                    const selected = draftStatus === st;
                                    return (
                                        <Chip
                                            key={st}
                                            icon={renderInspectionIcon(st)}
                                            label={meta.label}
                                            clickable
                                            color={selected ? (meta.color === 'default' ? 'primary' : meta.color) : 'default'}
                                            variant={selected ? 'filled' : 'outlined'}
                                            onClick={() => setDraftStatus(st)}
                                            sx={{ fontWeight: selected ? 800 : 500 }}
                                        />
                                    );
                                })}
                            </Stack>

                            <Alert
                                severity={
                                    draftStatus === 'RECHAZADO'
                                        ? 'error'
                                        : draftStatus === 'OBSERVADO'
                                          ? 'warning'
                                          : draftStatus === 'APROBADO'
                                            ? 'success'
                                            : 'info'
                                }
                                sx={{ mb: 1.5 }}
                            >
                                {INSPECTION_META[draftStatus].desc}
                            </Alert>

                            {draftStatus === 'OBSERVADO' && (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={draftBlockStock}
                                            onChange={(e) => setDraftBlockStock(e.target.checked)}
                                        />
                                    }
                                    label="Retener esta partida en cuarentena (bloquear salida a producción)"
                                    sx={{ mb: 1 }}
                                />
                            )}

                            <TextField
                                label="Observaciones generales (opcional)"
                                fullWidth
                                multiline
                                minRows={2}
                                value={draftNotes}
                                onChange={(e) => setDraftNotes(e.target.value)}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTargetLot(null)} disabled={savingInspection}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        color={draftStatus === 'RECHAZADO' ? 'error' : 'success'}
                        onClick={handleSaveInspection}
                        disabled={savingInspection}
                        sx={{ fontWeight: 700 }}
                    >
                        {savingInspection ? 'Guardando...' : 'Guardar chequeo'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal para Configurar Pruebas Intermedias de la Categoría */}
            <Dialog
                open={templatesModalOpen}
                onClose={() => setTemplatesModalOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>
                    Pruebas para {selectedCategoryObj?.nombre ?? 'la categoría'}
                    {selectedCategoryObj?.depositoNombre && (
                        <Typography variant="caption" color="text.secondary" display="block">
                            Depósito: {selectedCategoryObj.depositoNombre}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Typography variant="body2" color="text.secondary">
                            Definí las pruebas intermedias que se van a ofrecer al chequear partidas de esta categoría (ej. <em>Prueba de lavado</em>, <em>Control de tono</em>, <em>Resistencia</em>).
                        </Typography>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                                size="small"
                                label="Nombre de la prueba"
                                placeholder="Ej: Prueba de lavado"
                                fullWidth
                                value={newTestName}
                                onChange={(e) => setNewTestName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTemplate();
                                    }
                                }}
                            />
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                disabled={!newTestName.trim() || creatingTemplate}
                                onClick={handleAddTemplate}
                                sx={{ minWidth: 120, fontWeight: 700 }}
                            >
                                Agregar
                            </Button>
                        </Stack>

                        <TextField
                            size="small"
                            label="Descripción / criterio (opcional)"
                            placeholder="Ej: Lavado 40°C sin desteñir"
                            fullWidth
                            value={newTestDesc}
                            onChange={(e) => setNewTestDesc(e.target.value)}
                        />

                        <Divider />

                        {!templatesQuery.data?.length ? (
                            <Alert severity="info" variant="outlined">
                                Todavía no hay pruebas cargadas para esta categoría.
                            </Alert>
                        ) : (
                            <Stack spacing={1}>
                                {templatesQuery.data.map((tpl) => (
                                    <Paper
                                        key={tpl.id}
                                        variant="outlined"
                                        sx={{
                                            px: 1.5,
                                            py: 1,
                                            borderRadius: 2,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 1,
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="body2" fontWeight={700}>
                                                {tpl.nombre}
                                            </Typography>
                                            {tpl.descripcion && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {tpl.descripcion}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Tooltip title="Eliminar prueba">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => handleDeleteTemplate(tpl.id)}
                                            >
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTemplatesModalOpen(false)} variant="contained">
                        Listo
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
