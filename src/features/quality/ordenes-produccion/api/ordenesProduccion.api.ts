import { api } from '../../../../shared/api';
import type { ProduccionParseResult } from '../types/ordenesProduccion.types';

export const ordenesProduccionApi = api.injectEndpoints({
    endpoints: (builder) => ({
        parseOrdenesProduccion: builder.mutation<ProduccionParseResult, FormData>({
            query: (formData) => ({
                url: 'articulos/ordenes-produccion/parse',
                method: 'POST',
                body: formData,
            }),
            invalidatesTags: ['PlanillaProduccion'],
        }),
        recalcularPlanilla: builder.mutation<
            ProduccionParseResult,
            string | { id?: string; plantaId?: string; sector?: string } | void
        >({
            query: (arg) => {
                const isObj = typeof arg === 'object' && arg !== null;
                const id = typeof arg === 'string' ? arg : isObj ? arg.id : undefined;
                const body = isObj ? { plantaId: arg.plantaId, sector: arg.sector } : undefined;
                return {
                    url: id ? `articulos/ordenes-produccion/planillas/${id}/recalcular` : 'articulos/ordenes-produccion/recalcular',
                    method: 'POST',
                    body,
                };
            },
            invalidatesTags: ['PlanillaProduccion'],
        }),
        getUltimaPlanillaProduccion: builder.query<
            ProduccionParseResult | null,
            { plantaId?: string; sector?: string } | void
        >({
            query: (params) => {
                if (params && (params.plantaId || params.sector)) {
                    const p = new URLSearchParams();
                    if (params.plantaId) p.set('plantaId', params.plantaId);
                    if (params.sector) p.set('sector', params.sector);
                    return `articulos/ordenes-produccion/ultima?${p.toString()}`;
                }
                return 'articulos/ordenes-produccion/ultima';
            },
            providesTags: ['PlanillaProduccion'],
        }),
        vincularCodigoSusana: builder.mutation<
            ProduccionParseResult,
            {
                codigoSusana: string;
                articuloId: string;
                planillaId?: string;
                plantaId?: string;
                sector?: string;
            }
        >({
            query: (body) => ({
                url: 'articulos/ordenes-produccion/vincular-susi',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['PlanillaProduccion'],
        }),
        actualizarHoraCambio: builder.mutation<
            ProduccionParseResult,
            {
                fecha: string;
                maquina: number;
                turno: string;
                hora: string;
                planillaId?: string;
                plantaId?: string;
                sector?: string;
            }
        >({
            query: (body) => ({
                url: 'articulos/ordenes-produccion/cambio-hora',
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['PlanillaProduccion'],
        }),
        getCatalogoParaMatcheo: builder.query<
            {
                id: string;
                codigo: string;
                descripcion: string;
                marca?: string | null;
                modelo?: string | null;
                talle?: string | null;
                variante?: string | null;
                etapa?: string | null;
                codigoSusi?: string | null;
                componentesCount: number;
                tieneEstructura: boolean;
            }[],
            { search?: string; etapa?: string }
        >({
            query: (params = {}) => {
                const p = new URLSearchParams();
                if (params.search) p.set('search', params.search);
                if (params.etapa) p.set('etapa', params.etapa);
                return `articulos/ordenes-produccion/catalogo-matcheo?${p.toString()}`;
            },
        }),
        listarPlanillasProduccion: builder.query<any[], void>({
            query: () => 'articulos/ordenes-produccion/planillas',
            providesTags: ['PlanillaProduccion'],
        }),
        getPlanillaProduccionById: builder.query<ProduccionParseResult | null, string>({
            query: (id) => `articulos/ordenes-produccion/planillas/${id}`,
            providesTags: (_res, _err, id) => [{ type: 'PlanillaProduccion', id }],
        }),
        limpiarPlanillasProduccion: builder.mutation<{ deleted: boolean; message: string }, void>({
            query: () => ({
                url: 'articulos/ordenes-produccion/planillas',
                method: 'DELETE',
            }),
            invalidatesTags: ['PlanillaProduccion'],
        }),
        getDepositosArticulos: builder.query<{ depositos: any[]; resumenStockPorArticulo: any[] }, void>({
            query: () => 'articulos/ordenes-produccion/depositos-articulos',
        }),
        crearPosicionArticulo: builder.mutation<any, { depositoId: string; codigo: string; descripcion?: string; capacidadDocenas?: number }>({
            query: (body) => ({
                url: 'articulos/ordenes-produccion/posiciones-articulos',
                method: 'POST',
                body,
            }),
        }),
        listarPedidosProduccion: builder.query<any[], void>({
            query: () => 'articulos/ordenes-produccion/pedidos',
        }),
        crearPedidoProduccion: builder.mutation<any, any>({
            query: (body) => ({
                url: 'articulos/ordenes-produccion/pedidos',
                method: 'POST',
                body,
            }),
        }),
        actualizarPedidoProduccion: builder.mutation<any, { id: string; data: any }>({
            query: ({ id, data }) => ({
                url: `articulos/ordenes-produccion/pedidos/${id}`,
                method: 'PATCH',
                body: data,
            }),
        }),
        sincronizarPlanillaConPedidos: builder.mutation<{ creados: number; actualizados: number }, void>({
            query: () => ({
                url: 'articulos/ordenes-produccion/pedidos/sincronizar',
                method: 'POST',
            }),
        }),
        getCorteProveedor: builder.query<{
            categoriasDisponibles: string[];
            categoriaSeleccionada: string;
            mesesAnalizados: number;
            mensajeCorte: string;
            diasParaCorte: number | null;
            fechaProyectadaCorte: string | null;
            alertaCritica: boolean;
            materialActual: any;
            proximoMaterial: any;
            cadenaPrioridades: any[];
        }, { categoria?: string; meses?: number }>({
            query: (params = {}) => {
                const p = new URLSearchParams();
                if (params.categoria) p.set('categoria', params.categoria);
                if (params.meses) p.set('meses', String(params.meses));
                return `articulos/ordenes-produccion/corte-proveedor?${p.toString()}`;
            },
        }),
    }),
});

export const {
    useParseOrdenesProduccionMutation,
    useRecalcularPlanillaMutation,
    useGetUltimaPlanillaProduccionQuery,
    useVincularCodigoSusanaMutation,
    useActualizarHoraCambioMutation,
    useGetCatalogoParaMatcheoQuery,
    useListarPlanillasProduccionQuery,
    useLazyGetPlanillaProduccionByIdQuery,
    useGetDepositosArticulosQuery,
    useCrearPosicionArticuloMutation,
    useListarPedidosProduccionQuery,
    useCrearPedidoProduccionMutation,
    useActualizarPedidoProduccionMutation,
    useSincronizarPlanillaConPedidosMutation,
    useLimpiarPlanillasProduccionMutation,
    useGetCorteProveedorQuery,
} = ordenesProduccionApi;
