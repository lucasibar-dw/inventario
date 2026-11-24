import { api } from '../../../shared/api';

export type BatchQualityStatus = 'QUARANTINE' | 'RELEASED' | 'REJECTED';
export type BatchInspectionStatus =
    | 'SIN_TESTEAR'
    | 'EN_PROCESO'
    | 'APROBADO'
    | 'OBSERVADO'
    | 'RECHAZADO'
    | 'IGNORADO';

export type QualityCheckResultStatus = 'PENDIENTE' | 'OK' | 'FALLO' | 'NA';

export interface BatchQualityCheckItem {
    templateId: string;
    name: string;
    status: QualityCheckResultStatus;
    notes?: string | null;
    checkedAt?: string | null;
    checkedBy?: string | null;
}

export interface QualityLot {
    id: string;
    lotNumber: string;
    expirationDate: string | null;
    productionDate: string | null;
    qualityStatus: BatchQualityStatus;
    inspectionStatus: BatchInspectionStatus;
    qualityChecks: BatchQualityCheckItem[] | null;
    qualityTestedAt: string | null;
    qualityTestedBy: string | null;
    qualityNotes: string | null;
    totalQtyPrincipal: number;
    createdAt: string;
    item: {
        id: string;
        codigoInterno: string;
        descripcion: string;
        unidadPrincipal: string;
        categoryId?: string | null;
        category?: {
            id: string;
            nombre: string;
            depositoId: string;
            depositoNombre: string | null;
        } | null;
    } | null;
    supplier: { id: string; name: string } | null;
    locations: Array<{ depositoId: string; deposito: string | null; posicion: string | null; qtyPrincipal: number }>;
}

export interface QualityLotsPage {
    data: QualityLot[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    summary: { quarantine: number; released: number; rejected?: number; total: number };
    inspectionSummary?: {
        sinTestear: number;
        enProceso: number;
        aprobado: number;
        observado: number;
        rechazado: number;
        ignorado: number;
        total: number;
    };
}

export interface LocalizedQualityFilters {
    categories: Array<{
        id: string;
        nombre: string;
        depositoId: string;
        depositoNombre: string | null;
        lotsCount: number;
        untestedCount: number;
    }>;
    suppliers: Array<{
        id: string;
        name: string;
        lotsCount: number;
        untestedCount: number;
    }>;
    items: Array<{
        id: string;
        codigoInterno: string;
        descripcion: string;
        unidadPrincipal: string;
        lotsCount: number;
        untestedCount: number;
    }>;
}

export interface QualityTestTemplate {
    id: string;
    categoryId: string;
    categoryNombre: string | null;
    depositoNombre: string | null;
    nombre: string;
    descripcion: string | null;
    orden: number;
    activo: boolean;
}

export const qualityLotsApi = api.injectEndpoints({
    endpoints: (builder) => ({
        getQualityLots: builder.query<
            QualityLotsPage,
            {
                page: number;
                pageSize: number;
                status?: string;
                inspectionStatus?: string;
                q?: string;
                depositoId?: string;
                categoryId?: string;
                supplierId?: string;
                itemId?: string;
            }
        >({
            query: ({ page, pageSize, status, inspectionStatus, q, depositoId, categoryId, supplierId, itemId }) => {
                const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
                if (status) params.set('status', status);
                if (inspectionStatus) params.set('inspectionStatus', inspectionStatus);
                if (q) params.set('q', q);
                if (depositoId) params.set('depositoId', depositoId);
                if (categoryId) params.set('categoryId', categoryId);
                if (supplierId) params.set('supplierId', supplierId);
                if (itemId) params.set('itemId', itemId);
                return `quality/lots?${params}`;
            },
            providesTags: ['Stock'],
        }),
        getLocalizedQualityFilters: builder.query<
            LocalizedQualityFilters,
            { categoryId?: string; supplierId?: string; depositoId?: string } | void
        >({
            query: (arg) => {
                const params = new URLSearchParams();
                if (arg?.categoryId) params.set('categoryId', arg.categoryId);
                if (arg?.supplierId) params.set('supplierId', arg.supplierId);
                if (arg?.depositoId) params.set('depositoId', arg.depositoId);
                const qs = params.toString();
                return qs ? `quality/lots/localized/filters?${qs}` : 'quality/lots/localized/filters';
            },
            providesTags: ['Stock'],
        }),
        inspectQualityLot: builder.mutation<
            QualityLot,
            {
                id: string;
                inspectionStatus: BatchInspectionStatus;
                checks?: BatchQualityCheckItem[];
                notes?: string | null;
                blockStock?: boolean;
            }
        >({
            query: ({ id, ...body }) => ({
                url: `quality/lots/${id}/inspect`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['Stock', 'Dashboard'],
        }),
        releaseQualityLot: builder.mutation<QualityLot, { id: string; notes?: string }>({
            query: ({ id, notes }) => ({ url: `quality/lots/${id}/release`, method: 'PATCH', body: { notes } }),
            invalidatesTags: ['Stock', 'Dashboard'],
        }),
        getQualityConfig: builder.query<{ quarantineEnabled: boolean }, void>({
            query: () => 'quality/lots/config',
            providesTags: ['Stock'],
        }),
        toggleQualityConfig: builder.mutation<{ quarantineEnabled: boolean }, { enabled: boolean }>({
            query: (body) => ({
                url: 'quality/lots/config',
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['Stock', 'Dashboard'],
        }),
        releaseAllQualityLots: builder.mutation<{ releasedCount: number }, void>({
            query: () => ({
                url: 'quality/lots/release-all',
                method: 'POST',
            }),
            invalidatesTags: ['Stock', 'Dashboard'],
        }),
        getQualityTemplates: builder.query<QualityTestTemplate[], { categoryId?: string } | void>({
            query: (arg) => (arg?.categoryId ? `quality/lots/templates?categoryId=${arg.categoryId}` : 'quality/lots/templates'),
            providesTags: ['Stock'],
        }),
        createQualityTemplate: builder.mutation<
            QualityTestTemplate,
            { categoryId: string; nombre: string; descripcion?: string | null }
        >({
            query: (body) => ({
                url: 'quality/lots/templates',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['Stock'],
        }),
        updateQualityTemplate: builder.mutation<
            QualityTestTemplate,
            { id: string; nombre?: string; descripcion?: string | null; orden?: number; activo?: boolean }
        >({
            query: ({ id, ...body }) => ({
                url: `quality/lots/templates/${id}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['Stock'],
        }),
        deleteQualityTemplate: builder.mutation<{ deleted: boolean; id: string }, string>({
            query: (id) => ({
                url: `quality/lots/templates/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Stock'],
        }),
    }),
});

export const {
    useGetQualityLotsQuery,
    useGetLocalizedQualityFiltersQuery,
    useInspectQualityLotMutation,
    useReleaseQualityLotMutation,
    useGetQualityConfigQuery,
    useToggleQualityConfigMutation,
    useReleaseAllQualityLotsMutation,
    useGetQualityTemplatesQuery,
    useCreateQualityTemplateMutation,
    useUpdateQualityTemplateMutation,
    useDeleteQualityTemplateMutation,
} = qualityLotsApi;
