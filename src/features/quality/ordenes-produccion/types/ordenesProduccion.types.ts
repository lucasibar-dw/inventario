export type EstadoRevisionArticulo = 'PENDIENTE' | 'CON_DUDAS' | 'CHEQUEADO' | 'INCOMPLETO' | 'NO_ENCONTRADO';

export interface ParsedMachineEntry {
    machine: number;
    machineDbId?: string | null;
    machineTypeName?: string | null;
    machineStatus?: string | null;
    articleRaw: string;
    descRaw: string;
    colorRaw: string;
    page: number;
    file: string;
    date: string;
    shift: 'M' | 'N' | string;
    area: string;
    talle?: string;
    articleCode?: string;
    matchedArticle?: any | null;
    isUnreviewed?: boolean;
    orderInShift?: number;
    totalArticlesInMachineShift?: number;
    hasChangeover?: boolean;
    changeoverRole?: 'UNICO' | 'SALIENTE_08AM' | 'ENTRANTE_08AM';
    changeoverType?: string | null;
    changeoverTypes?: string[];
    changeoverDurationMinutes?: number;
    horarioTexto?: string;
    grossHours?: number;
    netHours?: number;
    netSeconds?: number;
    cycleTimeSeconds?: number;
    mediasEstimadas?: number;
    paresEstimados?: number;
    docenasEstimadas?: number;
    hiladosMaquina?: {
        codigoComponente: string;
        codigoItem: string;
        descripcion: string;
        kgPorDocena: number;
        consumoKg: number;
        conosEstimados: number;
    }[];
    salienteArticuloAnterior?: {
        articleCode: string;
        articleRaw?: string;
        descRaw?: string;
        talle?: string;
        colorRaw?: string;
    } | null;
}

export interface ArticuloProduccionSummary {
    codigo: string;
    codigoOriginalPdf: string;
    codigoSusi?: string | null;
    descripcion: string;
    marca: string;
    talles: string[];
    colores: string[];
    turnos: string[];
    fechas: string[];
    maquinasCount: number;
    maquinas: number[];
    maquinasDetalle: {
        machine: number;
        shift: string;
        area: string;
        talle: string;
        color: string;
        date: string;
        hasChangeover?: boolean;
        changeoverRole?: string;
        changeoverType?: string | null;
        netHours?: number;
        cycleTimeSeconds?: number;
        mediasEstimadas?: number;
        paresEstimados?: number;
        docenasEstimadas?: number;
    }[];
    cycleTimeSecondsPromedio?: number;
    horasTejidoTotales?: number;
    mediasTotales?: number;
    paresTotales?: number;
    docenasTotales?: number;
    kilosHiladoTotales?: number;
    estadoRevision: EstadoRevisionArticulo;
    isUnreviewed: boolean;
    advertencia?: string;
    itemRefs: any[];
    articuloId?: string;
}

export interface MaterialAsignadoSummary {
    itemId: string;
    codigoInterno: string;
    codigoComponenteBom?: string;
    descripcion: string;
    categoriaNombre?: string | null;
    rol: string;
    tono?: string | null;
    colorNombre?: string | null;
    proveedor?: string | null;
    rotacion?: string | null;
    unidadPrincipal?: string;
    pesoConoKg?: number;
    maquinasCount: number;
    maquinas: number[];
    consumoTotalKg?: number;
    consumoMananaKg?: number;
    consumoNocheKg?: number;
    conosTotales?: number;
    stockEnPickingKg?: number;
    stockEnReservaKg?: number;
    stockActualTotalKg?: number;
    stockMinimoKg?: number;
    aPasarAPickingKg?: number;
    stockRestanteTotalKg?: number;
    aComprarKg?: number;
    posicionesPickingSugeridas?: string[];
    posicionesStockReserva?: string[];
    partidaSugerida?: string | null;
    posicionOrigenSugerida?: string | null;
    esSustituto?: boolean;
    prioridad?: number;
    sustitutoMotivo?: string | null;
    estadoAbastecimiento?: 'CRITICO_COMPRAR' | 'ALERTA_MINIMO' | 'REPONER_PICKING' | 'OK';
    articulosAsignados: {
        codigoArticulo: string;
        descripcionArticulo: string;
        maquinas: number[];
        docenasTejidas?: number;
        consumoKg?: number;
        isUnreviewed: boolean;
    }[];
}

export interface HojaRepartidorItem {
    id: string;
    area: string;
    shift?: string;
    maquinas: number[];
    maquinasCount: number;
    codigoArticulo: string;
    codigoOriginalPdf?: string;
    descripcionArticulo: string;
    talle: string;
    color: string;
    horasTejido?: number;
    mediasEstimadas?: number;
    paresEstimados?: number;
    docenasEstimadas?: number;
    cambiosDetalle?: string[];
    materiales: {
        codigo: string;
        descripcion: string;
        rol?: string;
        colorNombre?: string | null;
        kgPorDocena?: number;
        consumoKg?: number;
        conos?: number;
        posicionPicking?: string;
    }[];
    isUnreviewed: boolean;
}

export interface HojaPickingItem {
    id: string;
    itemId?: string;
    codigoMaterial: string;
    descripcionMaterial: string;
    categoriaNombre?: string | null;
    tono?: string | null;
    colorNombre?: string | null;
    proveedor?: string | null;
    rol: string;
    maquinasCount: number;
    maquinas: number[];
    areas: string[];
    articulos: string[];
    consumoDiaKg?: number;
    consumoMananaKg?: number;
    consumoNocheKg?: number;
    conosNecesarios?: number;
    stockEnPickingKg?: number;
    stockEnReservaKg?: number;
    stockActualTotalKg?: number;
    stockMinimoKg?: number;
    aPasarAPickingKg?: number;
    stockRestanteTotalKg?: number;
    aComprarKg?: number;
    posicionesPickingSugeridas?: string[];
    posicionesStockReserva?: string[];
    partidaSugerida?: string | null;
    posicionOrigenSugerida?: string | null;
    esSustituto?: boolean;
    prioridad?: number;
    sustitutoMotivo?: string | null;
    estadoAbastecimiento?: 'CRITICO_COMPRAR' | 'ALERTA_MINIMO' | 'REPONER_PICKING' | 'OK';
    hasUnreviewedArticles: boolean;
}

export type EstadoMatchArticuloPlanilla =
    | 'OK'
    | 'SIN_MATCH'
    | 'SIN_ESTRUCTURA'
    | 'ESTRUCTURA_INCOMPLETA';

export interface HiladoPlanillaItem {
    id: string;
    itemId: string | null;
    codigoHilado: string;
    codigoComponenteBom: string;
    descripcionHilado: string;
    categoria: string;
    tipoMaterialCono: 'ALGODON' | 'NYLON' | 'LYCRA' | 'GOMA' | 'OTRO';
    kilosPedido: number;
    kilosManana: number;
    kilosNoche: number;
    pesoConoKg: number;
    pesoConoEsEstimado: boolean;
    motivoPesoCono: string;
    conos: number;
    stockTotalKg: number;
    stockPickingKg: number;
    stockReservaKg: number;
    posicionesPicking: string[];
    sinEquivalenciaItem: boolean;
    esSustituto: boolean;
    sustitutoMotivo: string | null;
    maquinasCount: number;
    maquinas: number[];
    articulosDetalle: {
        codigoArticulo: string;
        codigoSusana: string;
        descripcion: string;
        maquinas: number[];
        horasTejido: number;
        docenas: number;
        kilos: number;
        ritmoEsEstimado: boolean;
    }[];
}

export interface CambioArticuloRef {
    codigoSusana: string;
    codigoCatalogo: string | null;
    articuloId: string | null;
    descripcion: string;
    talle: string;
    color: string;
    estadoMatch: EstadoMatchArticuloPlanilla;
}

export interface CambioPlanillaItem {
    id: string;
    fecha: string;
    maquina: number;
    area: string;
    turno: 'M' | 'N' | string;
    tipoMaquina: string;
    articuloSaliente: CambioArticuloRef;
    articuloEntrante: CambioArticuloRef;
    hora: string;
    horaEsDefault: boolean;
    motivoHora: string;
    tipoCambio: string;
    tiposCambioArray: string[];
    tipoEsInferidoSinMatch: boolean;
    duracionEsperadaMin: number;
    duracionTexto: string;
    duracionEsEstimada: boolean;
    motivoDuracion: string;
    muestrasHistorialBd: number;
    horasTejidoSaliente: number;
    horasTejidoEntranteDia: number;
}

export interface PendientePlanillaItem {
    key: string;
    codigoSusana: string;
    talle: string;
    color: string;
    descripcionPdf: string;
    maquinas: number[];
    areas: string[];
    estado: 'SIN_MATCH' | 'SIN_ESTRUCTURA' | 'ESTRUCTURA_INCOMPLETA';
    mensajeEstado: string;
    articuloMatcheado: {
        id: string;
        codigo: string;
        descripcion: string;
        etapa: string;
    } | null;
    componentesSinItem: string[];
    candidatosSugeridos: {
        id: string;
        codigo: string;
        descripcion: string;
        modelo: string | null;
        talle: string | null;
        variante: string | null;
        etapa: string | null;
        tieneEstructura: boolean;
    }[];
}

export interface ContextoPlantaProduccion {
    plantaId: string | null;
    plantaNombre: string;
    sector: string;
    plantasDisponibles: { id: string; nombre: string; ubicacion?: string | null }[];
    sectoresDisponibles: string[];
    ritmoDocenasPorHoraDefault: number;
    ritmoEsEstimadoGlobal: boolean;
}

export interface ProduccionParseResult {
    planillaId?: string;
    creadoEn?: string;
    fechas: string[];
    turnos: string[];
    areas: string[];
    archivosProcesados: {
        filename: string;
        entriesCount: number;
        machinesFound: number[];
    }[];
    contextoPlanta?: ContextoPlantaProduccion;
    listadoHilado?: HiladoPlanillaItem[];
    listadoCambios?: CambioPlanillaItem[];
    pendientesCompletar?: PendientePlanillaItem[];
    resumenAlertas: {
        totalArticulosDistintos: number;
        totalMaquinasAsignadas: number;
        articulosChequeados: number;
        articulosNoRevisados: number;
        articulosNoEncontrados: number;
        articulosSinEstructura?: number;
        articulosEstructuraIncompleta?: number;
        alertaGlobal: boolean;
        mensajeAlerta: string;
        totalMediasEstimadas?: number;
        totalParesEstimados?: number;
        totalDocenasEstimadas?: number;
        totalKilosHiladoDia?: number;
        totalConosDia?: number;
        totalCambiosProgramados08AM?: number;
        totalItemsReponerPicking?: number;
        totalItemsCriticosComprar?: number;
    };
    articulos: ArticuloProduccionSummary[];
    maquinas: ParsedMachineEntry[];
    colores: {
        color: string;
        maquinasCount: number;
        maquinas: number[];
        articulos: string[];
    }[];
    materiales: MaterialAsignadoSummary[];
    hojaRepartidor: HojaRepartidorItem[];
    hojaPicking: HojaPickingItem[];
}
