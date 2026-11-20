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
import {
    PersonAddOutlined,
    KeyOutlined,
    EditOutlined,
    CheckCircleOutline,
    BlockOutlined,
} from '@mui/icons-material';

type RoleFilter = 'ALL' | 'ADMIN' | 'SUPERVISOR' | 'OPERARIO' | 'INACTIVE';

const ROLE_META: Record<string, { label: string; color: string }> = {
    ADMIN: { label: 'Administrador', color: '#818cf8' },
    SUPERVISOR: { label: 'Supervisor', color: '#60a5fa' },
    OPERARIO: { label: 'Operario', color: '#34d399' },
};

export default function UsersPage() {
    const isMobile = useIsMobile();
    const { data: users = [], isLoading: loadingUsers } = useGetUsersQuery();
    const { data: rawDepots = [] } = useGetDepotsQuery();
    const depots = useMemo(() => rawDepots.filter((d: any) => d.activo !== false), [rawDepots]);

    const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
    const [updateUser] = useUpdateUserMutation();

    // Filtros
    const [quickSearch, setQuickSearch] = useState('');
    const [sectorFilter, setSectorFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

    // Notificación discreta en línea
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
    const notify = (type: 'ok' | 'err', msg: string) => {
        setFeedback({ type, msg });
        setTimeout(() => {
            setFeedback((prev) => (prev?.msg === msg ? null : prev));
        }, 3500);
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

    // Modales de edición
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
            notify('ok', 'Usuario creado correctamente.');
        } catch (e: any) {
            setCreateError(e?.data?.message || 'Error al crear usuario');
        }
    };

    const handleUpdateRole = async (user: User, newRole: string) => {
        try {
            await updateUser({ id: user.id, data: { role: newRole } }).unwrap();
            notify('ok', `Rol de ${user.username} actualizado.`);
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
            notify('ok', 'Depósitos actualizados.');
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
            notify('ok', 'Sectores actualizados.');
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
            notify('ok', `Contraseña de ${editingPasswordFor.username} actualizada.`);
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
        'Rol',
        'Sectores Permitidos',
        'Depósitos Permitidos',
        'Estado',
        '',
    ];

    const renderDesktopRow = (u: User) => {
        const uSectors = getUserSectors(u);
        const uRole = (u.role || 'OPERARIO').toUpperCase();
        const roleMeta = ROLE_META[uRole] || { label: uRole, color: '#9ca3af' };
        const isActive = u.isActive !== false;

        return [
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #f3f4f6)', opacity: isActive ? 1 : 0.5 }}>
                <EditableCell
                    value={u.username}
                    onSave={async (v) => {
                        if (!v.trim()) return;
                        await updateUser({ id: u.id, data: { username: v.trim() } }).unwrap();
                        notify('ok', 'Nombre de usuario actualizado.');
                    }}
                />
            </div>,

            <select
                value={uRole}
                onChange={(e) => handleUpdateRole(u, e.target.value)}
                style={{
                    background: 'var(--bg-primary, #0f1117)',
                    border: '1px solid var(--border-color, #2a2d3e)',
                    color: roleMeta.color,
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '12px',
                    outline: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="OPERARIO">OPERARIO</option>
            </select>,

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '340px', alignItems: 'center' }}>
                {uRole === 'ADMIN' ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', fontWeight: 500 }}>
                        Acceso total
                    </span>
                ) : (
                    <>
                        {uSectors.map((sec) => {
                            const found = ALL_SECTORS.find((s) => s.key === sec);
                            return (
                                <Badge key={sec} color="#94a3b8">
                                    {found ? found.label : sec}
                                </Badge>
                            );
                        })}
                        {uSectors.length === 0 && (
                            <span style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '12px' }}>
                                Sin sectores
                            </span>
                        )}
                        <button
                            type="button"
                            className="text-action-btn"
                            onClick={() => setEditingSectorsFor({ user: u, sectors: [...uSectors] })}
                        >
                            <EditOutlined sx={{ fontSize: 12 }} />
                            {uSectors.length > 0 ? 'Editar' : 'Asignar'}
                        </button>
                    </>
                )}
            </div>,

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '300px', alignItems: 'center' }}>
                {uRole === 'ADMIN' ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', fontWeight: 500 }}>
                        Todos
                    </span>
                ) : (
                    <>
                        {u.allowedDepotIds?.map((id) => {
                            const d = depots.find((depo: any) => depo.id === id);
                            return (
                                <Badge key={id} color="#94a3b8">
                                    {d?.nombre || id}
                                </Badge>
                            );
                        })}
                        {(!u.allowedDepotIds || u.allowedDepotIds.length === 0) && (
                            <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px' }}>
                                Todos
                            </span>
                        )}
                        <button
                            type="button"
                            className="text-action-btn"
                            onClick={() =>
                                setEditingDepotsFor({
                                    user: u,
                                    depotIds: [...(u.allowedDepotIds || [])],
                                })
                            }
                        >
                            <EditOutlined sx={{ fontSize: 12 }} />
                            Editar
                        </button>
                    </>
                )}
            </div>,

            <Badge color={isActive ? '#10b981' : '#ef4444'}>
                {isActive ? 'Activo' : 'Inactivo'}
            </Badge>,

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Btn
                    small
                    variant="secondary"
                    onClick={() => {
                        setPasswordError('');
                        setNewPasswordVal('');
                        setEditingPasswordFor(u);
                    }}
                >
                    <KeyOutlined sx={{ fontSize: 14 }} />
                    Contraseña
                </Btn>
                <Btn
                    small
                    variant="secondary"
                    onClick={() => handleToggleActive(u)}
                >
                    {isActive ? <BlockOutlined sx={{ fontSize: 14 }} /> : <CheckCircleOutline sx={{ fontSize: 14 }} />}
                    {isActive ? 'Desactivar' : 'Activar'}
                </Btn>
            </div>,
        ];
    };

    const renderMobileCard = (u: User) => {
        const uSectors = getUserSectors(u);
        const uRole = (u.role || 'OPERARIO').toUpperCase();
        const roleMeta = ROLE_META[uRole] || { label: uRole, color: '#9ca3af' };
        const isActive = u.isActive !== false;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: isActive ? 1 : 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary, #f3f4f6)', fontSize: '14px' }}>
                        {u.username}
                    </span>
                    <Badge color={isActive ? '#10b981' : '#ef4444'}>{isActive ? 'Activo' : 'Inactivo'}</Badge>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>Rol</span>
                    <select
                        value={uRole}
                        onChange={(e) => handleUpdateRole(u, e.target.value)}
                        style={{
                            background: 'var(--bg-primary, #0f1117)',
                            border: '1px solid var(--border-color, #2a2d3e)',
                            color: roleMeta.color,
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            fontWeight: 600,
                        }}
                    >
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="OPERARIO">OPERARIO</option>
                    </select>
                </div>

                {uRole !== 'ADMIN' && (
                    <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginRight: '4px' }}>
                                Sectores:
                            </span>
                            {uSectors.map((sec) => {
                                const found = ALL_SECTORS.find((s) => s.key === sec);
                                return (
                                    <Badge key={sec} color="#94a3b8">
                                        {found ? found.label : sec}
                                    </Badge>
                                );
                            })}
                            {uSectors.length === 0 && (
                                <span style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '12px' }}>Ninguno</span>
                            )}
                            <button
                                type="button"
                                className="text-action-btn"
                                onClick={() => setEditingSectorsFor({ user: u, sectors: [...uSectors] })}
                            >
                                <EditOutlined sx={{ fontSize: 12 }} />
                                Editar
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginRight: '4px' }}>
                                Depósitos:
                            </span>
                            {u.allowedDepotIds && u.allowedDepotIds.length > 0 ? (
                                u.allowedDepotIds.map((id) => {
                                    const d = depots.find((depo: any) => depo.id === id);
                                    return (
                                        <Badge key={id} color="#94a3b8">
                                            {d?.nombre || id}
                                        </Badge>
                                    );
                                })
                            ) : (
                                <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px' }}>Todos</span>
                            )}
                            <button
                                type="button"
                                className="text-action-btn"
                                onClick={() =>
                                    setEditingDepotsFor({
                                        user: u,
                                        depotIds: [...(u.allowedDepotIds || [])],
                                    })
                                }
                            >
                                <EditOutlined sx={{ fontSize: 12 }} />
                                Editar
                            </button>
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle, #1e2133)' }}>
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
                        <KeyOutlined sx={{ fontSize: 14 }} />
                        Contraseña
                    </Btn>
                    <Btn
                        small
                        variant="secondary"
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
        <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1360px', margin: '0 auto' }}>
            <style>{`
                .filter-pill {
                    background: transparent;
                    border: 1px solid var(--border-strong, #374151);
                    color: var(--text-muted, #9ca3af);
                    padding: 7px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                    white-space: nowrap;
                }
                .filter-pill:hover {
                    border-color: var(--text-muted, #9ca3af);
                    color: var(--text-primary, #f3f4f6);
                }
                .filter-pill.active {
                    background: rgba(99, 102, 241, 0.14);
                    border-color: #6366f1;
                    color: var(--text-primary, #f3f4f6);
                }
                .text-action-btn {
                    background: transparent;
                    border: 1px solid var(--border-color, #2a2d3e);
                    color: var(--text-muted, #9ca3af);
                    border-radius: 6px;
                    padding: 2px 8px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }
                .text-action-btn:hover {
                    border-color: #6366f1;
                    color: var(--text-primary, #f3f4f6);
                }
            `}</style>

            <PageHeader
                title="Usuarios"
                subtitle="Administración de cuentas, roles y permisos de acceso"
            >
                <Btn
                    onClick={() => {
                        setCreateError('');
                        setShowNewUserModal(true);
                    }}
                >
                    <PersonAddOutlined sx={{ fontSize: 17 }} />
                    Nuevo usuario
                </Btn>
            </PageHeader>

            {feedback && (
                <div
                    style={{
                        marginBottom: '14px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background:
                            feedback.type === 'ok'
                                ? 'rgba(16, 185, 129, 0.1)'
                                : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${
                            feedback.type === 'ok'
                                ? 'rgba(16, 185, 129, 0.3)'
                                : 'rgba(239, 68, 68, 0.3)'
                        }`,
                        color: feedback.type === 'ok' ? '#10b981' : '#f87171',
                        fontSize: '13px',
                        fontWeight: 500,
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
                            fontSize: '13px',
                            padding: '0 4px',
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}

            <Card style={{ padding: '14px 16px', marginBottom: '16px' }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.9fr auto',
                        gap: '12px',
                        alignItems: 'flex-end',
                    }}
                >
                    <Input
                        label="Buscar"
                        placeholder="Filtrar por usuario, sector o depósito..."
                        value={quickSearch}
                        onChange={setQuickSearch}
                    />

                    <Select
                        label="Sector"
                        value={sectorFilter}
                        onChange={setSectorFilter}
                        options={[
                            { value: '', label: 'Todos los sectores' },
                            ...ALL_SECTORS.map((s) => ({
                                value: s.key,
                                label: s.label,
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
                            Rol / Estado
                        </label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {(
                                [
                                    { id: 'ALL', label: `Todos (${counts.all})` },
                                    { id: 'ADMIN', label: `Admin (${counts.admin})` },
                                    { id: 'SUPERVISOR', label: `Supervisor (${counts.supervisor})` },
                                    { id: 'OPERARIO', label: `Operario (${counts.operario})` },
                                    ...(counts.inactive > 0
                                        ? [{ id: 'INACTIVE', label: `Inactivos (${counts.inactive})` }]
                                        : []),
                                ] as { id: RoleFilter; label: string }[]
                            ).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    className={`filter-pill ${roleFilter === tab.id ? 'active' : ''}`}
                                    onClick={() => setRoleFilter(tab.id)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </Card>

            <Card style={{ padding: isMobile ? '12px' : 0, overflow: 'hidden' }}>
                <ResponsiveTable
                    loading={loadingUsers}
                    data={filteredUsers}
                    desktopCols={desktopCols}
                    renderDesktopRow={renderDesktopRow}
                    renderMobileCard={renderMobileCard}
                />
            </Card>

            {/* Modal Crear Usuario */}
            {showNewUserModal && (
                <Modal title="Nuevo usuario" onClose={() => setShowNewUserModal(false)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                            <Input
                                label="Nombre de usuario"
                                placeholder="Ej: jperez"
                                value={newUserForm.username}
                                onChange={(v) => setNewUserForm((p) => ({ ...p, username: v }))}
                            />
                            <Input
                                label="Contraseña inicial"
                                type="password"
                                placeholder="Contraseña"
                                value={newUserForm.password}
                                onChange={(v) => setNewUserForm((p) => ({ ...p, password: v }))}
                            />
                        </div>

                        <Select
                            label="Rol"
                            value={newUserForm.role}
                            onChange={(val) => setNewUserForm((p) => ({ ...p, role: val }))}
                            options={[
                                { value: 'SUPERVISOR', label: 'SUPERVISOR' },
                                { value: 'OPERARIO', label: 'OPERARIO' },
                                { value: 'ADMIN', label: 'ADMIN (Acceso total)' },
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
                                        <label style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px' }}>
                                            Sectores permitidos ({newUserForm.sectors.length})
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                className="text-action-btn"
                                                onClick={() =>
                                                    setNewUserForm((p) => ({
                                                        ...p,
                                                        sectors: ALL_SECTORS.map((s) => s.key),
                                                    }))
                                                }
                                            >
                                                Todos
                                            </button>
                                            <button
                                                type="button"
                                                className="text-action-btn"
                                                onClick={() => setNewUserForm((p) => ({ ...p, sectors: [] }))}
                                            >
                                                Ninguno
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
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
                                                            ? 'rgba(99,102,241,0.12)'
                                                            : 'var(--bg-hover-row, rgba(255,255,255,0.02))',
                                                        borderRadius: '6px',
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
                                                    <span style={{ fontSize: '13px', color: 'var(--text-primary, #f3f4f6)' }}>
                                                        {sec.label}
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
                                            <label style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '12px' }}>
                                                Depósitos permitidos{' '}
                                                <span style={{ color: 'var(--text-subtle, #6b7280)' }}>
                                                    (vacío = todos)
                                                </span>
                                            </label>
                                            {newUserForm.allowedDepotIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="text-action-btn"
                                                    onClick={() =>
                                                        setNewUserForm((p) => ({ ...p, allowedDepotIds: [] }))
                                                    }
                                                >
                                                    Limpiar
                                                </button>
                                            )}
                                        </div>
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
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
                                                                ? 'rgba(99,102,241,0.12)'
                                                                : 'var(--bg-hover-row, rgba(255,255,255,0.02))',
                                                            borderRadius: '6px',
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
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary, #f3f4f6)' }}>
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
                                    borderRadius: '6px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    fontSize: '12px',
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
                            {isCreating ? 'Creando...' : 'Crear usuario'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* Modal Editar Sectores */}
            {editingSectorsFor && (
                <Modal
                    title={`Sectores — ${editingSectorsFor.user.username}`}
                    onClose={() => setEditingSectorsFor(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '13px' }}>
                                Seleccioná los sectores habilitados:
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="text-action-btn"
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
                                    className="text-action-btn"
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

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
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
                                                ? 'rgba(99,102,241,0.12)'
                                                : 'var(--bg-hover-row, rgba(255,255,255,0.02))',
                                            borderRadius: '6px',
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
                                        <span style={{ color: 'var(--text-primary, #f3f4f6)', fontWeight: 500, fontSize: '13px' }}>
                                            {sec.label}
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
                            {savingModal ? 'Guardando...' : 'Guardar'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* Modal Editar Depósitos */}
            {editingDepotsFor && (
                <Modal
                    title={`Depósitos — ${editingDepotsFor.user.username}`}
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
                                Si no seleccionás ninguno, tendrá acceso a todos los depósitos.
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="text-action-btn"
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
                                    className="text-action-btn"
                                    onClick={() =>
                                        setEditingDepotsFor({
                                            ...editingDepotsFor,
                                            depotIds: [],
                                        })
                                    }
                                >
                                    Limpiar
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
                                            ? 'rgba(99,102,241,0.12)'
                                            : 'var(--bg-hover-row, rgba(255,255,255,0.02))',
                                        borderRadius: '6px',
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
                                        <div style={{ color: 'var(--text-primary, #f3f4f6)', fontWeight: 500, fontSize: '13px' }}>
                                            {d.nombre}
                                        </div>
                                        <div style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '11px' }}>
                                            {d.planta || 'Sin planta'}
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
                            {savingModal ? 'Guardando...' : 'Guardar'}
                        </Btn>
                    </div>
                </Modal>
            )}

            {/* Modal Cambiar Contraseña */}
            {editingPasswordFor && (
                <Modal
                    title={`Cambiar contraseña — ${editingPasswordFor.username}`}
                    onClose={() => {
                        setEditingPasswordFor(null);
                        setNewPasswordVal('');
                        setPasswordError('');
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                        <Input
                            label="Nueva contraseña"
                            type="password"
                            placeholder="Ingresá la nueva contraseña"
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
                                    borderRadius: '6px',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    fontSize: '12px',
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
                            {savingModal ? 'Guardando...' : 'Guardar'}
                        </Btn>
                    </div>
                </Modal>
            )}
        </div>
    );
}
