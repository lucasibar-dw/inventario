import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Modal, Btn, Input } from '../../../../shared/ui';
import { depotsApi, useUpdatePositionSilentMutation } from '../api/deposito.api';
import { PositionView, ZONAS_EDITABLES, runInChunks, volumeFromDims, fmt } from '../lib/depotMetrics';
import { inputStyle, labelStyle, SectionTitle } from './common';

interface Props {
    views: PositionView[];
    itemCategories: string[];
    onClose: () => void;
    onDone: () => void;
}

const KEEP = '__keep__';
const toNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

export default function BulkEditPositionsModal({ views, itemCategories, onClose, onDone }: Props) {
    const [updatePosition] = useUpdatePositionSilentMutation();
    const dispatch = useDispatch();

    const [estado, setEstado] = useState(KEEP);
    const [zona, setZona] = useState(KEEP);
    const [catP, setCatP] = useState(KEEP);
    const [catS, setCatS] = useState(KEEP);
    const [alto, setAlto] = useState('');
    const [ancho, setAncho] = useState('');
    const [prof, setProf] = useState('');
    const [m3, setM3] = useState('');
    const [maxKg, setMaxKg] = useState('');
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [errors, setErrors] = useState<string[]>([]);

    const dimsVol = volumeFromDims({ altoM: toNum(alto), anchoM: toNum(ancho), profundidadM: toNum(prof) });
    const withStock = views.filter(v => v.stats.lineas.length > 0 && v.pos.activo);
    const systemCount = views.filter(v => v.isSystem).length;

    const hasChanges = estado !== KEEP || zona !== KEEP || catP !== KEEP || catS !== KEEP ||
        dimsVol !== null || toNum(m3) !== null || toNum(maxKg) !== null;

    const handleApply = async () => {
        if (!hasChanges) return;
        if (estado === 'off' && withStock.length > 0 &&
            !window.confirm(`${withStock.length} de las posiciones seleccionadas tienen stock. ¿Desactivarlas igual?`)) return;

        setErrors([]);
        setProgress({ done: 0, total: views.length });
        const res = await runInChunks(views, async (v) => {
            const data: Record<string, any> = {};
            if (estado !== KEEP && !v.isSystem) data.activo = estado === 'on';
            if (zona !== KEEP) data.categoria = zona;
            if (catP !== KEEP) data.categoriaPrincipal = catP || null;
            if (catS !== KEEP) data.categoriaSecundaria = catS || null;
            const metaPatch: Record<string, any> = {};
            if (dimsVol !== null) {
                metaPatch.altoM = toNum(alto); metaPatch.anchoM = toNum(ancho); metaPatch.profundidadM = toNum(prof);
                data.metrosCubicos = dimsVol;
            } else if (toNum(m3) !== null) {
                data.metrosCubicos = toNum(m3);
            }
            if (toNum(maxKg) !== null) metaPatch.maxKg = toNum(maxKg);
            if (Object.keys(metaPatch).length) data.meta = { ...v.meta, ...metaPatch };
            if (Object.keys(data).length === 0) return;
            await updatePosition({ id: v.pos.id, data }).unwrap();
        }, 5, (done, total) => setProgress({ done, total }));

        setProgress(null);
        dispatch(depotsApi.util.invalidateTags([{ type: 'Depots', id: 'LIST' }]));
        if (res.errors.length) {
            setErrors(res.errors.map(e => `${e.item.pos.codigo}: ${e.error?.data?.message || 'error'}`));
        } else {
            onDone();
            onClose();
        }
    };

    const busy = progress !== null;
    const catSelect = (value: string, onChange: (v: string) => void) => (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
            <option value={KEEP}>— No cambiar —</option>
            <option value="">Libre (quitar restricción)</option>
            {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
    );

    return (
        <Modal title={`Edición masiva · ${views.length} posiciones`} onClose={busy ? () => { } : onClose} wide>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Solo se modifican los campos que cambies. Los que quedan en "No cambiar" o vacíos se respetan.
                    {systemCount > 0 && <> Las posiciones del sistema (ENTRADA) no se pueden desactivar.</>}
                </div>
                <div>
                    <SectionTitle>Estado y clasificación</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Estado</label>
                            <select value={estado} onChange={e => setEstado(e.target.value)} style={inputStyle}>
                                <option value={KEEP}>— No cambiar —</option>
                                <option value="on">Activar</option>
                                <option value="off">Desactivar</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Tipo / Zona</label>
                            <select value={zona} onChange={e => setZona(e.target.value)} style={inputStyle}>
                                <option value={KEEP}>— No cambiar —</option>
                                {ZONAS_EDITABLES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                            </select>
                        </div>
                        <div><label style={labelStyle}>Restricción principal</label>{catSelect(catP, setCatP)}</div>
                        <div><label style={labelStyle}>Restricción secundaria</label>{catSelect(catS, setCatS)}</div>
                    </div>
                </div>
                <div>
                    <SectionTitle>Medidas y capacidad</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                        <Input label="Alto (m)" type="number" value={alto} onChange={setAlto} />
                        <Input label="Ancho (m)" type="number" value={ancho} onChange={setAncho} />
                        <Input label="Profundidad (m)" type="number" value={prof} onChange={setProf} />
                        <Input label={dimsVol !== null ? 'm³ (calculado)' : 'm³'} type="number" value={dimsVol !== null ? String(dimsVol) : m3} onChange={setM3} disabled={dimsVol !== null} />
                        <Input label="Peso máx. (kg)" type="number" value={maxKg} onChange={setMaxKg} />
                    </div>
                    {dimsVol !== null && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            Capacidad total resultante: {fmt(dimsVol * views.length, 2)} m³
                        </div>
                    )}
                </div>

                {progress && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Actualizando {progress.done} / {progress.total}…</div>}
                {errors.length > 0 && (
                    <div style={{ color: '#f87171', fontSize: 12, maxHeight: 100, overflowY: 'auto' }}>{errors.map((e, i) => <div key={i}>✖ {e}</div>)}</div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-subtle, #1e2133)', paddingTop: 16 }}>
                    <Btn variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Btn>
                    <Btn onClick={handleApply} disabled={busy || !hasChanges}>{busy ? 'Aplicando…' : 'Aplicar cambios'}</Btn>
                </div>
            </div>
        </Modal>
    );
}
