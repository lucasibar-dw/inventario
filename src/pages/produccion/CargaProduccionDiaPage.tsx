import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Btn, Badge, Spinner, Modal, Input, useIsMobile } from '../../shared/ui';
import {
    useGetUltimaPlanillaProduccionQuery,
    useParseOrdenesProduccionMutation,
    useVincularCodigoSusanaMutation,
    useActualizarHoraCambioMutation,
    useGetCatalogoParaMatcheoQuery,
} from '../../features/quality/ordenes-produccion/api/ordenesProduccion.api';
import type {
    ProduccionParseResult,
    HiladoPlanillaItem,
    CambioPlanillaItem,
    PendientePlanillaItem,
    CambioArticuloRef,
} from '../../features/quality/ordenes-produccion/types/ordenesProduccion.types';
import {
    exportListadoHiladoDiaToExcel,
    exportListadoCambiosDiaToExcel,
} from '../../features/quality/ordenes-produccion/utils/excelExport';

/**
 * Señal discreta (mini símbolo con cartelito flotante al pasar el mouse o tocar)
 */
const InfoSignal: React.FC<{ text: string; color?: string }> = ({ text, color = '#f59e0b' }) => {
    const [open, setOpen] = useState(false);

    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '5px', cursor: 'help' }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onClick={(e) => {
                e.stopPropagation();
                setOpen((prev) => !prev);
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    fontSize: '10px',
                    fontWeight: 800,
                    color,
                    background: `${color}1f`,
                    border: `1px solid ${color}55`,
                    lineHeight: 1,
                    userSelect: 'none',
                }}
            >
                !
            </span>
            {open && (
                <span
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 60,
                        width: '250px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: '#111827',
                        border: `1px solid ${color}66`,
                        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.45)',
                        color: '#f3f4f6',
                        fontSize: '11px',
                        fontWeight: 500,
                        lineHeight: 1.35,
                        textAlign: 'left',
                        pointerEvents: 'none',
                        whiteSpace: 'normal',
                    }}
                >
                    {text}
                </span>
            )}
        </span>
    );
};

export default function CargaProduccionDiaPage() {
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const folderInputRef = useRef<HTMLInputElement>(null);
    const filesInputRef = useRef<HTMLInputElement>(null);

    // Filtros superiores predeterminados: Der Will + Tejeduría
    const [plantaSeleccionada, setPlantaSeleccionada] = useState<string>('Der Will');
    const [sectorSeleccionado, setSectorSeleccionado] = useState<string>('TEJEDURIA');

    // UNA sola consulta al cargar o volver de completar estructuras
    const {
        data: ultimaPlanilla,
        isLoading: loadingPlanilla,
        isFetching: fetchingPlanilla,
        refetch: refetchPlanilla,
    } = useGetUltimaPlanillaProduccionQuery({
        plantaId: plantaSeleccionada,
        sector: sectorSeleccionado,
    });

    const [parseOrdenes, { isLoading: isUploading }] = useParseOrdenesProduccionMutation();
    const [vincularSusi, { isLoading: isLinking }] = useVincularCodigoSusanaMutation();
    const [actualizarHora, { isLoading: isSavingHora }] = useActualizarHoraCambioMutation();

    const [localPlanilla, setLocalPlanilla] = useState<ProduccionParseResult | null>(null);
    const activePlanilla = localPlanilla || ultimaPlanilla;

    // Selección de carpeta/archivos PDFs
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);
    const [selectedDateFromFiles, setSelectedDateFromFiles] = useState<string>('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Filtros de búsqueda locales para las dos tablas
    const [searchHilado, setSearchHilado] = useState('');
    const [filterTipoHilado, setFilterTipoHilado] = useState<string>('TODOS');
    const [expandedHiladoId, setExpandedHiladoId] = useState<string | null>(null);

    const [searchCambios, setSearchCambios] = useState('');
    const [filterAreaCambio, setFilterAreaCambio] = useState<string>('TODAS');

    // Edición inline de hora de cambio
    const [editingHoraId, setEditingHoraId] = useState<string | null>(null);
    const [editingHoraValue, setEditingHoraValue] = useState<string>('07:00');

    // Modal para matchear un artículo sin matchear o cambiar su vínculo
    const [modalPendiente, setModalPendiente] = useState<PendientePlanillaItem | null>(null);
    const [searchCatalogo, setSearchCatalogo] = useState('');
    const [selectedCatalogoArtId, setSelectedCatalogoArtId] = useState<string>('');

    const { data: catalogoOpciones = [], isFetching: loadingCatalogo } = useGetCatalogoParaMatcheoQuery(
        {
            search: searchCatalogo,
            etapa: 'TODOS',
        },
        { skip: !modalPendiente },
    );

    // Detectar fechas dentro de la carpeta seleccionada (por si una carpeta trae varios días como fwd 4)
    const datesInStagedFiles = useMemo(() => {
        const set = new Set<string>();
        stagedFiles.forEach((f) => {
            const m = f.name.match(/(\d{2}-\d{2})\s+\d+\s+[MN]\.pdf/i);
            if (m) set.add(m[1]);
        });
        return Array.from(set).sort();
    }, [stagedFiles]);

    const handleSelectFilesList = (fileList: FileList | File[]) => {
        const pdfs = Array.from(fileList).filter(
            (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf',
        );
        if (pdfs.length === 0) {
            setUploadError('No se encontraron archivos PDF en la carpeta o selección.');
            return;
        }
        setUploadError(null);
        setStagedFiles(pdfs);

        // Detectar fechas únicas
        const detectedDates = new Set<string>();
        pdfs.forEach((f) => {
            const m = f.name.match(/(\d{2}-\d{2})\s+\d+\s+[MN]\.pdf/i);
            if (m) detectedDates.add(m[1]);
        });
        const sortedDates = Array.from(detectedDates).sort();
        const defaultDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : '';
        setSelectedDateFromFiles(defaultDate);

        // Si todos los PDFs pertenecen a un solo día, procesarlos directamente sin pasos extra
        if (sortedDates.length <= 1) {
            void submitFilesToBackend(pdfs, defaultDate);
        }
    };

    const submitFilesToBackend = async (filesToUpload: File[], dateFilter?: string) => {
        const filtered =
            dateFilter && datesInStagedFiles.length > 1
                ? filesToUpload.filter((f) => f.name.includes(dateFilter))
                : filesToUpload;

        if (filtered.length === 0) {
            setUploadError('No hay archivos PDF para la fecha seleccionada.');
            return;
        }

        const formData = new FormData();
        filtered.forEach((f) => formData.append('files', f));
        formData.append('plantaId', plantaSeleccionada);
        formData.append('sector', sectorSeleccionado);
        if (dateFilter) formData.append('fechaFiltro', dateFilter);

        try {
            setUploadError(null);
            const res = await parseOrdenes(formData).unwrap();
            setLocalPlanilla(res);
        } catch (err: any) {
            setUploadError(err?.data?.message || err?.message || 'Error al analizar los PDFs del día.');
        }
    };

    // Formatear fecha con el año actual
    const fechaDiaFormateada = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const rawDates = activePlanilla?.fechas || [];
        if (rawDates.length === 0) return `Año ${currentYear}`;
        return rawDates
            .map((d) => {
                const parts = d.split('-');
                if (parts.length === 2) return `${parts[0]}/${parts[1]}/${currentYear}`;
                return d;
            })
            .join(', ');
    }, [activePlanilla]);

    // Listado 1: Hilado (con fallback a materiales si una planilla vieja no tenía listadoHilado)
    const listadoHilado: HiladoPlanillaItem[] = useMemo(() => {
        if (activePlanilla?.listadoHilado) return activePlanilla.listadoHilado;
        return (activePlanilla?.materiales || []).map((m) => ({
            id: m.itemId,
            itemId: m.itemId,
            codigoHilado: m.codigoInterno,
            codigoComponenteBom: m.codigoComponenteBom || m.codigoInterno,
            descripcionHilado: m.descripcion,
            categoria: m.categoriaNombre || 'HILADO',
            tipoMaterialCono: 'ALGODON',
            kilosPedido: m.consumoTotalKg || 0,
            kilosManana: m.consumoMananaKg || 0,
            kilosNoche: m.consumoNocheKg || 0,
            pesoConoKg: m.pesoConoKg || 1,
            pesoConoEsEstimado: true,
            motivoPesoCono: 'Valor estimado por tipo de hilado.',
            conos: m.conosTotales || 0,
            stockTotalKg: m.stockActualTotalKg || 0,
            stockPickingKg: m.stockEnPickingKg || 0,
            stockReservaKg: m.stockEnReservaKg || 0,
            posicionesPicking: m.posicionesPickingSugeridas || [],
            sinEquivalenciaItem: false,
            esSustituto: Boolean(m.esSustituto),
            sustitutoMotivo: m.sustitutoMotivo || null,
            maquinasCount: m.maquinasCount,
            maquinas: m.maquinas || [],
            articulosDetalle: (m.articulosAsignados || []).map((a) => ({
                codigoArticulo: a.codigoArticulo,
                codigoSusana: a.codigoArticulo,
                descripcion: a.descripcionArticulo,
                maquinas: a.maquinas,
                horasTejido: 0,
                docenas: a.docenasTejidas || 0,
                kilos: a.consumoKg || 0,
                ritmoEsEstimado: true,
            })),
        }));
    }, [activePlanilla]);

    const filteredHilado = useMemo(() => {
        const q = searchHilado.trim().toLowerCase();
        return listadoHilado.filter((h) => {
            if (filterTipoHilado !== 'TODOS' && h.tipoMaterialCono !== filterTipoHilado) return false;
            if (!q) return true;
            return (
                h.codigoHilado.toLowerCase().includes(q) ||
                h.descripcionHilado.toLowerCase().includes(q) ||
                h.categoria.toLowerCase().includes(q) ||
                h.articulosDetalle.some((a) => a.codigoArticulo.toLowerCase().includes(q))
            );
        });
    }, [listadoHilado, searchHilado, filterTipoHilado]);

    // Listado 2: Cambios de Máquina
    const listadoCambios: CambioPlanillaItem[] = useMemo(() => {
        return activePlanilla?.listadoCambios || [];
    }, [activePlanilla]);

    const filteredCambios = useMemo(() => {
        const q = searchCambios.trim().toLowerCase();
        return listadoCambios.filter((c) => {
            if (filterAreaCambio !== 'TODAS' && String(c.area) !== filterAreaCambio) return false;
            if (!q) return true;
            return (
                String(c.maquina).includes(q) ||
                c.articuloSaliente.codigoSusana.toLowerCase().includes(q) ||
                (c.articuloSaliente.codigoCatalogo || '').toLowerCase().includes(q) ||
                c.articuloEntrante.codigoSusana.toLowerCase().includes(q) ||
                (c.articuloEntrante.codigoCatalogo || '').toLowerCase().includes(q) ||
                c.tipoCambio.toLowerCase().includes(q)
            );
        });
    }, [listadoCambios, searchCambios, filterAreaCambio]);

    // Pendientes de matchear o cargar estructura
    const pendientes: PendientePlanillaItem[] = useMemo(() => {
        return activePlanilla?.pendientesCompletar || [];
    }, [activePlanilla]);

    const abrirAccionPendiente = (pend: PendientePlanillaItem) => {
        if (pend.estado === 'SIN_ESTRUCTURA' && pend.articuloMatcheado) {
            // Si ya está matcheado pero le falta estructura, podemos ir directo a cargarle la estructura o abrir el modal
            setModalPendiente(pend);
            setSearchCatalogo(pend.articuloMatcheado.codigo);
            setSelectedCatalogoArtId(pend.articuloMatcheado.id);
            return;
        }
        const initialQuery = pend.codigoSusana.split(/[\s-]+/)[0] || '';
        setModalPendiente(pend);
        setSearchCatalogo(initialQuery);
        setSelectedCatalogoArtId(pend.candidatosSugeridos?.[0]?.id || '');
    };

    const abrirAccionDesdeRefCambio = (ref: CambioArticuloRef, maquina: number, area: string) => {
        const found = pendientes.find(
            (p) =>
                p.codigoSusana.toUpperCase() === ref.codigoSusana.toUpperCase() ||
                (ref.codigoCatalogo && p.articuloMatcheado?.codigo.toUpperCase() === ref.codigoCatalogo.toUpperCase()),
        );
        if (found) {
            abrirAccionPendiente(found);
            return;
        }
        abrirAccionPendiente({
            key: ref.codigoSusana,
            codigoSusana: ref.codigoSusana,
            talle: ref.talle,
            color: ref.color,
            descripcionPdf: ref.descripcion,
            maquinas: [maquina],
            areas: [area],
            estado: ref.estadoMatch === 'OK' ? 'SIN_MATCH' : ref.estadoMatch,
            mensajeEstado: 'Seleccioná el artículo correspondiente en la base de datos.',
            articuloMatcheado: ref.articuloId
                ? {
                      id: ref.articuloId,
                      codigo: ref.codigoCatalogo || ref.codigoSusana,
                      descripcion: ref.descripcion,
                      etapa: 'TEJIDO',
                  }
                : null,
            componentesSinItem: [],
            candidatosSugeridos: [],
        });
    };

    const handleConfirmarMatcheo = async () => {
        if (!modalPendiente || !selectedCatalogoArtId) return;
        try {
            const updated = await vincularSusi({
                codigoSusana: modalPendiente.codigoSusana,
                articuloId: selectedCatalogoArtId,
                planillaId: activePlanilla?.planillaId,
                plantaId: plantaSeleccionada,
                sector: sectorSeleccionado,
            }).unwrap();
            setLocalPlanilla(updated);
            setModalPendiente(null);
        } catch (err: any) {
            alert(err?.data?.message || err?.message || 'No se pudo vincular el artículo.');
        }
    };

    const handleGuardarHoraCambio = async (cambio: CambioPlanillaItem, nuevaHora: string) => {
        setEditingHoraId(null);
        if (!nuevaHora || nuevaHora === cambio.hora) return;
        try {
            const updated = await actualizarHora({
                fecha: cambio.fecha,
                maquina: cambio.maquina,
                turno: cambio.turno,
                hora: nuevaHora,
                planillaId: activePlanilla?.planillaId,
                plantaId: plantaSeleccionada,
                sector: sectorSeleccionado,
            }).unwrap();
            setLocalPlanilla(updated);
        } catch (err: any) {
            alert(err?.data?.message || err?.message || 'No se pudo guardar el horario.');
        }
    };

    const handleIrACargarEstructura = (codigoArticulo: string, etapa = 'TEJIDO') => {
        navigate(
            `/desarrollo/estructuras?codigo=${encodeURIComponent(codigoArticulo)}&etapa=${encodeURIComponent(etapa)}&returnTo=${encodeURIComponent('/produccion/planificacion')}`,
        );
    };

    const plantasOpciones = useMemo(() => {
        const list = activePlanilla?.contextoPlanta?.plantasDisponibles || [];
        if (list.length === 0) return [{ id: 'Der Will', nombre: 'Der Will' }];
        return list;
    }, [activePlanilla]);

    const sectoresOpciones = useMemo(() => {
        const list = activePlanilla?.contextoPlanta?.sectoresDisponibles || ['TEJEDURIA'];
        return list.includes('TEJEDURIA') ? list : ['TEJEDURIA', ...list];
    }, [activePlanilla]);

    const totalKilosHilado = useMemo(
        () => Math.round(listadoHilado.reduce((acc, h) => acc + h.kilosPedido, 0) * 100) / 100,
        [listadoHilado],
    );
    const totalConos = useMemo(() => listadoHilado.reduce((acc, h) => acc + h.conos, 0), [listadoHilado]);

    return (
        <div style={{ padding: isMobile ? '12px' : '20px', maxWidth: '1480px', margin: '0 auto' }}>
            {/* Input oculto para subir carpeta entera */}
            <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory es estándar en navegadores modernos
                webkitdirectory="true"
                directory="true"
                style={{ display: 'none' }}
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleSelectFilesList(e.target.files);
                        e.target.value = '';
                    }
                }}
            />
            {/* Input oculto para subir PDFs sueltos */}
            <input
                ref={filesInputRef}
                type="file"
                multiple
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleSelectFilesList(e.target.files);
                        e.target.value = '';
                    }
                }}
            />

            {/* ENCABEZADO Y SELECTS DE PLANTA / SECTOR + CARGA DE CARPETA */}
            <PageHeader
                title="Planilla Diaria de Producción — Hilado y Cambios"
                subtitle="Subí la carpeta de PDFs del día para obtener el listado de hilado (kilos, conos, stock y picking) y el listado de cambios de máquina."
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Select Planta (predeterminado Der Will) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600 }}>Planta:</span>
                        <select
                            value={plantaSeleccionada}
                            onChange={(e) => {
                                setPlantaSeleccionada(e.target.value);
                                setLocalPlanilla(null);
                            }}
                            style={{
                                background: '#1f2937',
                                color: '#f9fafb',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {plantasOpciones.map((p) => (
                                <option key={p.id || p.nombre} value={p.nombre}>
                                    {p.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Select Sector (predeterminado Tejeduría) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600 }}>Sector:</span>
                        <select
                            value={sectorSeleccionado}
                            onChange={(e) => {
                                setSectorSeleccionado(e.target.value);
                                setLocalPlanilla(null);
                            }}
                            style={{
                                background: '#1f2937',
                                color: '#f9fafb',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {sectoresOpciones.map((sec) => (
                                <option key={sec} value={sec}>
                                    {sec === 'TEJEDURIA' ? 'Tejeduría' : sec}
                                </option>
                            ))}
                        </select>
                    </div>

                    <Btn
                        variant="primary"
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        {isUploading ? 'Procesando PDFs...' : '📁 Subir Carpeta del Día'}
                    </Btn>
                    <Btn
                        variant="secondary"
                        onClick={() => filesInputRef.current?.click()}
                        disabled={isUploading}
                    >
                        📄 Elegir PDFs
                    </Btn>
                </div>
            </PageHeader>

            {/* ZONA DRAG & DROP / SELECCIÓN DE FECHA SI LA CARPETA TRAE VARIOS DÍAS */}
            <div
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleSelectFilesList(e.dataTransfer.files);
                    }
                }}
                style={{
                    marginBottom: '18px',
                    padding: activePlanilla ? '12px 18px' : '28px 20px',
                    borderRadius: '12px',
                    border: isDragging
                        ? '2px dashed #60a5fa'
                        : '1px dashed rgba(255, 255, 255, 0.18)',
                    background: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    transition: 'all 0.15s ease',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '20px' }}>📂</span>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e5e7eb' }}>
                            {activePlanilla
                                ? `Planilla cargada: ${fechaDiaFormateada} (${activePlanilla.archivosProcesados?.length || 0} archivos PDF)`
                                : 'Arrastrá acá los archivos PDF de la carpeta de producción diaria o usá el botón "Subir Carpeta del Día"'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Formato esperado: Áreas 1 a 5 · Turnos Mañana (M) y Noche (N) — Planta {plantaSeleccionada} ({sectorSeleccionado === 'TEJEDURIA' ? 'Tejeduría' : sectorSeleccionado})
                        </div>
                    </div>
                </div>

                {/* Si la carpeta subida tiene más de un día (ej: fwd 4 tiene 13-11 y 16-11), permitir elegir cuál día ver */}
                {datesInStagedFiles.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>
                            La carpeta contiene {datesInStagedFiles.length} fechas. Elegí el día:
                        </span>
                        {datesInStagedFiles.map((d) => (
                            <Btn
                                key={d}
                                variant={selectedDateFromFiles === d ? 'primary' : 'secondary'}
                                onClick={() => {
                                    setSelectedDateFromFiles(d);
                                    void submitFilesToBackend(stagedFiles, d);
                                }}
                                disabled={isUploading}
                            >
                                📅 {d.replace('-', '/')}/{new Date().getFullYear()}
                            </Btn>
                        ))}
                    </div>
                )}
            </div>

            {uploadError && (
                <div
                    style={{
                        marginBottom: '16px',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        color: '#fca5a5',
                        fontSize: '13px',
                        fontWeight: 600,
                    }}
                >
                    ⚠️ {uploadError}
                </div>
            )}

            {(loadingPlanilla || isUploading) && !activePlanilla && (
                <Card style={{ padding: '48px', textAlign: 'center' }}>
                    <Spinner />
                    <div style={{ marginTop: '12px', color: '#9ca3af', fontSize: '14px' }}>
                        Analizando planilla diaria, calculando cambios de máquina y explosión de hilado...
                    </div>
                </Card>
            )}

            {activePlanilla && (
                <>
                    {/* TARJETAS DE RESUMEN DEL DÍA */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
                            gap: '14px',
                            marginBottom: '20px',
                        }}
                    >
                        <Card style={{ padding: '16px 18px', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>
                                Día Cargado · Máquinas Activas
                            </div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#f9fafb', marginTop: '4px' }}>
                                {fechaDiaFormateada}
                            </div>
                            <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '4px' }}>
                                {activePlanilla.resumenAlertas.totalMaquinasAsignadas} máquinas en planilla ({activePlanilla.archivosProcesados?.length || 0} PDFs)
                            </div>
                        </Card>

                        <Card style={{ padding: '16px 18px', borderLeft: '4px solid #f59e0b' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>
                                Cambios en la Planilla
                            </div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>
                                {listadoCambios.length} cambios
                            </div>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                                Máquinas con 2 artículos en el día (tiempo de cambio descontado de las 24h)
                            </div>
                        </Card>

                        <Card style={{ padding: '16px 18px', borderLeft: '4px solid #10b981' }}>
                            <div
                                style={{
                                    fontSize: '11px',
                                    color: '#9ca3af',
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                Hilado Total del Día
                                <InfoSignal
                                    color="#10b981"
                                    text="Calculado sobre las 24 hs del día (restando en cada máquina con cambio lo que tarda su tipo de cambio según la BD) a un ritmo promedio de planta de 0,8 docenas por hora."
                                />
                            </div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
                                {totalKilosHilado.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg
                            </div>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                                Equivalente a <strong>{totalConos.toLocaleString('es-AR')} conos</strong> en {listadoHilado.length} hilados
                            </div>
                        </Card>

                        <Card
                            style={{
                                padding: '16px 18px',
                                borderLeft: `4px solid ${pendientes.length > 0 ? '#ef4444' : '#10b981'}`,
                            }}
                        >
                            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>
                                Cobertura de Artículos y Estructuras
                            </div>
                            <div
                                style={{
                                    fontSize: '22px',
                                    fontWeight: 800,
                                    color: pendientes.length > 0 ? '#f87171' : '#34d399',
                                    marginTop: '4px',
                                }}
                            >
                                {pendientes.length === 0
                                    ? '100% Completos'
                                    : `${pendientes.length} por completar`}
                            </div>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                                {activePlanilla.resumenAlertas.articulosNoEncontrados || 0} sin matchear ·{' '}
                                {(activePlanilla.resumenAlertas.articulosSinEstructura || 0) +
                                    (activePlanilla.resumenAlertas.articulosEstructuraIncompleta || 0)}{' '}
                                sin estructura completa
                            </div>
                        </Card>
                    </div>

                    {/* PANEL DINÁMICO DE ARTÍCULOS SIN MATCHEAR O SIN ESTRUCTURA */}
                    {pendientes.length > 0 && (
                        <Card
                            style={{
                                marginBottom: '22px',
                                padding: '16px 18px',
                                background: 'rgba(245, 158, 11, 0.06)',
                                border: '1px solid rgba(245, 158, 11, 0.28)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    flexWrap: 'wrap',
                                    marginBottom: '12px',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>
                                        ⚡ Artículos pendientes para completar el cálculo de hilado ({pendientes.length})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#d1d5db', marginTop: '2px' }}>
                                        Tocá cualquier artículo para vincular el código de Susana con el catálogo o cargarle su estructura de hilado. Al completarlo se actualiza la lista automáticamente.
                                    </div>
                                </div>
                                <Btn
                                    variant="secondary"
                                    onClick={() => refetchPlanilla()}
                                    disabled={fetchingPlanilla}
                                >
                                    {fetchingPlanilla ? 'Actualizando...' : '🔄 Actualizar datos'}
                                </Btn>
                            </div>

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                                    gap: '10px',
                                }}
                            >
                                {pendientes.map((p) => {
                                    const isSinMatch = p.estado === 'SIN_MATCH';
                                    const isSinEst = p.estado === 'SIN_ESTRUCTURA';
                                    return (
                                        <div
                                            key={p.key}
                                            onClick={() => abrirAccionPendiente(p)}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '9px',
                                                background: 'rgba(17, 24, 39, 0.75)',
                                                border: `1px solid ${
                                                    isSinMatch ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'
                                                }`,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                gap: '6px',
                                                transition: 'transform 0.12s ease, border-color 0.12s ease',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#f9fafb' }}>
                                                        {p.codigoSusana}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                        {p.descripcionPdf || 'Sin descripción'}{' '}
                                                        {p.talle ? `· Talle ${p.talle}` : ''}{' '}
                                                        {p.color ? `· ${p.color}` : ''}
                                                    </div>
                                                </div>
                                                <Badge color={isSinMatch ? '#ef4444' : '#f59e0b'}>
                                                    {isSinMatch
                                                        ? 'SIN MATCHEAR'
                                                        : isSinEst
                                                          ? 'SIN ESTRUCTURA'
                                                          : 'FALTA EQUIV.'}
                                                </Badge>
                                            </div>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginTop: '4px',
                                                    fontSize: '11px',
                                                }}
                                            >
                                                <span style={{ color: '#9ca3af' }}>
                                                    Máq: {p.maquinas.map((m) => `M${m}`).join(', ')}
                                                </span>
                                                <span style={{ color: '#60a5fa', fontWeight: 700 }}>
                                                    {isSinMatch
                                                        ? '🔗 Elegir código →'
                                                        : `🧩 Completar (${p.articuloMatcheado?.codigo}) →`}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* =====================================================================
                        LISTADO 1: HILADO (Hilado, Kilos del pedido, Conos, Stock, Picking)
                       ===================================================================== */}
                    <Card style={{ marginBottom: '26px', padding: '18px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                marginBottom: '14px',
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f9fafb' }}>
                                    1. Listado de Hilado del Día ({filteredHilado.length})
                                </h2>
                                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                                    Conos calculados según material (Algodón 1 kg · Nylon 700 g · Lycra 3,5 kg · Goma 500 g). Stock del depósito de Hilado (excluye Pilar).
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <select
                                    value={filterTipoHilado}
                                    onChange={(e) => setFilterTipoHilado(e.target.value)}
                                    style={{
                                        background: '#111827',
                                        color: '#e5e7eb',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '8px',
                                        padding: '7px 10px',
                                        fontSize: '12px',
                                    }}
                                >
                                    <option value="TODOS">Todos los materiales</option>
                                    <option value="ALGODON">Algodón (1 kg/cono)</option>
                                    <option value="NYLON">Nylon / Poliéster (700 g/cono)</option>
                                    <option value="LYCRA">Lycra (3,5 kg/cono)</option>
                                    <option value="GOMA">Goma (500 g/cono)</option>
                                </select>

                                <div style={{ width: isMobile ? '100%' : '230px' }}>
                                    <Input
                                        placeholder="Buscar hilado o artículo..."
                                        value={searchHilado}
                                        onChange={(val) => setSearchHilado(val)}
                                    />
                                </div>

                                <Btn
                                    variant="secondary"
                                    onClick={() =>
                                        exportListadoHiladoDiaToExcel(
                                            filteredHilado,
                                            `hilado_dia_${activePlanilla.fechas?.[0] || 'planilla'}.xlsx`,
                                        )
                                    }
                                >
                                    📥 Exportar Excel
                                </Btn>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '13px',
                                }}
                            >
                                <thead>
                                    <tr
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.12)',
                                            textAlign: 'left',
                                            color: '#9ca3af',
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        <th style={{ padding: '10px 12px' }}>Hilado</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Kilos del Pedido</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>
                                            Cuántos Conos Corresponde
                                        </th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>En Stock (Depósito)</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>
                                            En Pasillo de Picking
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHilado.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}
                                            >
                                                No hay hilados para mostrar con ese filtro.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredHilado.map((h) => {
                                            const isExpanded = expandedHiladoId === h.id;
                                            const faltaEnPicking = h.stockPickingKg < h.kilosPedido;
                                            const faltaEnStockTotal = h.stockTotalKg < h.kilosPedido;

                                            return (
                                                <React.Fragment key={h.id}>
                                                    <tr
                                                        onClick={() =>
                                                            setExpandedHiladoId(isExpanded ? null : h.id)
                                                        }
                                                        style={{
                                                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                            cursor: 'pointer',
                                                            background: isExpanded
                                                                ? 'rgba(59, 130, 246, 0.08)'
                                                                : 'transparent',
                                                        }}
                                                    >
                                                        {/* Columna 1: Hilado */}
                                                        <td style={{ padding: '11px 12px' }}>
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    flexWrap: 'wrap',
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontWeight: 700,
                                                                        color: '#f9fafb',
                                                                    }}
                                                                >
                                                                    {isExpanded ? '▾' : '▸'} {h.codigoHilado}
                                                                </span>
                                                                <Badge
                                                                    color={
                                                                        h.tipoMaterialCono === 'ALGODON'
                                                                            ? '#3b82f6'
                                                                            : h.tipoMaterialCono === 'NYLON'
                                                                              ? '#8b5cf6'
                                                                              : h.tipoMaterialCono === 'LYCRA'
                                                                                ? '#ec4899'
                                                                                : h.tipoMaterialCono === 'GOMA'
                                                                                  ? '#10b981'
                                                                                  : '#6b7280'
                                                                    }
                                                                >
                                                                    {h.categoria}
                                                                </Badge>
                                                                {h.sinEquivalenciaItem && (
                                                                    <Badge color="#f59e0b">Sin ítem vinculado</Badge>
                                                                )}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: '11px',
                                                                    color: '#9ca3af',
                                                                    marginTop: '2px',
                                                                }}
                                                            >
                                                                {h.descripcionHilado} · {h.maquinasCount} máq.
                                                            </div>
                                                        </td>

                                                        {/* Columna 2: Kilos del Pedido */}
                                                        <td
                                                            style={{
                                                                padding: '11px 12px',
                                                                textAlign: 'right',
                                                                fontWeight: 800,
                                                                color: '#f9fafb',
                                                            }}
                                                        >
                                                            {h.kilosPedido.toLocaleString('es-AR', {
                                                                minimumFractionDigits: 2,
                                                                maximumFractionDigits: 2,
                                                            })}{' '}
                                                            kg
                                                        </td>

                                                        {/* Columna 3: Cuántos Conos Corresponde + Señal sutil si es estimado */}
                                                        <td
                                                            style={{
                                                                padding: '11px 12px',
                                                                textAlign: 'right',
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'flex-end',
                                                                    fontWeight: 800,
                                                                    color: '#fbbf24',
                                                                }}
                                                            >
                                                                {h.conos} conos
                                                                {h.pesoConoEsEstimado && (
                                                                    <InfoSignal
                                                                        color="#f59e0b"
                                                                        text={h.motivoPesoCono}
                                                                    />
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                                                                ({h.pesoConoKg} kg/cono)
                                                            </div>
                                                        </td>

                                                        {/* Columna 4: Cuánto tengo en Stock */}
                                                        <td
                                                            style={{
                                                                padding: '11px 12px',
                                                                textAlign: 'right',
                                                                fontWeight: 700,
                                                                color: faltaEnStockTotal ? '#f87171' : '#34d399',
                                                            }}
                                                        >
                                                            {h.stockTotalKg.toLocaleString('es-AR', {
                                                                minimumFractionDigits: 1,
                                                                maximumFractionDigits: 2,
                                                            })}{' '}
                                                            kg
                                                        </td>

                                                        {/* Columna 5: Cuánto tengo en el Pasillo de Picking */}
                                                        <td
                                                            style={{
                                                                padding: '11px 12px',
                                                                textAlign: 'right',
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    fontWeight: 700,
                                                                    color: faltaEnPicking ? '#fbbf24' : '#60a5fa',
                                                                }}
                                                            >
                                                                {h.stockPickingKg.toLocaleString('es-AR', {
                                                                    minimumFractionDigits: 1,
                                                                    maximumFractionDigits: 2,
                                                                })}{' '}
                                                                kg
                                                            </div>
                                                            {h.posicionesPicking.length > 0 && (
                                                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                                                                    Pos: {h.posicionesPicking.slice(0, 3).join(', ')}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {/* Desglose expandible por artículos que consumen este hilado */}
                                                    {isExpanded && (
                                                        <tr style={{ background: 'rgba(17, 24, 39, 0.65)' }}>
                                                            <td colSpan={5} style={{ padding: '10px 16px' }}>
                                                                <div
                                                                    style={{
                                                                        fontSize: '11px',
                                                                        color: '#9ca3af',
                                                                        marginBottom: '6px',
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    Artículos en máquina que usan {h.codigoHilado} (Máquinas: {h.maquinas.map((m) => `M${m}`).join(', ')}):
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexWrap: 'wrap',
                                                                        gap: '8px',
                                                                    }}
                                                                >
                                                                    {h.articulosDetalle.map((ad) => (
                                                                        <div
                                                                            key={ad.codigoArticulo}
                                                                            style={{
                                                                                padding: '6px 10px',
                                                                                borderRadius: '6px',
                                                                                background: 'rgba(255,255,255,0.04)',
                                                                                border: '1px solid rgba(255,255,255,0.08)',
                                                                                fontSize: '11px',
                                                                            }}
                                                                        >
                                                                            <strong style={{ color: '#e5e7eb' }}>
                                                                                {ad.codigoArticulo}
                                                                            </strong>{' '}
                                                                            · {ad.kilos} kg ({ad.docenas} doc en {ad.horasTejido}h) · Máq:{' '}
                                                                            {ad.maquinas.map((m) => `M${m}`).join(', ')}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {/* =====================================================================
                        LISTADO 2: CAMBIOS DE MÁQUINA (Máquina, Sale, Entra, Hora, Tipo, Duración)
                       ===================================================================== */}
                    <Card style={{ padding: '18px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                marginBottom: '14px',
                            }}
                        >
                            <div>
                                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f9fafb' }}>
                                    2. Listado de Cambios de Máquina ({filteredCambios.length})
                                </h2>
                                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                                    Solo máquinas con cambio en la planilla. Hacé clic en la hora para editarla o en cualquier artículo con alerta para vincularlo.
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <select
                                    value={filterAreaCambio}
                                    onChange={(e) => setFilterAreaCambio(e.target.value)}
                                    style={{
                                        background: '#111827',
                                        color: '#e5e7eb',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: '8px',
                                        padding: '7px 10px',
                                        fontSize: '12px',
                                    }}
                                >
                                    <option value="TODAS">Todas las áreas</option>
                                    {(activePlanilla.areas || []).map((a) => (
                                        <option key={a} value={a}>
                                            Área {a}
                                        </option>
                                    ))}
                                </select>

                                <div style={{ width: isMobile ? '100%' : '230px' }}>
                                    <Input
                                        placeholder="Buscar máquina o artículo..."
                                        value={searchCambios}
                                        onChange={(val) => setSearchCambios(val)}
                                    />
                                </div>

                                <Btn
                                    variant="secondary"
                                    onClick={() =>
                                        exportListadoCambiosDiaToExcel(
                                            filteredCambios,
                                            `cambios_dia_${activePlanilla.fechas?.[0] || 'planilla'}.xlsx`,
                                        )
                                    }
                                >
                                    📥 Exportar Excel
                                </Btn>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '13px',
                                }}
                            >
                                <thead>
                                    <tr
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.12)',
                                            textAlign: 'left',
                                            color: '#9ca3af',
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        <th style={{ padding: '10px 12px' }}>Máquina</th>
                                        <th style={{ padding: '10px 12px' }}>Sale (Artículo Saliente)</th>
                                        <th style={{ padding: '10px 12px' }}>Entra (Artículo Entrante)</th>
                                        <th style={{ padding: '10px 12px' }}>Hora del Cambio</th>
                                        <th style={{ padding: '10px 12px' }}>Tipo de Cambio</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>
                                            Tiempo Esperado
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCambios.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}
                                            >
                                                No se detectaron cambios de artículo para ese filtro.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredCambios.map((c) => {
                                            const isEditingHora = editingHoraId === c.id;

                                            const renderArticuloCell = (ref: CambioArticuloRef) => {
                                                const needsAction = ref.estadoMatch !== 'OK';
                                                return (
                                                    <div>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                flexWrap: 'wrap',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontWeight: 700,
                                                                    color: needsAction ? '#fbbf24' : '#f9fafb',
                                                                }}
                                                            >
                                                                {ref.codigoCatalogo || ref.codigoSusana}
                                                            </span>
                                                            {ref.talle && (
                                                                <Badge color="#6366f1">Talle {ref.talle}</Badge>
                                                            )}
                                                            {needsAction && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        abrirAccionDesdeRefCambio(
                                                                            ref,
                                                                            c.maquina,
                                                                            c.area,
                                                                        )
                                                                    }
                                                                    style={{
                                                                        background:
                                                                            ref.estadoMatch === 'SIN_MATCH'
                                                                                ? 'rgba(239, 68, 68, 0.18)'
                                                                                : 'rgba(245, 158, 11, 0.18)',
                                                                        color:
                                                                            ref.estadoMatch === 'SIN_MATCH'
                                                                                ? '#fca5a5'
                                                                                : '#fde68a',
                                                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                                                        borderRadius: '6px',
                                                                        padding: '2px 7px',
                                                                        fontSize: '10px',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    {ref.estadoMatch === 'SIN_MATCH'
                                                                        ? '🔗 Matchear'
                                                                        : '🧩 Cargar estructura'}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: '11px',
                                                                color: '#9ca3af',
                                                                marginTop: '2px',
                                                            }}
                                                        >
                                                            {ref.color || ref.descripcion}
                                                            {ref.codigoCatalogo &&
                                                            ref.codigoCatalogo !== ref.codigoSusana
                                                                ? ` (PDF: ${ref.codigoSusana})`
                                                                : ''}
                                                        </div>
                                                    </div>
                                                );
                                            };

                                            return (
                                                <tr
                                                    key={c.id}
                                                    style={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                    }}
                                                >
                                                    {/* Máquina */}
                                                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontWeight: 800, color: '#60a5fa', fontSize: '14px' }}>
                                                            Máq #{c.maquina}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                            Área {c.area || '-'} · Turno {c.turno === 'N' ? 'Noche' : 'Mañana'}
                                                        </div>
                                                    </td>

                                                    {/* De qué artículo sale */}
                                                    <td style={{ padding: '11px 12px' }}>
                                                        {renderArticuloCell(c.articuloSaliente)}
                                                    </td>

                                                    {/* A qué artículo entra */}
                                                    <td style={{ padding: '11px 12px' }}>
                                                        {renderArticuloCell(c.articuloEntrante)}
                                                    </td>

                                                    {/* Hora en que se va a hacer (default 07:00 AM en M / 06:00 AM en N, editable + señal discreta) */}
                                                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                                                        {isEditingHora ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <input
                                                                    type="time"
                                                                    value={editingHoraValue}
                                                                    onChange={(e) => setEditingHoraValue(e.target.value)}
                                                                    style={{
                                                                        background: '#111827',
                                                                        color: '#f9fafb',
                                                                        border: '1px solid #60a5fa',
                                                                        borderRadius: '6px',
                                                                        padding: '4px 6px',
                                                                        fontSize: '12px',
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    disabled={isSavingHora}
                                                                    onClick={() =>
                                                                        void handleGuardarHoraCambio(c, editingHoraValue)
                                                                    }
                                                                    style={{
                                                                        background: '#2563eb',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        borderRadius: '6px',
                                                                        padding: '4px 8px',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    OK
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingHoraId(null)}
                                                                    style={{
                                                                        background: 'transparent',
                                                                        color: '#9ca3af',
                                                                        border: 'none',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                <span
                                                                    onClick={() => {
                                                                        setEditingHoraId(c.id);
                                                                        setEditingHoraValue(c.hora);
                                                                    }}
                                                                    title="Hacé clic para cambiar la hora"
                                                                    style={{
                                                                        fontWeight: 700,
                                                                        color: '#f9fafb',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px',
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        border: '1px dashed rgba(255,255,255,0.18)',
                                                                        cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    🕒 {c.hora} hs
                                                                </span>
                                                                {c.horaEsDefault && (
                                                                    <InfoSignal
                                                                        color="#60a5fa"
                                                                        text={c.motivoHora}
                                                                    />
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Tipo de cambio según los artículos */}
                                                    <td style={{ padding: '11px 12px' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                            <Badge
                                                                color={
                                                                    c.tipoCambio.includes('ARTÍCULO')
                                                                        ? '#ef4444'
                                                                        : c.tipoCambio.includes('COLOR') &&
                                                                            c.tipoCambio.includes('TALLE')
                                                                          ? '#f59e0b'
                                                                          : c.tipoCambio.includes('TALLE')
                                                                            ? '#3b82f6'
                                                                            : '#10b981'
                                                                }
                                                            >
                                                                {c.tipoCambio}
                                                            </Badge>
                                                            {c.tipoEsInferidoSinMatch && (
                                                                <InfoSignal
                                                                    color="#f59e0b"
                                                                    text="Tipo de cambio deducido de los códigos/talles/colores del PDF porque uno de los dos artículos aún no está matcheado en el catálogo."
                                                                />
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Cuánto se espera que tarde un cambio así */}
                                                    <td
                                                        style={{
                                                            padding: '11px 12px',
                                                            textAlign: 'right',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                fontWeight: 800,
                                                                color: '#fbbf24',
                                                            }}
                                                        >
                                                            {c.duracionTexto}
                                                            <InfoSignal
                                                                color="#f59e0b"
                                                                text={`${c.motivoDuracion}. Se descuentan ${c.duracionEsperadaMin} min de las 24 hs del día (Saliente: ${c.horasTejidoSaliente}h · Entrante: ${c.horasTejidoEntranteDia}h).`}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}

            {/* MODAL DINÁMICO PARA MATCHEAR CÓDIGO DE SUSANA O IR A CARGAR ESTRUCTURA */}
            {modalPendiente && (
                <Modal
                    onClose={() => setModalPendiente(null)}
                    title={
                        modalPendiente.estado === 'SIN_MATCH'
                            ? `🔗 Matchear código de Susana: ${modalPendiente.codigoSusana}`
                            : `🧩 Completar estructura de: ${modalPendiente.articuloMatcheado?.codigo || modalPendiente.codigoSusana}`
                    }
                    wide
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Resumen del artículo leído en el PDF */}
                        <div
                            style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                            }}
                        >
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#f9fafb' }}>
                                Código en PDF: <span style={{ color: '#fbbf24' }}>{modalPendiente.codigoSusana}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#d1d5db', marginTop: '4px' }}>
                                Descripción: {modalPendiente.descripcionPdf || 'Sin descripción'} · Talle:{' '}
                                <strong>{modalPendiente.talle || '-'}</strong> · Color:{' '}
                                <strong>{modalPendiente.color || '-'}</strong> · Máquinas:{' '}
                                {modalPendiente.maquinas.map((m) => `M${m}`).join(', ')}
                            </div>
                            <div style={{ fontSize: '12px', color: '#fde68a', marginTop: '6px' }}>
                                {modalPendiente.mensajeEstado}
                            </div>
                        </div>

                        {/* Si ya tiene artículo matcheado pero le falta estructura, botón directo para ir a cargarla */}
                        {modalPendiente.articuloMatcheado && (
                            <div
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: '10px',
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    border: '1px solid rgba(59, 130, 246, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd' }}>
                                        Artículo vinculado actualmente: {modalPendiente.articuloMatcheado.codigo}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                                        Podés ir directo a cargarle los hilados de su estructura o elegir otro código del catálogo abajo.
                                    </div>
                                </div>
                                <Btn
                                    variant="primary"
                                    onClick={() =>
                                        handleIrACargarEstructura(
                                            modalPendiente.articuloMatcheado!.codigo,
                                            modalPendiente.articuloMatcheado!.etapa || 'TEJIDO',
                                        )
                                    }
                                >
                                    🧩 Ir a Cargar Estructura de {modalPendiente.articuloMatcheado.codigo} →
                                </Btn>
                            </div>
                        )}

                        {/* Sugerencias rápidas del mismo modelo si las hay */}
                        {modalPendiente.candidatosSugeridos && modalPendiente.candidatosSugeridos.length > 0 && (
                            <div>
                                <div
                                    style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        color: '#9ca3af',
                                        marginBottom: '6px',
                                    }}
                                >
                                    Sugerencias del catálogo para este modelo:
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {modalPendiente.candidatosSugeridos.map((cand) => {
                                        const isSel = selectedCatalogoArtId === cand.id;
                                        return (
                                            <button
                                                key={cand.id}
                                                type="button"
                                                onClick={() => setSelectedCatalogoArtId(cand.id)}
                                                style={{
                                                    padding: '7px 11px',
                                                    borderRadius: '8px',
                                                    border: isSel
                                                        ? '2px solid #60a5fa'
                                                        : '1px solid rgba(255,255,255,0.15)',
                                                    background: isSel
                                                        ? 'rgba(59, 130, 246, 0.22)'
                                                        : 'rgba(255,255,255,0.04)',
                                                    color: '#f9fafb',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ fontWeight: 700 }}>{cand.codigo}</div>
                                                <div style={{ fontSize: '10px', color: cand.tieneEstructura ? '#34d399' : '#fbbf24' }}>
                                                    {cand.tieneEstructura ? '✓ Con estructura' : '⚠ Sin estructura'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Buscador de todos los códigos existentes en la BD */}
                        <div>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#d1d5db',
                                    marginBottom: '6px',
                                }}
                            >
                                🔍 Buscar entre todos los códigos de artículos existentes en la Base de Datos:
                            </label>
                            <Input
                                placeholder="Escribí código, modelo, talle o descripción..."
                                value={searchCatalogo}
                                onChange={(val) => setSearchCatalogo(val)}
                            />
                        </div>

                        <div
                            style={{
                                maxHeight: '250px',
                                overflowY: 'auto',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.25)',
                            }}
                        >
                            {loadingCatalogo ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                                    <Spinner /> Buscando códigos en la base de datos...
                                </div>
                            ) : catalogoOpciones.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                                    No se encontraron artículos con ese filtro.
                                </div>
                            ) : (
                                catalogoOpciones.map((art) => {
                                    const isSelected = selectedCatalogoArtId === art.id;
                                    return (
                                        <div
                                            key={art.id}
                                            onClick={() => setSelectedCatalogoArtId(art.id)}
                                            style={{
                                                padding: '10px 14px',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                cursor: 'pointer',
                                                background: isSelected ? 'rgba(59, 130, 246, 0.22)' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#f9fafb', fontSize: '13px' }}>
                                                    {art.codigo}{' '}
                                                    <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>
                                                        ({art.etapa || 'TEJIDO'})
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                    {art.descripcion} · Talle: {art.talle || '-'} · Var: {art.variante || '-'}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Badge color={art.tieneEstructura ? '#10b981' : '#f59e0b'}>
                                                    {art.tieneEstructura
                                                        ? `✓ Estructura (${art.componentesCount})`
                                                        : '⚠ Sin estructura'}
                                                </Badge>
                                                {!art.tieneEstructura && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleIrACargarEstructura(art.codigo, art.etapa || 'TEJIDO');
                                                        }}
                                                        style={{
                                                            background: 'rgba(59, 130, 246, 0.2)',
                                                            color: '#93c5fd',
                                                            border: '1px solid rgba(59, 130, 246, 0.4)',
                                                            borderRadius: '6px',
                                                            padding: '3px 8px',
                                                            fontSize: '11px',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Cargar estructura →
                                                    </button>
                                                )}
                                                <input
                                                    type="radio"
                                                    checked={isSelected}
                                                    onChange={() => setSelectedCatalogoArtId(art.id)}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                            <Btn variant="secondary" onClick={() => setModalPendiente(null)}>
                                Cerrar
                            </Btn>
                            <Btn
                                variant="primary"
                                disabled={!selectedCatalogoArtId || isLinking}
                                onClick={() => void handleConfirmarMatcheo()}
                            >
                                {isLinking ? 'Guardando vínculo...' : '✓ Vincular Código y Actualizar Lista'}
                            </Btn>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
