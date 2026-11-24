import { useState, useMemo } from 'react';
import { Modal, Btn, Input } from '../../../../shared/ui';
import { useUpdatePositionMutation } from '../api/deposito.api';
import {
    PositionView, ZONAS_EDITABLES, STATUS_INFO, volumeFromDims, fmt, zonaLabel,
} from '../lib/depotMetrics';
import { OccBar, Pill, inputStyle, labelStyle, thStyle, tdStyle, SectionTitle } from './common';

interface Props {
    view: PositionView;
    itemCategories: string[];
    existingCodes: Set<string>;
    canEdit: boolean;
    onClose: () => void;
}

const toStr = (v: any) => (v === null || v === undefined ? '' : String(v));
const toNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

export default function PositionDetailModal({ view, itemCategories, existingCodes, canEdit, onClose }: Props) {
    const { pos, meta, stats } = view;
    const [updatePosition, { isLoading }] = useUpdatePositionMutation();
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        codigo: toStr(pos.codigo),
        categoria: toStr(pos.categoria || 'STOCK').toUpperCase(),
        categoriaPrincipal: toStr(pos.categoriaPrincipal),
        categoriaSecundaria: toStr(pos.categoriaSecundaria),
        altoM: toStr(meta.altoM),
        anchoM: toStr(meta.anchoM),
        profundidadM: toStr(meta.profundidadM),
        metrosCubicos: toStr(pos.metrosCubicos),
        maxKg: toStr(meta.maxKg),
        notas: toStr(meta.notas),
    });
    const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

    const dimsVolume = useMemo(() => volumeFromDims({
        altoM: toNum(form.altoM), anchoM: toNum(form.anchoM), profundidadM: toNum(form.profundidadM),
    }), [form.altoM, form.anchoM, form.profundidadM]);

    const lines = useMemo(() => [...stats.lineas].sort((a, b) => b.kilos - a.kilos), [stats.lineas]);

    const handleSave = async () => {
        setError(null);
        const codigo = form.codigo.trim();
        if (!codigo) { setError('El código no puede estar vacío.'); return; }
        if (codigo.toUpperCase() !== String(pos.codigo).toUpperCase() && existingCodes.has(codigo.toUpperCase())) {
            setError(`Ya existe una posición con el código "${codigo}" en este depósito.`);
            return;
        }
        const m3 = dimsVolume ?? toNum(form.metrosCubicos);
        try {
            await updatePosition({
                id: pos.id,
                data: {
                    codigo: view.isSystem ? pos.codigo : codigo,
                    categoria: form.categoria,
                    categoriaPrincipal: form.categoriaPrincipal || null,
                    categoriaSecundaria: form.categoriaSecundaria || null,
                    metrosCubicos: m3 as any,
                    meta: {
                        ...meta,
                        altoM: toNum(form.altoM),
                        anchoM: toNum(form.anchoM),
                        profundidadM: toNum(form.profundidadM),
                        maxKg: toNum(form.maxKg),
                        notas: form.notas.trim() || null,
                    },
                } as any,
            }).unwrap();
            onClose();
        } catch (e: any) {
            setError(e?.data?.message || 'No se pudo guardar la posición.');
        }
    };

    const handleToggle = async () => {
        if (pos.activo && stats.lineas.length > 0 &&
            !window.confirm(`La posición ${pos.codigo} tiene ${stats.lineas.length} línea(s) de stock (${fmt(stats.kilos)} kg). Si la desactivás el stock sigue existiendo pero la posición no estará disponible para operar. ¿Continuar?`)) return;
        try {
            await updatePosition({ id: pos.id, data: { activo: !pos.activo } }).unwrap();
            onClose();
        } catch (e: any) { setError(e?.data?.message || 'No se pudo cambiar el estado.'); }
    };

    const st = STATUS_INFO[view.status];

    return (
        <Modal title={`Posición ${pos.codigo}`} onClose={onClose} wide>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
                {/* Indicadores */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    <div><div style={labelStyle}>Estado</div><Pill color={st.color}>{st.label}</Pill>{view.isSystem && <span style={{ marginLeft: 6 }}><Pill color="#06b6d4">Sistema</Pill></span>}</div>
                    <div><div style={labelStyle}>Ocupación volumen</div><OccBar pct={view.ocupacionPct} /><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(stats.volumenM3, 3)} / {fmt(view.capacidadM3, 3)} m³</div></div>
                    <div><div style={labelStyle}>Ocupación peso</div><OccBar pct={view.pesoPct} /><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(stats.kilos)} / {meta.maxKg ? fmt(meta.maxKg) : '—'} kg</div></div>
                    <div><div style={labelStyle}>Contenido</div><div style={{ fontSize: 13 }}>{stats.materiales} material(es) · {stats.lotes} lote(s)</div></div>
                </div>
                {stats.volumenIncompleto && (
                    <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                        ⚠ Algún material de esta posición no tiene tipo de caja o kilos por caja configurado, por lo que su volumen no se cuenta en la ocupación.
                    </div>
                )}

                {/* Edición */}
                <div>
                    <SectionTitle>Datos de la posición</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <Input label="Código" value={form.codigo} onChange={set('codigo')} disabled={!canEdit || view.isSystem} />
                        <div>
                            <label style={labelStyle}>Tipo / Zona</label>
                            <select value={form.categoria} onChange={e => set('categoria')(e.target.value)} disabled={!canEdit} style={inputStyle}>
                                {!ZONAS_EDITABLES.some(z => z.value === form.categoria) && <option value={form.categoria}>{zonaLabel(form.categoria)}</option>}
                                {ZONAS_EDITABLES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Restricción material (principal)</label>
                            <select value={form.categoriaPrincipal} onChange={e => set('categoriaPrincipal')(e.target.value)} disabled={!canEdit} style={inputStyle}>
                                <option value="">— Libre —</option>
                                {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Restricción material (secundaria)</label>
                            <select value={form.categoriaSecundaria} onChange={e => set('categoriaSecundaria')(e.target.value)} disabled={!canEdit} style={inputStyle}>
                                <option value="">— Libre —</option>
                                {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div>
                    <SectionTitle>Medidas y capacidad</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', alignItems: 'end' }}>
                        <Input label="Alto (m)" type="number" value={form.altoM} onChange={set('altoM')} disabled={!canEdit} />
                        <Input label="Ancho (m)" type="number" value={form.anchoM} onChange={set('anchoM')} disabled={!canEdit} />
                        <Input label="Profundidad (m)" type="number" value={form.profundidadM} onChange={set('profundidadM')} disabled={!canEdit} />
                        <Input
                            label={dimsVolume !== null ? 'Volumen (calculado)' : 'Volumen (m³)'}
                            type="number"
                            value={dimsVolume !== null ? String(dimsVolume) : form.metrosCubicos}
                            onChange={set('metrosCubicos')}
                            disabled={!canEdit || dimsVolume !== null}
                        />
                        <Input label="Peso máximo (kg)" type="number" value={form.maxKg} onChange={set('maxKg')} disabled={!canEdit} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle, #6b7280)', marginTop: 6 }}>
                        Si cargás las 3 medidas el volumen se calcula solo. Si no, podés cargar los m³ directamente.
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <label style={labelStyle}>Notas</label>
                        <textarea value={form.notas} onChange={e => set('notas')(e.target.value)} disabled={!canEdit} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Ej: estantería frágil, solo cajas chicas, etc." />
                    </div>
                </div>

                {/* Contenido */}
                <div>
                    <SectionTitle>Stock en la posición ({lines.length})</SectionTitle>
                    {lines.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text-dimmed, #4b5563)', padding: 12 }}>La posición está vacía.</div>
                    ) : (
                        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0 }}>
                                    <tr>{['Material', 'Categoría', 'Lote', 'Kg', 'Unid.', 'm³'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {lines.map((l, i) => {
                                        const fueraDeRestriccion = (pos.categoriaPrincipal || pos.categoriaSecundaria) && l.categoria &&
                                            l.categoria !== pos.categoriaPrincipal && l.categoria !== pos.categoriaSecundaria;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle, #1e2133)' }}>
                                                <td style={tdStyle}><div style={{ fontWeight: 600 }}>{l.codigo}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.descripcion}</div></td>
                                                <td style={tdStyle}>{l.categoria || '—'}{fueraDeRestriccion && <span title="No coincide con la restricción de la posición" style={{ color: '#f59e0b', marginLeft: 4 }}>⚠</span>}</td>
                                                <td style={tdStyle}>{l.lote || '—'}</td>
                                                <td style={tdStyle}>{fmt(l.kilos)}</td>
                                                <td style={tdStyle}>{l.unidades === null ? '—' : fmt(l.unidades, 0)}</td>
                                                <td style={tdStyle}>{l.volumenConocido ? fmt(l.volumenM3, 3) : <span style={{ color: '#f59e0b' }} title="Sin tipo de caja o kilos por caja">?</span>}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border-subtle, #1e2133)', paddingTop: 16, flexWrap: 'wrap' }}>
                    <div>
                        {canEdit && !view.isSystem && (
                            <Btn variant={pos.activo ? 'danger' : 'secondary'} onClick={handleToggle} disabled={isLoading}>
                                {pos.activo ? 'Desactivar posición' : 'Reactivar posición'}
                            </Btn>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Btn variant="secondary" onClick={onClose}>{canEdit ? 'Cancelar' : 'Cerrar'}</Btn>
                        {canEdit && <Btn onClick={handleSave} disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar cambios'}</Btn>}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
