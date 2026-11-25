import { useState, useMemo, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    Autocomplete,
    Paper,
    Tooltip
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import type { OrdenCompra, OrdenCompraLinea } from './types';
import { saveOrdenCompra } from './ordenesCompraStorage';
import { useGetPartnersQuery } from '../../config/partners/api/partners.api';
import { useGetItemsQuery } from '../../warehouse/materiales/api/items.api';
import { CreateItemDialog } from '../../warehouse/materiales/components/CreateItemDialog';
import { CreatePartnerDialog } from '../../config/CreatePartnerDialog';
import { createSmartFilterOptions, getItemSearchFields } from '../../../shared/utils/search';

const colors = {
    primary: '#f59e0b',
    bg: 'var(--bg-primary, #0f1117)',
    cardBg: 'var(--bg-hover-row, rgba(255,255,255,0.03))',
    border: 'rgba(255, 255, 255, 0.08)',
    text: 'var(--text-primary, #f3f4f6)',
    textDim: 'var(--text-muted, #9ca3af)',
    danger: '#ef4444',
    info: '#38bdf8',
    inputBg: 'var(--bg-action-btn, rgba(255,255,255,0.05))'
};

interface OrderLineDraft {
    itemId: string;
    itemCode: string;
    itemDesc: string;
    categoriaId: string;
    categoriaNombre: string;
    cantidadKg: string;
    fechaArribo: string;
}

interface NuevaOrdenCompraModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: (orden: OrdenCompra) => void;
    partners?: any[];
    items?: any[];
    initialPartnerId?: string;
    initialItemId?: string;
    initialQtyKg?: number;
}

export default function NuevaOrdenCompraModal({
    open,
    onClose,
    onSuccess,
    partners: partnersProp,
    items: itemsProp,
    initialPartnerId,
    initialItemId,
    initialQtyKg
}: NuevaOrdenCompraModalProps) {
    const { data: fetchedSuppliers = [] } = useGetPartnersQuery({ type: 'SUPPLIER' });
    const { data: fetchedItems = [] } = useGetItemsQuery({});

    const suppliers = useMemo(() => {
        const base = fetchedSuppliers.length > 0
            ? fetchedSuppliers
            : (partnersProp || []).filter((p: any) => !p.type || p.type === 'SUPPLIER');
        return base.filter((s: any) => s.activo !== false);
    }, [fetchedSuppliers, partnersProp]);

    const items = useMemo(() => {
        const base = fetchedItems.length > 0 ? fetchedItems : (itemsProp || []);
        return base.filter((it: any) => it.activo !== false);
    }, [fetchedItems, itemsProp]);

    const supplierFilterOptions = useMemo(
        () => createSmartFilterOptions<any>((s) => [s?.name, s?.taxId]),
        []
    );
    const itemFilterOptions = useMemo(
        () => createSmartFilterOptions<any>(getItemSearchFields),
        []
    );

    const today = useMemo(() => new Date().toISOString().split('T')[0], []);
    const defaultArrival = useMemo(() => new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], []);

    // ── Cabecera ──
    const [supplierId, setSupplierId] = useState<string>(initialPartnerId || '');
    const [numero, setNumero] = useState<string>(() => {
        const year = new Date().getFullYear();
        return `OC-${year}-${Math.floor(100 + Math.random() * 900)}`;
    });
    const [fechaEmision, setFechaEmision] = useState<string>(today);
    const [fechaArriboGlobal, setFechaArriboGlobal] = useState<string>(defaultArrival);
    const [observaciones, setObservaciones] = useState<string>('');
    const [error, setError] = useState<string>('');

    // Modales de creación rápida en caliente
    const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
    const [isCreatePartnerOpen, setIsCreatePartnerOpen] = useState(false);
    const [activeLineForCreate, setActiveLineForCreate] = useState<number | null>(null);

    // Filtrar estrictamente los materiales asociados al proveedor seleccionado
    const availableItems = useMemo(() => {
        if (!supplierId) return items;
        return items.filter((it: any) => it.supplierId === supplierId);
    }, [items, supplierId]);

    // ── Líneas ──
    const [lines, setLines] = useState<OrderLineDraft[]>(() => {
        if (initialItemId) {
            const it = (itemsProp || []).find((i: any) => i.id === initialItemId);
            return [{
                itemId: initialItemId,
                itemCode: it?.codigoInterno || '',
                itemDesc: it?.descripcion || '',
                categoriaId: it?.categoryId || it?.category?.id || '',
                categoriaNombre: it?.category?.nombre || it?.categoria || '',
                cantidadKg: initialQtyKg ? String(initialQtyKg) : '',
                fechaArribo: defaultArrival
            }];
        }
        return [{
            itemId: '',
            itemCode: '',
            itemDesc: '',
            categoriaId: '',
            categoriaNombre: '',
            cantidadKg: '',
            fechaArribo: defaultArrival
        }];
    });

    const linesContainerRef = useRef<HTMLDivElement | null>(null);

    const focusCell = (lineIndex: number, field: 'material' | 'fechaArribo' | 'cantidadKg') => {
        const el = document.getElementById(`input-oc-line-${lineIndex}-${field}`) as HTMLElement | null;
        if (el) {
            el.focus();
            if (typeof (el as HTMLInputElement).select === 'function') {
                (el as HTMLInputElement).select();
            }
        }
        const rowEl = document.getElementById(`oc-line-card-${lineIndex}`);
        if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    // Auto-foco en proveedor (o primer material si ya vino proveedor inicial)
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            if (!supplierId) {
                const supEl = document.getElementById('input-oc-supplier');
                if (supEl) supEl.focus();
            } else {
                focusCell(0, 'material');
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [open]);

    const handleSupplierChange = (nextSupplierId: string) => {
        setSupplierId(nextSupplierId);
        if (!nextSupplierId) return;
        setLines(prev => prev.map(l => {
            if (!l.itemId) return l;
            const it = items.find((i: any) => i.id === l.itemId);
            if (!it || it.supplierId !== nextSupplierId) {
                return {
                    ...l,
                    itemId: '',
                    itemCode: '',
                    itemDesc: '',
                    categoriaId: '',
                    categoriaNombre: ''
                };
            }
            return l;
        }));
    };

    const handleGlobalArrivalChange = (newDate: string) => {
        const prevGlobal = fechaArriboGlobal;
        setFechaArriboGlobal(newDate);
        setLines(prev => prev.map(l => (!l.fechaArribo || l.fechaArribo === prevGlobal ? { ...l, fechaArribo: newDate } : l)));
    };

    const addLine = () => {
        setLines(prev => {
            const nextIdx = prev.length;
            setTimeout(() => {
                focusCell(nextIdx, 'material');
                if (linesContainerRef.current) {
                    linesContainerRef.current.scrollTo({
                        top: linesContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 80);
            return [
                ...prev,
                {
                    itemId: '',
                    itemCode: '',
                    itemDesc: '',
                    categoriaId: '',
                    categoriaNombre: '',
                    cantidadKg: '',
                    fechaArribo: fechaArriboGlobal
                }
            ];
        });
    };

    const removeLine = (index: number) => {
        setLines(prev => prev.filter((_, i) => i !== index));
    };

    const handleItemChange = (index: number, selectedItem: any) => {
        setLines(prev => {
            const next = [...prev];
            next[index] = {
                ...next[index],
                itemId: selectedItem?.id || '',
                itemCode: selectedItem?.codigoInterno || '',
                itemDesc: selectedItem?.descripcion || '',
                categoriaId: selectedItem?.categoryId || selectedItem?.category?.id || '',
                categoriaNombre: selectedItem?.category?.nombre || selectedItem?.categoria || ''
            };
            return next;
        });
    };

    const updateLine = (index: number, field: keyof OrderLineDraft, val: string) => {
        setLines(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: val };
            return next;
        });
    };

    // Resumen en vivo
    const totals = useMemo(() => {
        let kg = 0;
        lines.forEach(l => {
            kg += parseFloat(l.cantidadKg.replace(',', '.')) || 0;
        });
        return {
            kg,
            count: lines.filter(l => l.itemId && (parseFloat(l.cantidadKg.replace(',', '.')) || 0) > 0).length
        };
    }, [lines]);

    const handleSave = () => {
        setError('');

        if (!supplierId) {
            setError('Seleccioná el proveedor de la orden de compra.');
            return;
        }

        if (!fechaEmision) {
            setError('Indicá la fecha de emisión.');
            return;
        }

        const validLines = lines.filter(l => l.itemId && (parseFloat(l.cantidadKg.replace(',', '.')) || 0) > 0);
        if (validLines.length === 0) {
            setError('Ingresá al menos una línea con material y kilos pedidos mayores a 0.');
            return;
        }

        const missingArrival = validLines.some(l => !(l.fechaArribo || fechaArriboGlobal));
        if (missingArrival) {
            setError('Todas las líneas deben tener una fecha estimada de arribo.');
            return;
        }

        const selectedPartner = suppliers.find((p: any) => p.id === supplierId);
        const nowIso = new Date().toISOString();

        const ordenLineas: OrdenCompraLinea[] = validLines.map((l, idx) => {
            const it = items.find((i: any) => i.id === l.itemId);
            const qtyKg = parseFloat(l.cantidadKg.replace(',', '.'));
            return {
                id: `linea-${Date.now()}-${idx}`,
                itemId: l.itemId,
                codigoInterno: it?.codigoInterno || l.itemCode || 'ITEM',
                descripcion: it?.descripcion || l.itemDesc || 'Material',
                categoriaId: it?.categoryId || it?.category?.id || l.categoriaId || undefined,
                categoriaNombre: it?.category?.nombre || it?.categoria || l.categoriaNombre || '',
                cantidadPedidaKg: qtyKg,
                cantidadRecibidaKg: 0,
                fechaArriboEstimada: l.fechaArribo || fechaArriboGlobal,
                estado: 'PENDIENTE',
                remitosAsociados: [],
                recepcionesManuales: []
            };
        });

        // Fecha estimada global: la más próxima entre las líneas o la general
        const earliestArrival = ordenLineas
            .map(l => l.fechaArriboEstimada)
            .filter(Boolean)
            .sort()[0] || fechaArriboGlobal;

        const nuevaOrden: OrdenCompra = {
            id: `oc-${Date.now()}`,
            numero: numero.trim() || `OC-${Date.now()}`,
            partnerId: supplierId,
            partnerNombre: selectedPartner?.name || 'Proveedor General',
            fechaEmision,
            fechaArriboEstimada: earliestArrival,
            estado: 'EN_CAMINO',
            observaciones: observaciones.trim() || undefined,
            lineas: ordenLineas,
            creadoEn: nowIso,
            actualizadoEn: nowIso
        };

        saveOrdenCompra(nuevaOrden);
        if (onSuccess) onSuccess(nuevaOrden);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="lg"
            PaperProps={{
                sx: {
                    bgcolor: colors.bg,
                    color: colors.text,
                    border: `1px solid ${colors.primary}`,
                    borderRadius: 3,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: `1px solid ${colors.border}` }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 900, color: colors.primary, display: 'flex', alignItems: 'center', gap: 1 }}>
                        📋 Nueva Orden de Compra
                    </Typography>
                    <Typography variant="caption" sx={{ color: colors.textDim }}>
                        Registro de pedido a proveedor para proyección de arribos (no modifica stock físico)
                    </Typography>
                </Box>
                <IconButton onClick={onClose} sx={{ color: colors.textDim }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Cabecera de la Orden de Compra */}
                <Paper sx={{ p: 2.5, bgcolor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ flex: '2 1 280px', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Autocomplete
                                options={suppliers}
                                getOptionLabel={(option: any) => option.name || ''}
                                isOptionEqualToValue={(option: any, value: any) => option?.id === value?.id}
                                filterOptions={supplierFilterOptions}
                                value={suppliers.find((s: any) => s.id === supplierId) || null}
                                onChange={(_e, val: any) => handleSupplierChange(val?.id || '')}
                                autoHighlight
                                autoSelect
                                openOnFocus
                                selectOnFocus
                                handleHomeEndKeys
                                fullWidth
                                size="small"
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Proveedor *"
                                        placeholder="Buscar o seleccionar proveedor..."
                                        InputLabelProps={{ sx: { color: colors.textDim } }}
                                        inputProps={{
                                            ...params.inputProps,
                                            id: 'input-oc-supplier',
                                            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                                if (params.inputProps.onKeyDown) {
                                                    params.inputProps.onKeyDown(e);
                                                }
                                                if (e.key === 'Enter') {
                                                    setTimeout(() => focusCell(0, 'material'), 60);
                                                }
                                            }
                                        }}
                                        InputProps={{ ...params.InputProps, sx: { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2 } }}
                                    />
                                )}
                            />
                            <Tooltip title="Crear nuevo proveedor">
                                <Button
                                    variant="outlined"
                                    onClick={() => setIsCreatePartnerOpen(true)}
                                    sx={{ minWidth: '40px', width: '40px', height: '40px', p: 0, color: colors.primary, borderColor: colors.primary, borderRadius: 2 }}
                                >
                                    +
                                </Button>
                            </Tooltip>
                        </Box>

                        <TextField
                            label="N° de Orden (OC)"
                            placeholder="Ej: OC-2026-001"
                            size="small"
                            value={numero}
                            onChange={(e) => setNumero(e.target.value)}
                            InputLabelProps={{ sx: { color: colors.textDim } }}
                            sx={{ flex: '1 1 170px', '& .MuiOutlinedInput-root': { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2, fontWeight: 700 } }}
                        />

                        <TextField
                            label="Fecha de Emisión *"
                            type="date"
                            size="small"
                            value={fechaEmision}
                            onChange={(e) => setFechaEmision(e.target.value)}
                            InputLabelProps={{ shrink: true, sx: { color: colors.textDim } }}
                            sx={{ flex: '1 1 150px', '& .MuiOutlinedInput-root': { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2 } }}
                        />

                        <TextField
                            label="Arribo Estimado General *"
                            type="date"
                            size="small"
                            value={fechaArriboGlobal}
                            onChange={(e) => handleGlobalArrivalChange(e.target.value)}
                            InputLabelProps={{ shrink: true, sx: { color: colors.info } }}
                            sx={{ flex: '1 1 170px', '& .MuiOutlinedInput-root': { bgcolor: 'rgba(56, 189, 248, 0.08)', color: colors.info, borderRadius: 2, fontWeight: 700 } }}
                        />
                    </Box>

                    <TextField
                        label="Observaciones Generales"
                        placeholder="Ej: Transporte, condiciones de entrega, referencia del pedido..."
                        size="small"
                        fullWidth
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        InputLabelProps={{ sx: { color: colors.textDim } }}
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2 } }}
                    />
                </Paper>

                {/* Líneas de la Orden de Compra */}
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: colors.text, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                                Materiales Solicitados ({lines.length})
                            </Typography>
                            {supplierId && (
                                <Typography variant="caption" sx={{ color: colors.primary, fontSize: '0.7rem', bgcolor: 'rgba(245, 158, 11, 0.1)', px: 1, py: 0.3, borderRadius: 1, border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                    Filtrado por proveedor
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={() => { setActiveLineForCreate(lines.length - 1 >= 0 ? lines.length - 1 : 0); setIsCreateItemOpen(true); }}
                                sx={{ color: colors.primary, borderColor: colors.primary, fontWeight: 700, borderRadius: 2, fontSize: '0.75rem', textTransform: 'none' }}
                            >
                                + Nuevo Material
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={addLine}
                                sx={{ bgcolor: colors.primary, color: '#000', fontWeight: 800, borderRadius: 2, fontSize: '0.75rem', textTransform: 'none', '&:hover': { bgcolor: '#d97706' } }}
                            >
                                + Agregar Línea (o Enter en Kilos)
                            </Button>
                        </Box>
                    </Box>

                    <Box ref={linesContainerRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: '380px', overflowY: 'auto', pr: 0.5, scrollBehavior: 'smooth' }}>
                        {lines.map((line, idx) => {
                            const selectedItem = availableItems.find((it: any) => it.id === line.itemId) || null;
                            const uPrinc = selectedItem?.unidadPrincipal || 'kg';
                            const labelPrinc = uPrinc.toLowerCase() === 'kg'
                                ? 'Kg Pedidos *'
                                : `${uPrinc.trim().charAt(0).toUpperCase() + uPrinc.trim().slice(1)} Pedidos *`;

                            return (
                                <Paper
                                    key={idx}
                                    id={`oc-line-card-${idx}`}
                                    sx={{
                                        p: 1.5,
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: 2.5
                                    }}
                                >
                                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                                        {/* Selector de Material */}
                                        <Autocomplete
                                            options={availableItems}
                                            noOptionsText={supplierId ? 'No hay materiales asignados a este proveedor' : 'Seleccioná un proveedor primero'}
                                            getOptionLabel={(option: any) => `${option.codigoInterno} — ${option.descripcion}`}
                                            isOptionEqualToValue={(option: any, value: any) => option?.id === value?.id}
                                            filterOptions={itemFilterOptions}
                                            value={selectedItem}
                                            onChange={(_e, val: any) => {
                                                handleItemChange(idx, val);
                                                if (val) {
                                                    setTimeout(() => focusCell(idx, 'cantidadKg'), 50);
                                                }
                                            }}
                                            size="small"
                                            autoHighlight
                                            autoSelect
                                            openOnFocus
                                            selectOnFocus
                                            handleHomeEndKeys
                                            sx={{ flex: '3 1 300px' }}
                                            renderInput={(params) => (
                                                <TextField
                                                    {...params}
                                                    label="Material *"
                                                    placeholder={supplierId ? 'Buscar entre materiales del proveedor...' : 'Buscar código o descripción...'}
                                                    InputLabelProps={{ sx: { color: colors.textDim } }}
                                                    inputProps={{
                                                        ...params.inputProps,
                                                        id: `input-oc-line-${idx}-material`,
                                                        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                                            if (params.inputProps.onKeyDown) {
                                                                params.inputProps.onKeyDown(e);
                                                            }
                                                            if (e.key === 'Enter') {
                                                                setTimeout(() => focusCell(idx, 'cantidadKg'), 100);
                                                            }
                                                        }
                                                    }}
                                                    InputProps={{ ...params.InputProps, sx: { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2 } }}
                                                />
                                            )}
                                        />

                                        {/* Fecha Estimada de Arribo */}
                                        <TextField
                                            label="Estimado de Arribo *"
                                            type="date"
                                            size="small"
                                            value={line.fechaArribo}
                                            onChange={(e) => updateLine(idx, 'fechaArribo', e.target.value)}
                                            InputLabelProps={{ shrink: true, sx: { color: colors.info } }}
                                            inputProps={{
                                                id: `input-oc-line-${idx}-fechaArribo`,
                                                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        focusCell(idx, 'cantidadKg');
                                                    }
                                                }
                                            }}
                                            sx={{ flex: '1.2 1 160px', '& .MuiOutlinedInput-root': { bgcolor: 'rgba(56, 189, 248, 0.06)', color: colors.info, borderRadius: 2, fontWeight: 700 } }}
                                        />

                                        {/* Kilos Pedidos */}
                                        <TextField
                                            label={labelPrinc}
                                            type="number"
                                            size="small"
                                            placeholder="0.0"
                                            value={line.cantidadKg}
                                            onChange={(e) => updateLine(idx, 'cantidadKg', e.target.value)}
                                            InputLabelProps={{ sx: { color: colors.textDim } }}
                                            inputProps={{
                                                id: `input-oc-line-${idx}-cantidadKg`,
                                                step: 'any',
                                                min: 0,
                                                onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (idx < lines.length - 1) {
                                                            focusCell(idx + 1, 'material');
                                                        } else {
                                                            addLine();
                                                        }
                                                    }
                                                }
                                            }}
                                            sx={{ flex: '1 1 130px', '& .MuiOutlinedInput-root': { bgcolor: colors.inputBg, color: 'var(--text-white-dynamic, #fff)', borderRadius: 2, fontWeight: 800 } }}
                                        />

                                        {/* Botón Borrar Línea */}
                                        {lines.length > 1 && (
                                            <IconButton
                                                size="small"
                                                onClick={() => removeLine(idx)}
                                                sx={{ color: colors.textDim, '&:hover': { color: colors.danger } }}
                                            >
                                                <DeleteIcon sx={{ fontSize: 18 }} />
                                            </IconButton>
                                        )}
                                    </Box>
                                </Paper>
                            );
                        })}
                    </Box>
                </Box>

                {error && (
                    <Paper sx={{ p: 1.5, bgcolor: 'rgba(239, 68, 68, 0.1)', border: `1px solid ${colors.danger}`, borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: colors.danger, fontWeight: 700 }}>
                            ⚠️ {error}
                        </Typography>
                    </Paper>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2.5, px: 3, borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ color: colors.textDim, fontSize: '0.85rem' }}>
                        Total Pedido: <strong style={{ color: colors.primary }}>{totals.kg.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</strong>
                        <span> &middot; {totals.count} {totals.count === 1 ? 'material' : 'materiales'}</span>
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button variant="text" onClick={onClose} sx={{ color: colors.textDim }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        disabled={!supplierId || totals.kg <= 0}
                        onClick={handleSave}
                        sx={{ bgcolor: colors.primary, color: '#000', fontWeight: 900, borderRadius: 2, px: 3, '&:hover': { bgcolor: '#d97706' } }}
                    >
                        ✓ Confirmar Orden de Compra
                    </Button>
                </Box>
            </DialogActions>

            {/* Diálogo para crear nuevo material */}
            {isCreateItemOpen && (
                <CreateItemDialog
                    open={isCreateItemOpen}
                    onClose={() => setIsCreateItemOpen(false)}
                    initialSupplierId={supplierId || undefined}
                    initialSupplierName={suppliers.find((s: any) => s.id === supplierId)?.name}
                    onSuccess={(newItem: any) => {
                        if (activeLineForCreate !== null && activeLineForCreate >= 0 && activeLineForCreate < lines.length) {
                            handleItemChange(activeLineForCreate, newItem);
                        }
                        setIsCreateItemOpen(false);
                    }}
                />
            )}

            {/* Diálogo para crear nuevo proveedor */}
            {isCreatePartnerOpen && (
                <CreatePartnerDialog
                    open={isCreatePartnerOpen}
                    onClose={() => setIsCreatePartnerOpen(false)}
                    defaultType="SUPPLIER"
                    onSuccess={(newPartner: any) => {
                        handleSupplierChange(newPartner.id);
                        setIsCreatePartnerOpen(false);
                    }}
                />
            )}
        </Dialog>
    );
}
