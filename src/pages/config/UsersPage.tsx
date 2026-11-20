import { useState, useMemo } from 'react';
import {
    useGetUsersQuery,
    useCreateUserMutation,
    useUpdateUserMutation,
    type User,
} from '../../entities/auth/api/authApi';
import { useGetDepotsQuery } from '../../features/warehouse/deposito/api/deposito.api';
import {
    PageHeader,
    Card,
    Btn,
    Modal,
    Input,
    Select,
    Badge,
    EditableCell,
    ResponsiveTable,
    useIsMobile,
} from '../../shared/ui';
import { ALL_SECTORS } from '../../shared/types/roles';

type RoleFilter = 'ALL' | 'ADMIN' | 'SUPERVISOR' | 'OPERARIO' | 'INACTIVE';

const ROLE_META: Record<string, { label: string; icon: string; color: string }> = {
    ADMIN: { label: 'ADMIN', icon: '👑', color: '#6366f1' },
    SUPERVISOR: { label: 'SUPERVISOR', icon: '🛡️', color: '#3b82f6' },
    OPERARIO: { label: 'OPERARIO', icon: '👷', color: '#10b981' },
};

export default function UsersPage() {
    const isMobile = useIsMobile();
    const { data: users = [], isLoading: loadingUsers } = useGetUsersQuery();
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => rawDepots.filter((d: any) => d.activo !== false), [rawDepots]);

    const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
    const [updateUser] = useUpdateUserMutation();

    // Filtros de la barra única
    const [quickSearch, setQuickSearch] = useState('');
    const [sectorFilter, setSectorFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

    // Feedback sutil en pantalla (reemplaza alerts molestos)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
    const notify = (type: 'ok' | 'err', msg: string) => {
        setFeedback({ type, msg });
        setTimeout(() => {
            setFeedback((prev) => (prev?.msg === msg ? null : prev));
        }, 4000);
    };

    // Modal Nuevo Usuario
    const [showNewUserModal, setShowNewUserModal] = useState(false);
    const [createError, setCreateError] = useState('');
    const [newUserForm, setNewUserForm] = useState({
        username: '',
        password: '',
        role: 'SUPERVISOR',
        sectors: ['DEPOSITO'] as string[],
        allowedDepotIds: [] as string[],
    });

    // Modales de edición puntual
    const [editingDepotsFor, setEditingDepotsFor] = useState<{ user: User; depotIds: string[] } | null>(null);
    const [editingSectorsFor, setEditingSectorsFor] = useState<{ user: User; sectors: string[] } | null>(null);
    const [editingPasswordFor, setEditingPasswordFor] = useState<User | null>(null);
    const [newPasswordVal, setNewPasswordVal] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [savingModal, setSavingModal] = useState(false);

    const getUserSectors = (u: User): string[] => {
        if (u.sectors && Array.isArray(u.sectors) && u.sectors.length > 0) {
            return u.sectors.map((s) => s.toUpperCase());
        }
        if (u.sector) {
            return u.sector
                .split(/[,;|]/)
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
        }
        return [];
    };

    // Contadores para las píldoras de filtro
    const counts = useMemo(() => {
        let admin = 0;
        let supervisor = 0;
        let operario = 0;
        let inactive = 0;

        users.forEach((u) => {
            if (u.isActive === false) inactive++;
            const r = (u.role || '').toUpperCase();
            if (r === 'ADMIN') admin++;
            else if (r === 'SUPERVISOR') supervisor++;
            else if (r === 'OPERARIO') operario++;
        });

        return {
            all: users.length,
            admin,
            supervisor,
            operario,
            inactive,
        };
    }, [users]);

    // Lista filtrada
    const filteredUsers = useMemo(() => {
        const q = quickSearch.trim().toLowerCase();

        return users.filter((u) => {
            const uRole = (u.role || '').toUpperCase();
            const uSectors = getUserSectors(u);
            const isActive = u.isActive !== false;

            if (roleFilter === 'INACTIVE' && isActive) return false;
            if (roleFilter === 'ADMIN' && uRole !== 'ADMIN') return false;
            if (roleFilter === 'SUPERVISOR' && uRole !== 'SUPERVISOR') return false;
            if (roleFilter === 'OPERARIO' && uRole !== 'OPERARIO') return false;

            if (sectorFilter) {
                if (uRole !== 'ADMIN' && !uSectors.includes(sectorFilter)) {
                    return false;
                }
            }

            if (q) {
                const depotNames = (u.allowedDepotIds || [])
                    .map((id) => depots.find((d: any) => d.id === id)?.nombre || '')
                    .join(' ')
                    .toLowerCase();
                const sectorLabels = uSectors
                    .map((sec) => ALL_SECTORS.find((s) => s.key === sec)?.label || sec)
                    .join(' ')
                    .toLowerCase();

                const matchUser = u.username.toLowerCase().includes(q);
                const matchRole = uRole.toLowerCase().includes(q);
                const matchSector = sectorLabels.includes(q);
                const matchDepot = depotNames.includes(q);

                if (!matchUser && !matchRole && !matchSector && !matchDepot) return false;
            }

            return true;
        });
    }, [users, quickSearch, sectorFilter, roleFilter, depots]);

    const handleCreateSubmit = async () => {
        if (!newUserForm.username.trim() || !newUserForm.password.trim()) {
            setCreateError('Completá el nombre de usuario y la contraseña inicial.');
            return;
        }
        setCreateError('');
        try {
            await createUser({
                username: newUserForm.username.trim(),
                password: newUserForm.password,
                role: newUserForm.role,
                sectors: newUserForm.role === 'ADMIN' ? [] : newUserForm.sectors,
                allowedDepotIds: newUserForm.role === 'ADMIN' ? [] : newUserForm.allowedDepotIds,
            }).unwrap();
            setShowNewUserModal(false);
            setNewUserForm({
                username: '',
                password: '',
                role: 'SUPERVISOR',
                sectors: ['DEPOSITO'],
                allowedDepotIds: [],
            });
            notify('ok', '✅ Usuario creado correctamente.');
        } catch (e: any) {
            setCreateError(e?.data?.message || 'Error al crear usuario');
        }
    };

    const handleUpdateRole = async (user: User, newRole: string) => {
        try {
            await updateUser({ id: user.id, data: { role: newRole } }).unwrap();
            notify('ok', `Rol de ${user.username} actualizado a ${newRole}.`);
        } catch (e: any) {
            notify('err', e?.data?.message || 'Error al actualizar rol');
        }
    };

    const handleToggleActive = async (user: User) => {
        try {
            const nextState = user.isActive === false;
            await updateUser({ id: user.id, data: { isActive: nextState } }).unwrap();
            notify('ok', `Usuario ${user.username} ${nextState ? 'activado' : 'desactivado'}.`);
        } catch (e: any) {
            notify('err', e?.data?.message || 'Error al cambiar estado');
        }
    };

    const handleUpdateDepots = async (userId: string, depotIds: string[]) => {
        setSavingModal(true);
        try {
            await updateUser({ id: userId, data: { allowedDepotIds: depotIds } }).unwrap();
            setEditingDepotsFor(null);
            notify('ok', '✅ Depósitos permitidos actualizados.');
        } catch (e: any) {
            notify('err', e?.data?.message || 'Error al actualizar depósitos');
        } finally {
            setSavingModal(false);
        }
    };

    const handleUpdateSectors = async (userId: string, sectors: string[]) => {
        setSavingModal(true);
        try {
            await updateUser({ id: userId, data: { sectors } }).unwrap();
            setEditingSectorsFor(null);
            notify('ok', '✅ Sectores permitidos actualizados.');
        } catch (e: any) {
            notify('err', e?.data?.message || 'Error al actualizar sectores');
        } finally {
            setSavingModal(false);
        }
    };

    const handleSavePassword = async () => {
        if (!editingPasswordFor) return;
        if (!newPasswordVal.trim()) {
            setPasswordError('Ingresá una nueva contraseña.');
            return;
        }
        setPasswordError('');
        setSavingModal(true);
        try {
            await updateUser({ id: editingPasswordFor.id, data: { password: newPasswordVal } }).unwrap();
            notify('ok', `🔑 Contraseña de ${editingPasswordFor.username} actualizada.`);
            setEditingPasswordFor(null);
            setNewPasswordVal('');
        } catch (e: any) {
            setPasswordError(e?.data?.message || 'Error al cambiar contraseña');
        } finally {
            setSavingModal(false);
        }
    };

    const desktopCols = [
        'Usuario',
        'Rol / Jerarquía',
        'Sectores Permitidos',
        'Depósitos Habilitados',
        'Estado',
        'Acciones',
    ];

    const renderDesktopRow = (u: User) => {
        const uSectors = getUserSectors(u);
        const uRole = (u.role || 'OPERARIO').toUpperCase();
        const roleMeta = ROLE_META[uRole] || { label: uRole, icon: '👤', color: '#9ca3af' };
        const isActive = u.isActive !== false;

        return [
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: isActive ? 1 : 0.55 }}>
                <div
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: `${roleMeta.color}1f`,
                        border: `1px solid ${roleMeta.color}4d`,
                        color: roleMeta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                        flexShrink: 0,
                        textTransform: 'uppercase',
                    }}
                >
                    {u.username.slice(0, 2)}
                </div>
                <div>
                    <div style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '13px' }}>
                        <EditableCell
                            value={u.username}
                            onSave={async (v) => {
                                if (!v.trim()) return;
                                await updateUser({ id: u.id, data: { username: v.trim() } }).unwrap();
                                notify('ok', 'Nombre de usuario actualizado.');
                            }}
                        />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-subtle, #6b7280)' }}>
                        Clic en el nombre para renombrar
                    </div>
                </div>
            </div>,

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>{roleMeta.icon}</span>
                <select
                    value={uRole}
                    onChange={(e) => handleUpdateRole(u, e.target.value)}
                    style={{
                        background: 'var(--bg-primary, #0f1117)',
                        border: `1px solid ${roleMeta.color}55`,
                        color: roleMeta.color,
                        borderRadius: '8px',
                        padding: '5px 10px',
                        fontSize: '12px',
                        outline: 'none',
                        fontWeight: 800,
                        cursor: 'pointer',
                    }}
                >
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPERVISOR">SUPERVISOR</option>
                    <option value="OPERARIO">OPERARIO</option>
                </select>
            </div>,

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxWidth: '330px', alignItems: 'center' }}>
                {uRole === 'ADMIN' ? (
                    <Badge color="#6366f1">🌟 Acceso total a todos los sectores</Badge>
                ) : (
                    <>
                        {uSectors.map((sec) => {
                            const found = ALL_SECTORS.find((s) => s.key === sec);
                            return (
                                <Badge key={sec} color="#3b82f6">
                                    {found ? `${found.icon} ${found.label}` : sec}
                                </Badge>
                            );
                        })}
                        {uSectors.length === 0 && (
                            <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                                ⚠️ Sin sectores asignados
                            </span>
                        )}
                        <button
                            type="button"
                            className="inline-chip-btn"
                            onClick={() => setEditingSectorsFor({ user: u, sectors: [...uSectors] })}
                        >
                            {uSectors.length > 0 ? '✏️ Editar' : '+ Asignar'}
                        </button>
                    </>
                )}
            </div>,

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxWidth: '290px', alignItems: 'center' }}>
                {uRole === 'ADMIN' ? (
                    <Badge color="#6366f1">🏢 Todos los depósitos</Badge>
                ) : (
                    <>
                        {u.allowedDepotIds?.map((id) => {
                            const d = depots.find((depo: any) => depo.id === id);
                            return (
                                <Badge key={id} color="#a5b4fc">
                                    🏢 {d?.nombre || id}
                                </Badge>
                            );
                        })}
                        {(!u.allowedDepotIds || u.allowedDepotIds.length === 0) && (
                            <Badge color="#10b981">🏢 Todos (Sin restricción)</Badge>
                        )}
                        <button
                            type="button"
                            className="inline-chip-btn"
                            onClick={() =>
                                setEditingDepotsFor({
                                    user: u,
                                    depotIds: [...(u.allowedDepotIds || [])],
                                })
                            }
                        >
                            {u.allowedDepotIds && u.allowedDepotIds.length > 0 ? '✏️ Editar' : 'Restringir'}
                        </button>
                    </>
                )}
            </div>,

            <button
                type="button"
                onClick={() => handleToggleActive(u)}
                title="Clic para activar o desactivar el acceso de este usuario"
                style={{
                    background: isActive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                    color: isActive ? '#10b981' : '#ef4444',
                    borderRadius: '99px',
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                }}
            >
                <span
                    style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: isActive ? '#10b981' : '#ef4444',
                    }}
                />
                {isActive ? 'ACTIVO' : 'INACTIVO'}
            </button>,

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <Btn
                    small
                    variant="secondary"
                    onClick={() => {
                        setPasswordError('');
                        setNewPasswordVal('');
                        setEditingPasswordFor(u);
                    }}
                    title="Cambiar contraseña del usuario"
                >
                    🔑 Clave
                </Btn>
                <Btn
                    small
                    variant={isActive ? 'danger' : 'secondary'}
                    onClick={() => handleToggleActive(u)}
                >
                    {isActive ? 'Desactivar' : 'Activar'}
                </Btn>
            </div>,
        ];
    };

    const renderMobileCard = (u: User) => {
        const uSectors = getUserSectors(u);
        const uRole = (u.role || 'OPERARIO').toUpperCase();
        const roleMeta = ROLE_META[uRole] || { label: uRole, icon: '👤', color: '#9ca3af' };
        const isActive = u.isActive !== false;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: isActive ? 1 : 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '8px',
                                background: `${roleMeta.color}1f`,
                                border: `1px solid ${roleMeta.color}4d`,
                                color: roleMeta.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '12px',
                                textTransform: 'uppercase',
                            }}
                        >
                            {u.username.slice(0, 2)}
                        </div>
                        <span style={{ fontWeight: 800, color: '#a5b4fc', fontSize: '15px' }}>{u.username}</span>
                    </div>
                    <Badge color={isActive ? '#10b981' : '#ef4444'}>{isActive ? 'ACTIVO' : 'INACTIVO'}</Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>Rol:</span>
                    <select
                        value={uRole}
                        onChange={(e) => handleUpdateRole(u, e.target.value)}
                        style={{
                            background: 'var(--bg-primary, #0f1117)',
                            border: `1px solid ${roleMeta.color}55`,
                            color: roleMeta.color,
                            borderRadius: '8px',
                            padding: '5px 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                        }}
                    >
                        <option value="ADMIN">👑 ADMIN</option>
                        <option value="SUPERVISOR">🛡️ SUPERVISOR</option>
                        <option value="OPERARIO">👷 OPERARIO</option>
                    </select>
                </div>

                {uRole !== 'ADMIN' && (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginRight: '4px' }}>
                                Sectores:
                            </span>
                            {uSectors.map((sec) => {
                                const found = ALL_SECTORS.find((s) => s.key === sec);
                                return (
                                    <Badge key={sec} color="#3b82f6">
                                        {found ? `${found.icon} ${found.label}` : sec}
                                    </Badge>
                                );
                            })}
                            {uSectors.length === 0 && (
                                <span style={{ color: '#f59e0b', fontSize: '11px' }}>Ninguno</span>
                            )}
                            <button
                                type="button"
                                className="inline-chip-btn"
                                onClick={() => setEditingSectorsFor({ user: u, sectors: [...uSectors] })}
                            >
                                ✏️ Sectores
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginRight: '4px' }}>
                                Depósitos:
                            </span>
                            {u.allowedDepotIds && u.allowedDepotIds.length > 0 ? (
                                u.allowedDepotIds.map((id) => {
                                    const d = depots.find((depo: any) => depo.id === id);
                                    return (
                                        <Badge key={id} color="#a5b4fc">
                                            {d?.nombre || id}
                                        </Badge>
                                    );
                                })
                            ) : (
                                <Badge color="#10b981">Todos</Badge>
                            )}
                            <button
                                type="button"
                                className="inline-chip-btn"
                                onClick={() =>
                                    setEditingDepotsFor({
                                        user: u,
                                        depotIds: [...(u.allowedDepotIds || [])],
                                    })
                                }
                            >
                                ✏️ Depósitos
                            </button>
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', gap: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle, #1e2133)' }}>
                    <Btn
                        small
                        variant="secondary"
                        style={{ flex: 1 }}
                        onClick={() => {
                            setPasswordError('');
                            setNewPasswordVal('');
                            setEditingPasswordFor(u);
                        }}
                    >
                        🔑 Cambiar Clave
                    </Btn>
                    <Btn
                        small
                        variant={isActive ? 'danger' : 'secondary'}
                        style={{ flex: 1 }}
                        onClick={() => handleToggleActive(u)}
                    >
                        {isActive ? 'Desactivar' : 'Activar'}
                    </Btn>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1440px', margin: '0 auto' }}>
            <style>{`
                .period-pill {
                    background: transparent;
                    border: 1px solid var(--border-strong, #374151);
                    color: var(--text-muted, #9ca3af);
                    padding: 7px 12px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                    white-space: nowrap;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .period-pill:hover {
                    border-color: #6366f1;
                    color: var(--text-primary, #f3f4f6);
                }
                .period-pill.active {
                    background: rgba(99, 102, 241, 0.18);
                    border-color: #6366f1;
                    color: #a5b4fc;
                }
                .inline-chip-btn {
                    background: rgba(99, 102, 241, 0.1);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    color: #a5b4fc;
                    border-radius: 99px;
                    padding: 2px 9px;
                    font-size: 11px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .inline-chip-btn:hover {
                    background: rgba(99, 102, 241, 0.22);
                    border-color: #6366f1;
                }
            `}</style>

            <PageHeader
                title="Administración de Usuarios y Sesiones"
                subtitle="Configurá cuentas, roles, permisos por sector, depósitos habilitados y contraseñas"
            >
                <Btn
                    onClick={() => {
                        setCreateError('');
                        setShowNewUserModal(true);
                    }}
                >
                    + Crear Nuevo Usuario
                </Btn>
            </PageHeader>

            {feedback && (
                <div
                    style={{
                        marginBottom: '14px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background:
                            feedback.type === 'ok'
                                ? 'rgba(16, 185, 129, 0.12)'
                                : 'rgba(239, 68, 68, 0.12)',
                        border: `1px solid ${
                            feedback.type === 'ok'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : 'rgba(239, 68, 68, 0.35)'
                        }`,
                        color: feedback.type === 'ok' ? '#10b981' : '#f87171',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <span>{feedback.msg}</span>
                    <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'inherit',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '0 4px',
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* ── BARRA ÚNICA DE FILTROS (1 SOLA FILA LIMPIA, MISMO DISEÑO QUE AUDITORÍA DE STOCK) ── */}
            <Card style={{ padding: '14px 16px', marginBottom: '18px' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.9fr auto',
                        gap: '12px',
                        alignItems: 'flex-end',
                    }}
                >
                    <Input
                        label="🔍 Buscar por usuario, rol, sector o depósito"
                        placeholder="Ej: juan, supervisor, depósito..."
                        value={quickSearch}
                        onChange={setQuickSearch}
                    />

                    <Select
                        label="🏭 Filtrar por Sector"
                        value={sectorFilter}
                        onChange={setSectorFilter}
                        options={[
                            { value: '', label: 'Todos los sectores' },
                            ...ALL_SECTORS.map((s) => ({
                                value: s.key,
                                label: `${s.icon} ${s.label}`,
                            })),
                        ]}
                    />

                    <div>
                        <label
                            style={{
                                display: 'block',
                                color: 'var(--text-muted, #9ca3af)',
                                fontSize: '12px',
                                marginBottom: '4px',
                            }}
                        >
                            🛡️ Rol / Estado
                        </label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(
                                [
                                    { id: 'ALL', label: `Todos (${counts.all})` },
                                    { id: 'ADMIN', label: `👑 Admin (${counts.admin})` },
                                    { id: 'SUPERVISOR', label: `🛡️ Supervisor (${counts.supervisor})` },
                                    { id: 'OPERARIO', label: `👷 Operario (${counts.operario})` },
                                    ...(counts.inactive > 0
                                        ? [{ id: 'INACTIVE', label: `🚫 Inactivos (${counts.inactive})` }]
                                        : []),
                                ] as { id: RoleFilter; label: string }[]
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`period-pill ${roleFilter === tab.id ? 'active' : ''}`}
                                    onClick={() => setRoleFilter(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            {/* ── TABLA PRINCIPAL RESPONSIVA ── */}
            <Card style={{ padding: isMobile ? '12px' : 0, overflow: 'hidden' }}>
                <ResponsiveTable
                    loading={loadingUsers}
                    data={filteredUsers}
                    desktopCols={desktopCols}
                    renderDesktopRow={renderDesktopRow}
                    renderMobileCard={renderMobileCard}
                />
            </Card>

            {/* ── MODAL CREAR NUEVO USUARIO ── */}
            {showNewUserModal && (
                <Modal title="Nuevo Usuario" onClose={() => setShowNewUserModal(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                            <Input
                                label="👤 Nombre de Usuario"
                                placeholder="Ej: jperez"
                                value={newUserForm.username}
                                onChange={(v) => setNewUserForm((p) => ({ ...p, username: v }))}
                            />
                            <Input
                                label="🔑 Contraseña Inicial"
                                type="password"
                                placeholder="Contraseña..."
                                value={newUserForm.password}
                                onChange={(v) => setNewUserForm((p) => ({ ...p, password: v }))}
                            />
                        </div>

                        <Select
                            label="🛡️ Rol / Jerarquía"
                            value={newUserForm.role}
                            onChange={(val) => setNewUserForm((p) => ({ ...p, role: val }))}
                            options={[
                                { value: 'SUPERVISOR', label: '🛡️ SUPERVISOR (Gestión operativa de sus sectores)' },
                                { value: 'OPERARIO', label: '👷 OPERARIO (Carga y consulta en sus sectores)' },
                                { value: 'ADMIN', label: '👑 ADMIN (Acceso total a todo el sistema)' },
                            ]}
                        />

                        {newUserForm.role !== 'ADMIN' && (
                            <>
                                <div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '8px',
                                        }}
                                    >
                                        <label style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px', fontWeight: 600 }}>
                                            Sectores Permitidos ({newUserForm.sectors.length})
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="inline-chip-btn"
                                                onClick={() =>
                                                    setNewUserForm((p) => ({
                                                        ...p,
                                                        sectors: ALL_SECTORS.map((s) => s.key),
                                                    }))
                                                }
                                            >
                                                Marcar todos
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-chip-btn"
                                                onClick={() => setNewUserForm((p) => ({ ...p, sectors: [] }))}
                                            >
                                                Ninguno
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                                            gap: '8px',
                                            maxHeight: '190px',
                                            overflowY: 'auto',
                                        }}
                                    >
                                        {ALL_SECTORS.map((sec) => {
                                            const isChecked = newUserForm.sectors.includes(sec.key);
                                            return (
                                                <label
                                                    key={sec.key}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '8px 10px',
                                                        background: isChecked
                                                            ? 'rgba(99,102,241,0.16)'
                                                            : 'var(--bg-hover-row, rgba(255,255,255,0.03))',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        border: isChecked
                                                            ? '1px solid #6366f1'
                                                            : '1px solid var(--border-subtle, #1e2133)',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const next = e.target.checked
                                                                ? [...newUserForm.sectors, sec.key]
                                                                : newUserForm.sectors.filter((s) => s !== sec.key);
                                                            setNewUserForm((p) => ({ ...p, sectors: next }));
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #f3f4f6)' }}>
                                                        {sec.icon} {sec.label}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                {depots.length > 0 && (
                                    <div>
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '6px',
                                            }}
                                        >
                                            <label style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px', fontWeight: 600 }}>
                                                🏢 Depósitos Habilitados{' '}
                                                <span style={{ fontWeight: 400, color: 'var(--text-subtle, #6b7280)' }}>
                                                    (Vacío = Acceso a todos)
                                                </span>
                                            </label>
                                            {newUserForm.allowedDepotIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="inline-chip-btn"
                                                    onClick={() =>
                                                        setNewUserForm((p) => ({ ...p, allowedDepotIds: [] }))
                                                    }
                                                >
                                                    Liberar todos
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                                                gap: '8px',
                                                maxHeight: '140px',
                                                overflowY: 'auto',
                                            }}
                                        >
                                            {depots.map((d: any) => {
                                                const isChecked = newUserForm.allowedDepotIds.includes(d.id);
                                                return (
                                                    <label
                                                        key={d.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '8px 10px',
                                                            background: isChecked
                                                                ? 'rgba(99,102,241,0.16)'
                                                                : 'var(--bg-hover-row, rgba(255,255,255,0.03))',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            border: isChecked
                                                                ? '1px solid #6366f1'
                                                                : '1px solid var(--border-subtle, #1e2133)',
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                const next = e.target.checked
                                                                    ? [...newUserForm.allowedDepotIds, d.id]
                                                                    : newUserForm.allowedDepotIds.filter((id) => id !== d.id);
                                                                setNewUserForm((p) => ({ ...p, allowedDepotIds: next }));
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary, #f3f4f6)' }}>
                                                            {d.nombre}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {createError && (
                            <div
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                }}
                            >
                                {createError}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Btn variant="secondary" onClick={() => setShowNewUserModal(false)}>
                            Cancelar
                        </Btn>
                        <Btn onClick={handleCreateSubmit} disabled={isCreating}>
                            {isCreating ? 'Creando...' : 'Crear Usuario'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* ── MODAL EDITAR SECTORES ── */}
            {editingSectorsFor && (
                <Modal
                    title={`Sectores de ${editingSectorsFor.user.username}`}
                    onClose={() => setEditingSectorsFor(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '13px' }}>
                                Seleccioná los sectores habilitados para este usuario:
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="inline-chip-btn"
                                    onClick={() =>
                                        setEditingSectorsFor({
                                            ...editingSectorsFor,
                                            sectors: ALL_SECTORS.map((s) => s.key),
                                        })
                                    }
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    className="inline-chip-btn"
                                    onClick={() =>
                                        setEditingSectorsFor({
                                            ...editingSectorsFor,
                                            sectors: [],
                                        })
                                    }
                                >
                                    Ninguno
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
                            {ALL_SECTORS.map((sec) => {
                                const isChecked = editingSectorsFor.sectors.includes(sec.key);
                                return (
                                    <label
                                        key={sec.key}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '10px 12px',
                                            background: isChecked
                                                ? 'rgba(99,102,241,0.18)'
                                                : 'var(--bg-hover-row, rgba(255,255,255,0.03))',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            border: isChecked
                                                ? '1px solid #6366f1'
                                                : '1px solid var(--border-subtle, #1e2133)',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                                const current = editingSectorsFor.sectors;
                                                const next = e.target.checked
                                                    ? [...current, sec.key]
                                                    : current.filter((s) => s !== sec.key);
                                                setEditingSectorsFor({ ...editingSectorsFor, sectors: next });
                                            }}
                                        />
                                        <span style={{ color: 'var(--text-primary, #f3f4f6)', fontWeight: 600, fontSize: '13px' }}>
                                            {sec.icon} {sec.label}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Btn variant="secondary" onClick={() => setEditingSectorsFor(null)}>
                            Cancelar
                        </Btn>
                        <Btn
                            disabled={savingModal}
                            onClick={() => handleUpdateSectors(editingSectorsFor.user.id, editingSectorsFor.sectors)}
                        >
                            {savingModal ? 'Guardando...' : 'Guardar Sectores'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* ── MODAL EDITAR DEPÓSITOS ── */}
            {editingDepotsFor && (
                <Modal
                    title={`Depósitos para ${editingDepotsFor.user.username}`}
                    onClose={() => setEditingDepotsFor(null)}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            marginBottom: '20px',
                            maxHeight: '380px',
                            overflowY: 'auto',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '13px' }}>
                                Si no marcás ninguno, tendrá acceso a <strong>todos los depósitos</strong>.
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="inline-chip-btn"
                                    onClick={() =>
                                        setEditingDepotsFor({
                                            ...editingDepotsFor,
                                            depotIds: depots.map((d: any) => d.id),
                                        })
                                    }
                                >
                                    Todos
                                </button>
                                <button
                                    type="button"
                                    className="inline-chip-btn"
                                    onClick={() =>
                                        setEditingDepotsFor({
                                            ...editingDepotsFor,
                                            depotIds: [],
                                        })
                                    }
                                >
                                    Liberar
                                </button>
                            </div>
                        </div>

                        {depots.map((d: any) => {
                            const isChecked = editingDepotsFor.depotIds.includes(d.id);
                            return (
                                <label
                                    key={d.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        background: isChecked
                                            ? 'rgba(99,102,241,0.16)'
                                            : 'var(--bg-hover-row, rgba(255,255,255,0.03))',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        border: isChecked
                                            ? '1px solid #6366f1'
                                            : '1px solid var(--border-subtle, #1e2133)',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                            const current = editingDepotsFor.depotIds;
                                            const next = e.target.checked
                                                ? [...current, d.id]
                                                : current.filter((id) => id !== d.id);
                                            setEditingDepotsFor({ ...editingDepotsFor, depotIds: next });
                                        }}
                                    />
                                    <div>
                                        <div style={{ color: 'var(--text-primary, #f3f4f6)', fontWeight: 600, fontSize: '13px' }}>
                                            🏢 {d.nombre}
                                        </div>
                                        <div style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '11px' }}>
                                            {d.planta || 'Sin planta especificada'}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Btn variant="secondary" onClick={() => setEditingDepotsFor(null)}>
                            Cancelar
                        </Btn>
                        <Btn
                            disabled={savingModal}
                            onClick={() => handleUpdateDepots(editingDepotsFor.user.id, editingDepotsFor.depotIds)}
                        >
                            {savingModal ? 'Guardando...' : 'Guardar Cambios'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* ── MODAL CAMBIAR CONTRASEÑA ── */}
            {editingPasswordFor && (
                <Modal
                    title={`🔑 Cambiar clave de ${editingPasswordFor.username}`}
                    onClose={() => {
                        setEditingPasswordFor(null);
                        setNewPasswordVal('');
                        setPasswordError('');
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                        <Input
                            label="Nueva Contraseña"
                            type="password"
                            placeholder="Escribí la nueva contraseña..."
                            value={newPasswordVal}
                            onChange={setNewPasswordVal}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSavePassword();
                            }}
                        />
                        {passwordError && (
                            <div
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                }}
                            >
                                {passwordError}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Btn
                            variant="secondary"
                            onClick={() => {
                                setEditingPasswordFor(null);
                                setNewPasswordVal('');
                                setPasswordError('');
                            }}
                        >
                            Cancelar
                        </Btn>
                        <Btn disabled={savingModal} onClick={handleSavePassword}>
                            {savingModal ? 'Guardando...' : 'Guardar Contraseña'}
                        </Btn>
                    </div>
                </Modal>
            )}
        </div>
    );
}
