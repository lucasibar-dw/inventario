import { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Modal, Btn, Input } from '../../../../shared/ui';
import { depotsApi, useCreatePositionSilentMutation } from '../api/deposito.api';
import { CodeSegment, ZONAS_EDITABLES, generateCodes, runInChunks, volumeFromDims } from '../lib/depotMetrics';
import { inputStyle, labelStyle, SectionTitle } from './common';

interface Props {
    depot: any;
    itemCategories: string[];
    existingCodes: Set<string>;
    onClose: () => void;
}

const SEG_LABELS = ['Nivel 1 (ej. pasillo / rack)', 'Nivel 2 (ej. columna)', 'Nivel 3 (ej. altura)'];

const defaultSegments: (CodeSegment & { enabled: boolean })[] = [
    { enabled: true, type: 'letter', from: 'A', to: 'C', pad: 0 },
    { enabled: true, type: 'num', from: '1', to: '10', pad: 2 },
    { enabled: false, type: 'num', from: '1', to: '4', pad: 0 },
];

const toNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

export default function BulkCreatePositionsModal({ depot, itemCategories, existingCodes, onClose }: Props) {
    const [createPosition] = useCreatePositionSilentMutation();
    const dispatch = useDispatch();
    const [mode, setMode] = useState<'single' | 'pattern' | 'list'>('single');

    const [single, setSingle] = useState('');
    const [prefix, setPrefix] = useState('');
    const [separator, setSeparator] = useState('-');
    const [segments, setSegments] = useState(defaultSegments);
    const [listText, setListText] = useState('');

    const [zona, setZona] = useState('STOCK');
    const [catP, setCatP] = useState('');
    const [catS, setCatS] = useState('');
    const [alto, setAlto] = useState('');
    const [ancho, setAncho] = useState('');
    const [prof, setProf] = useState('');
    const [m3, setM3] = useState('');
    const [maxKg, setMaxKg] = useState('');

    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);

    const codes = useMemo(() => {
        let list: string[] = [];
        if (mode === 'single') list = single.trim() ? [single.trim()] : [];
        else if (mode === 'pattern') list = generateCodes(prefix, segments.filter(s => s.enabled), separator);
        else list = listText.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
        // deduplicar manteniendo orden
        const seen = new Set<string>();
        return list.filter(c => { const k = c.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    }, [mode, single, prefix, segments, separator, listText]);

    const duplicated = codes.filter(c => existingCodes.has(c.toUpperCase()));
    const toCreate = codes.filter(c => !existingCodes.has(c.toUpperCase()));

    const dimsVol = volumeFromDims({ altoM: toNum(alto), anchoM: toNum(ancho), profundidadM: toNum(prof) });
    const finalM3 = dimsVol ?? toNum(m3);

    const updateSeg = (i: number, patch: Partial<CodeSegment & { enabled: boolean }>) =>
        setSegments(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

    const handleCreate = async () => {
        if (toCreate.length === 0) return;
        if (toCreate.length > 50 && !window.confirm(`Se van a crear ${toCreate.length} posiciones en ${depot.nombre}. ¿Confirmás?`)) return;
        setResult(null);
        setProgress({ done: 0, total: toCreate.length });
        const meta: Record<string, any> = {};
        if (toNum(alto) !== null) meta.altoM = toNum(alto);
        if (toNum(ancho) !== null) meta.anchoM = toNum(ancho);
        if (toNum(prof) !== null) meta.profundidadM = toNum(prof);
        if (toNum(maxKg) !== null) meta.maxKg = toNum(maxKg);

        const res = await runInChunks(
            toCreate,
            (codigo) => createPosition({
                depotId: depot.id,
                data: {
                    codigo,
                    categoria: zona,
                    categoriaPrincipal: catP || null,
                    categoriaSecundaria: catS || null,
                    metrosCubicos: finalM3 ?? undefined,
                    ...(Object.keys(meta).length ? { meta } : {}),
                } as any,
            }).unwrap(),
            5,
            (done, total) => setProgress({ done, total }),
        );
        setProgress(null);
        dispatch(depotsApi.util.invalidateTags([{ type: 'Depots', id: 'LIST' }]));
        setResult({ ok: res.ok, errors: res.errors.map(e => `${e.item}: ${e.error?.data?.message || 'error'}`) });
        if (res.errors.length === 0) setTimeout(onClose, 900);
    };

    const busy = progress !== null;

    return (
        <Modal title={`Agregar posiciones · ${depot.nombre}`} onClose={busy ? () => { } : onClose} wide>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {([['single', 'Una posición'], ['pattern', 'Generar por patrón'], ['list', 'Pegar lista']] as const).map(([id, label]) => (
                        <Btn key={id} small variant={mode === id ? 'primary' : 'secondary'} onClick={() => setMode(id)}>{label}</Btn>
                    ))}
                </div>

                {mode === 'single' && (
                    <Input label="Código de la posición" value={single} onChange={setSingle} placeholder="Ej: A-01-01" />
                )}

                {mode === 'pattern' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                            <Input label="Prefijo (opcional)" value={prefix} onChange={setPrefix} placeholder="Ej: R1" />
                            <Input label="Separador" value={separator} onChange={setSeparator} />
                        </div>
                        {segments.map((s, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1.6fr 1fr 1fr 1fr 0.8fr', gap: 8, alignItems: 'end', opacity: s.enabled ? 1 : 0.45 }}>
                                <input type="checkbox" checked={s.enabled} onChange={e => updateSeg(i, { enabled: e.target.checked })} style={{ marginBottom: 10 }} />
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingBottom: 9 }}>{SEG_LABELS[i]}</div>
                                <div>
                                    <label style={labelStyle}>Tipo</label>
                                    <select value={s.type} onChange={e => updateSeg(i, { type: e.target.value as any })} style={inputStyle} disabled={!s.enabled}>
                                        <option value="letter">Letras</option>
                                        <option value="num">Números</option>
                                        <option value="fixed">Texto fijo</option>
                                    </select>
                                </div>
                                <Input label={s.type === 'fixed' ? 'Texto' : 'Desde'} value={s.from} onChange={v => updateSeg(i, { from: v })} disabled={!s.enabled} />
                                {s.type !== 'fixed' ? <Input label="Hasta" value={s.to} onChange={v => updateSeg(i, { to: v })} disabled={!s.enabled} /> : <div />}
                                {s.type === 'num' ? <Input label="Dígitos" type="number" value={String(s.pad)} onChange={v => updateSeg(i, { pad: parseInt(v || '0', 10) || 0 })} disabled={!s.enabled} /> : <div />}
                            </div>
                        ))}
                    </div>
                )}

                {mode === 'list' && (
                    <div>
                        <label style={labelStyle}>Códigos (uno por línea, o separados por coma)</label>
                        <textarea value={listText} onChange={e => setListText(e.target.value)} rows={6} style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }} placeholder={'A-01\nA-02\nB-01'} />
                    </div>
                )}

                {/* Vista previa */}
                {mode !== 'single' && (
                    <div style={{ background: 'var(--bg-primary, #0f1117)', border: '1px solid var(--border-subtle, #1e2133)', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                            Se crearán <b style={{ color: '#10b981' }}>{toCreate.length}</b> posiciones
                            {duplicated.length > 0 && <> · <b style={{ color: '#f59e0b' }}>{duplicated.length}</b> ya existen y se omiten</>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 110, overflowY: 'auto' }}>
                            {codes.slice(0, 120).map(c => {
                                const dup = existingCodes.has(c.toUpperCase());
                                return (
                                    <span key={c} style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 6px', borderRadius: 4, background: dup ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.12)', color: dup ? '#f59e0b' : '#a5b4fc', textDecoration: dup ? 'line-through' : 'none' }}>{c}</span>
                                );
                            })}
                            {codes.length > 120 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>… y {codes.length - 120} más</span>}
                        </div>
                    </div>
                )}
                {mode === 'single' && duplicated.length > 0 && (
                    <div style={{ color: '#f59e0b', fontSize: 12 }}>Ya existe una posición con ese código en este depósito.</div>
                )}

                {/* Atributos comunes */}
                <div>
                    <SectionTitle>Atributos {mode !== 'single' && '(se aplican a todas)'}</SectionTitle>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                        <div>
                            <label style={labelStyle}>Tipo / Zona</label>
                            <select value={zona} onChange={e => setZona(e.target.value)} style={inputStyle}>
                                {ZONAS_EDITABLES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Restricción principal</label>
                            <select value={catP} onChange={e => setCatP(e.target.value)} style={inputStyle}>
                                <option value="">— Libre —</option>
                                {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Restricción secundaria</label>
                            <select value={catS} onChange={e => setCatS(e.target.value)} style={inputStyle}>
                                <option value="">— Libre —</option>
                                {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 12 }}>
                        <Input label="Alto (m)" type="number" value={alto} onChange={setAlto} />
                        <Input label="Ancho (m)" type="number" value={ancho} onChange={setAncho} />
                        <Input label="Profundidad (m)" type="number" value={prof} onChange={setProf} />
                        <Input label={dimsVol !== null ? 'm³ (calculado)' : 'm³'} type="number" value={dimsVol !== null ? String(dimsVol) : m3} onChange={setM3} disabled={dimsVol !== null} />
                        <Input label="Peso máx. (kg)" type="number" value={maxKg} onChange={setMaxKg} />
                    </div>
                </div>

                {progress && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Creando {progress.done} / {progress.total}…</div>
                        <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 6 }}>
                            <div style={{ width: `${(progress.done / progress.total) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 6 }} />
                        </div>
                    </div>
                )}
                {result && (
                    <div style={{ fontSize: 13 }}>
                        <div style={{ color: '#10b981' }}>✔ {result.ok} posiciones creadas.</div>
                        {result.errors.length > 0 && (
                            <div style={{ color: '#f87171', marginTop: 6, maxHeight: 100, overflowY: 'auto' }}>
                                {result.errors.map((e, i) => <div key={i}>✖ {e}</div>)}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-subtle, #1e2133)', paddingTop: 16 }}>
                    <Btn variant="secondary" onClick={onClose} disabled={busy}>Cerrar</Btn>
                    <Btn onClick={handleCreate} disabled={busy || toCreate.length === 0}>
                        {busy ? 'Creando…' : `Crear ${toCreate.length || ''} posición${toCreate.length === 1 ? '' : 'es'}`}
                    </Btn>
                </div>
            </div>
        </Modal>
    );
}
