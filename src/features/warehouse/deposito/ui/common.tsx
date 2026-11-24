import React from 'react';
import { fmt, pctColor } from '../lib/depotMetrics';

export const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-primary, #0f1117)', border: '1px solid var(--border-color, #2a2d3e)',
    borderRadius: '8px', padding: '8px 10px', color: 'var(--text-primary, #f3f4f6)', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box',
};

export const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase',
    marginBottom: '4px', letterSpacing: '0.04em',
};

export const thStyle: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: 'var(--text-subtle, #6b7280)',
    textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-subtle, #1e2133)',
    whiteSpace: 'nowrap', background: 'var(--bg-secondary, #1a1d2e)',
};

export const tdStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary, #f3f4f6)' };

export function OccBar({ pct, height = 8, showLabel = true, width }: { pct: number | null; height?: number; showLabel?: boolean; width?: number | string }) {
    const color = pctColor(pct);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: width ?? '100%' }}>
            <div style={{ flex: 1, height, background: 'var(--border-subtle, #1e2133)', borderRadius: height, overflow: 'hidden', minWidth: 40 }}>
                <div style={{ width: `${Math.min(pct ?? 0, 100)}%`, height: '100%', background: color, borderRadius: height, transition: 'width .3s' }} />
            </div>
            {showLabel && (
                <span style={{ fontSize: '12px', fontWeight: 600, color, minWidth: 42, textAlign: 'right' }}>
                    {pct === null ? '—' : `${fmt(pct, 0)}%`}
                </span>
            )}
        </div>
    );
}

export function Kpi({ label, value, sub, color, onClick, active }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string; onClick?: () => void; active?: boolean }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: 'var(--bg-secondary, #1a1d2e)', border: `1px solid ${active ? '#6366f1' : 'var(--border-subtle, #1e2133)'}`,
                borderRadius: '12px', padding: '14px 16px', cursor: onClick ? 'pointer' : 'default', minWidth: 0,
                transition: 'border-color .15s',
            }}
        >
            <div style={{ fontSize: '10px', color: 'var(--text-subtle, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: color || 'var(--text-primary, #f3f4f6)', lineHeight: 1.1 }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginTop: '4px' }}>{sub}</div>}
        </div>
    );
}

export function Pill({ children, color, onClick, title }: { children: React.ReactNode; color: string; onClick?: (e: React.MouseEvent) => void; title?: string }) {
    return (
        <span
            onClick={onClick}
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, background: `${color}1f`, color, border: `1px solid ${color}55`,
                borderRadius: '99px', padding: '2px 10px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                cursor: onClick ? 'pointer' : 'default',
            }}
        >
            {children}
        </span>
    );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 10px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary, #f3f4f6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</h4>
            {right}
        </div>
    );
}

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-subtle, #1e2133)', marginBottom: '16px', overflowX: 'auto' }}>
            {tabs.map(t => (
                <button
                    key={t.id}
                    onClick={() => onChange(t.id)}
                    style={{
                        background: 'none', border: 'none', padding: '10px 14px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                        color: value === t.id ? '#6366f1' : 'var(--text-muted, #9ca3af)',
                        borderBottom: value === t.id ? '2px solid #6366f1' : '2px solid transparent',
                        cursor: 'pointer', outline: 'none',
                    }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}
