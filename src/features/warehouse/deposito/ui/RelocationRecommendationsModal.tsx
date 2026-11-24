import { useMemo, useState } from 'react';
import { Modal, Spinner } from '../../../../shared/ui';
import { useGetDepotsQuery } from '../api/deposito.api';
import { useGetStockQuery } from '../../stock/api/stock.api';
import { useGetBoxTypesQuery } from '../../materiales/api/box-types.api';
import { useGetPendingTasksQuery } from '../../tasks/api/tasks.api';
import {
    computePositionStats,
    buildPositionView,
    computeRelocationRecommendations,
} from '../lib/depotMetrics';
import RelocationTab from './RelocationTab';
import { inputStyle, labelStyle } from './common';

interface Props {
    initialDepotId?: string;
    onClose: () => void;
}

export default function RelocationRecommendationsModal({ initialDepotId = '', onClose }: Props) {
    const [depotId, setDepotId] = useState(initialDepotId);
    const { data: depots = [], isLoading: loadingDepots } = useGetDepotsQuery();
    const { data: stock = [], isLoading: loadingStock } = useGetStockQuery({});
    const { data: boxTypes = [] } = useGetBoxTypesQuery();
    const { data: pendingTasks = [], refetch: refetchPending } = useGetPendingTasksQuery(depotId || undefined);

    const activeDepots = useMemo(() => (Array.isArray(depots) ? depots.filter((d: any) => d.activo) : []), [depots]);
    const statsMap = useMemo(() => computePositionStats(stock, boxTypes), [stock, boxTypes]);

    const recommendations = useMemo(() => {
        const targetDepots = depotId ? activeDepots.filter((d: any) => d.id === depotId) : activeDepots;
        return targetDepots.flatMap((d: any) => {
            const views = (d.positions || []).map((p: any) => buildPositionView(p, statsMap));
            return computeRelocationRecommendations(d, views, pendingTasks);
        });
    }, [activeDepots, depotId, statsMap, pendingTasks]);

    return (
        <Modal title="🔄 Movimientos de Reubicación Recomendados" onClose={onClose} wide>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '78vh', overflowY: 'auto' }}>
                <div style={{ maxWidth: 280 }}>
                    <label style={labelStyle}>Filtrar por depósito</label>
                    <select value={depotId} onChange={e => setDepotId(e.target.value)} style={inputStyle}>
                        <option value="">Todos los depósitos activos</option>
                        {activeDepots.map((d: any) => (
                            <option key={d.id} value={d.id}>{d.nombre}{d.planta ? ` (${d.planta})` : ''}</option>
                        ))}
                    </select>
                </div>

                {loadingDepots || loadingStock ? (
                    <div style={{ textAlign: 'center', padding: 36 }}><Spinner /></div>
                ) : (
                    <RelocationTab
                        recommendations={recommendations}
                        onTaskCreated={() => refetchPending()}
                        compact
                    />
                )}
            </div>
        </Modal>
    );
}
