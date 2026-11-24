import { useState, useEffect, Suspense } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, useNavigation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useGetAlertsQuery } from '../features/warehouse/stock/api/stock.api';
import { logout, selectCurrentUser } from '../entities/auth/model/authSlice';
import { api } from './api';
import { useChangeMyPasswordMutation } from '../entities/auth/api/authApi';
import { setCurrentAlerts, selectHasUnreadNotifications } from '../entities/notifications/notificationsSlice';
import { useIsMobile, PageLoader, Modal, Input, Btn } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import {
    DashboardOutlined,
    PeopleOutline,
    ManageSearchOutlined,
    PrecisionManufacturingOutlined,
    CalendarMonthOutlined,
    UploadFileOutlined,
    SwapHorizOutlined,
    EditNoteOutlined,
    HistoryOutlined,
    AssessmentOutlined,
    ScienceOutlined,
    MenuBookOutlined,
    WarehouseOutlined,
    TrackChangesOutlined,
    LocalShippingOutlined,
    AssignmentOutlined,
    EventNoteOutlined,
    Inventory2Outlined,
    CallReceivedOutlined,
    CallMadeOutlined,
    CategoryOutlined,
    DataUsageOutlined,
    AcUnitOutlined,
    BarChartOutlined,
    FactCheckOutlined,
    ChecklistRtlOutlined,
    RuleOutlined,
    SummarizeOutlined,
    SettingsOutlined,
    SellOutlined,
    AllInboxOutlined,
    DomainOutlined,
    HandshakeOutlined,
    ShieldOutlined,
    ShoppingCartOutlined,
    BoltOutlined,
    ReceiptLongOutlined,
    ShowChartOutlined,
    BuildOutlined,
    TvOutlined,
    PostAddOutlined,
    PendingActionsOutlined,
    AccessTimeOutlined,
    TrendingUpOutlined,
    TimelineOutlined,
    VerifiedOutlined,
    MonetizationOnOutlined,
    BadgeOutlined,
    NotificationsNoneOutlined,
    HelpOutlineOutlined,
    LightModeOutlined,
    DarkModeOutlined,
    KeyOutlined,
    LogoutOutlined,
    ChevronRightOutlined,
    ChevronLeftOutlined,
} from '@mui/icons-material';

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
}

interface NavSubGroup {
    id: string;
    label: string;
    icon: React.ReactNode;
    isSubGroup: true;
    items: NavItem[];
}

interface NavGroup {
    id: string;
    label: string;
    icon: React.ReactNode;
    items: (NavItem | NavSubGroup)[];
}

const ic = { fontSize: 17 };
const gIc = { fontSize: 16 };

const flattenItems = (items: (NavItem | NavSubGroup)[]): NavItem[] => {
    const flat: NavItem[] = [];
    items.forEach(item => {
        if ('isSubGroup' in item && item.isSubGroup) {
            flat.push(...item.items);
        } else {
            flat.push(item as NavItem);
        }
    });
    return flat;
};

const navGroups: NavGroup[] = [
    {
        id: 'administracion',
        label: 'Administración',
        icon: <ShieldOutlined sx={gIc} />,
        items: [
            { to: '/admin/dashboard', label: 'Dashboard General', icon: <DashboardOutlined sx={ic} /> },
            { to: '/users', label: 'Usuarios', icon: <PeopleOutline sx={ic} /> },
            { to: '/admin/auditoria', label: 'Auditoría del sistema', icon: <ManageSearchOutlined sx={ic} /> },
        ]
    },
    {
        id: 'produccion',
        label: 'Producción',
        icon: <PrecisionManufacturingOutlined sx={gIc} />,
        items: [
            { to: '/produccion/dashboard', label: 'Dashboard', icon: <DashboardOutlined sx={ic} /> },
            { to: '/produccion/programacion-gantt', label: 'Programación Gantt', icon: <CalendarMonthOutlined sx={ic} /> },
            { to: '/produccion/planificacion', label: 'Carga de Producción del Día', icon: <UploadFileOutlined sx={ic} /> },
            {
                id: 'produccion-cambios',
                label: 'Cambios',
                icon: <SwapHorizOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/produccion/cambios', label: 'Registro de Cambios', icon: <EditNoteOutlined sx={ic} /> },
                    { to: '/produccion/historial-cambios', label: 'Historial de Cambios', icon: <HistoryOutlined sx={ic} /> },
                    { to: '/produccion/informe-cambios', label: 'Informe de Cambios', icon: <AssessmentOutlined sx={ic} /> },
                ]
            },
        ]
    },
    {
        id: 'desarrollo',
        label: 'Desarrollo',
        icon: <ScienceOutlined sx={gIc} />,
        items: [
            { to: '/desarrollo/articulos', label: 'Catálogo de Artículos', icon: <MenuBookOutlined sx={ic} /> },
        ]
    },
    {
        id: 'deposito',
        label: 'Depósito',
        icon: <WarehouseOutlined sx={gIc} />,
        items: [
            { to: '/deposito/dashboard', label: 'Dashboard', icon: <DashboardOutlined sx={ic} /> },
            { to: '/deposito/centro-comando', label: 'Centro de Comando', icon: <TrackChangesOutlined sx={ic} /> },
            {
                id: 'deposito-operaciones',
                label: 'Operaciones',
                icon: <LocalShippingOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/deposito/tareas', label: 'Tareas y Pedidos', icon: <AssignmentOutlined sx={ic} /> },
                    { to: '/deposito/programacion', label: 'Planificación Semanal', icon: <EventNoteOutlined sx={ic} /> },
                    { to: '/stock', label: 'Stock', icon: <Inventory2Outlined sx={ic} /> },
                    { to: '/movimientos', label: 'Movimientos', icon: <SwapHorizOutlined sx={ic} /> },
                    { to: '/remitos-entrada', label: 'Entrada de mercadería', icon: <CallReceivedOutlined sx={ic} /> },
                    { to: '/remitos-salida', label: 'Salida de mercadería', icon: <CallMadeOutlined sx={ic} /> },
                    { to: '/deposito/picking', label: 'Picking de Hilados', icon: <CategoryOutlined sx={ic} /> },
                ]
            },
            {
                id: 'deposito-informes',
                label: 'Informes',
                icon: <AssessmentOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/deposito/capacidad', label: 'Medidor de Capacidad', icon: <DataUsageOutlined sx={ic} /> },
                    { to: '/deposito/materiales-estancados', label: 'Material Estancado', icon: <AcUnitOutlined sx={ic} /> },
                    { to: '/reporte-consumo-detallado', label: 'Consumo de Materiales', icon: <BarChartOutlined sx={ic} /> },
                    { to: '/deposito/completitud-materiales', label: 'Completitud de Materiales', icon: <FactCheckOutlined sx={ic} /> },
                ]
            },
            {
                id: 'deposito-inventario',
                label: 'Inventario',
                icon: <Inventory2Outlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/deposito/informes', label: 'Informe de inventariado', icon: <TrendingUpOutlined sx={ic} /> },
                    { to: '/chequeo-inventario', label: 'Chequeo de inventario', icon: <ChecklistRtlOutlined sx={ic} /> },
                    { to: '/chequeo-categoria', label: 'Chequeo por catálogo', icon: <RuleOutlined sx={ic} /> },
                    { to: '/reporte-chequeo', label: 'Reporte de chequeo', icon: <SummarizeOutlined sx={ic} /> },
                ]
            },
            {
                id: 'configuracion',
                label: 'Configuración',
                icon: <SettingsOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/items', label: 'Materiales', icon: <SellOutlined sx={ic} /> },
                    { to: '/items/box-types', label: 'Cajas / Embalaje', icon: <AllInboxOutlined sx={ic} /> },
                    { to: '/deposito', label: 'Depósitos', icon: <DomainOutlined sx={ic} /> },
                    { to: '/socios', label: 'Socios', icon: <HandshakeOutlined sx={ic} /> },
                    { to: '/admin/movements', label: 'Auditoría de Stock', icon: <ShieldOutlined sx={ic} /> },
                ]
            }
        ]
    },
    {
        id: 'compras',
        label: 'Compras',
        icon: <ShoppingCartOutlined sx={gIc} />,
        items: [
            { to: '/compras/materiales-criticos-dashboard', label: 'Tablero de Compras', icon: <BoltOutlined sx={ic} /> },
            { to: '/compras/ordenes-compra', label: 'Órdenes de Compra', icon: <ReceiptLongOutlined sx={ic} /> },
            { to: '/compras/pedidos-deposito', label: 'Pedidos a Depósito', icon: <LocalShippingOutlined sx={ic} /> },
            { to: '/compras/diente-de-sierra', label: 'Gráfico Diente de Sierra', icon: <ShowChartOutlined sx={ic} /> },
            { to: '/reporte-consumo-detallado', label: 'Consumo de Materiales', icon: <BarChartOutlined sx={ic} /> },
            {
                id: 'compras-configuracion',
                label: 'Configuración',
                icon: <SettingsOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/items', label: 'Materiales y Precios', icon: <SellOutlined sx={ic} /> },
                    { to: '/socios', label: 'Proveedores / Socios', icon: <HandshakeOutlined sx={ic} /> },
                ]
            },
        ]
    },
    {
        id: 'mantenimiento',
        label: 'Mantenimiento',
        icon: <BuildOutlined sx={gIc} />,
        items: [
            { to: '/mantenimiento/dashboard', label: 'Dashboard Mant', icon: <DashboardOutlined sx={ic} /> },
            { to: '/mantenimiento/monitoreo', label: 'Monitoreo en Vivo', icon: <TvOutlined sx={ic} /> },
            { to: '/mantenimiento/registro', label: 'Registrar Novedades', icon: <PostAddOutlined sx={ic} /> },
            { to: '/mantenimiento/cambios', label: 'Registrar Cambios', icon: <SwapHorizOutlined sx={ic} /> },
            { to: '/mantenimiento/historial', label: 'Historial Novedades', icon: <HistoryOutlined sx={ic} /> },
            { to: '/mantenimiento/historial-cambios', label: 'Historial de Cambios', icon: <HistoryOutlined sx={ic} /> },
            { to: '/mantenimiento/buscador', label: 'Detalle', icon: <ManageSearchOutlined sx={ic} /> },
            { to: '/mantenimiento/pendientes', label: 'Pendientes', icon: <PendingActionsOutlined sx={ic} /> },
            {
                id: 'mantenimiento-informes',
                label: 'Informes',
                icon: <AssessmentOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/mantenimiento/informe-turnos', label: 'Informe Turnos', icon: <AccessTimeOutlined sx={ic} /> },
                    { to: '/mantenimiento/informe-cambios', label: 'Informe Cambios', icon: <TrendingUpOutlined sx={ic} /> },
                ]
            },
            {
                id: 'mantenimiento-kpi',
                label: 'KPI',
                icon: <TrendingUpOutlined sx={ic} />,
                isSubGroup: true,
                items: [
                    { to: '/mantenimiento/kpi/disponibilidad', label: 'Disponibilidad Máquinas', icon: <PrecisionManufacturingOutlined sx={ic} /> },
                    { to: '/mantenimiento/kpi/disponibilidad-v2', label: 'Disponibilidad Timeline (V2)', icon: <TimelineOutlined sx={ic} /> },
                ]
            },
        ]
    },
    {
        id: 'calidad',
        label: 'Calidad',
        icon: <VerifiedOutlined sx={gIc} />,
        items: [
            { to: '/calidad/cuarentena', label: 'Cuarentena y liberación', icon: <ScienceOutlined sx={ic} /> },
        ]
    },
    {
        id: 'ventas',
        label: 'Ventas',
        icon: <TrendingUpOutlined sx={gIc} />,
        items: [
            { to: '/ventas/dashboard', label: 'Dashboard Ventas', icon: <DashboardOutlined sx={ic} /> },
        ]
    },
    {
        id: 'finanzas',
        label: 'Finanzas',
        icon: <MonetizationOnOutlined sx={gIc} />,
        items: [
            { to: '/finanzas/dashboard', label: 'Dashboard Finanzas', icon: <DashboardOutlined sx={ic} /> },
        ]
    },
    {
        id: 'rrhh',
        label: 'Recursos Humanos',
        icon: <BadgeOutlined sx={gIc} />,
        items: [
            { to: '/rrhh/dashboard', label: 'Dashboard RRHH', icon: <DashboardOutlined sx={ic} /> },
        ]
    }
];

const navStyle = (isActive: boolean, isMobile: boolean, isLight: boolean = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '10px',
    paddingTop: isMobile ? '13px' : '9px',
    paddingBottom: isMobile ? '13px' : '9px',
    paddingRight: isMobile ? '18px' : '14px',
    paddingLeft: isMobile ? '18px' : '14px',
    textDecoration: 'none',
    color: isActive ? '#6366f1' : (isLight ? 'var(--text-dimmed, #4b5563)' : 'var(--text-muted, #9ca3af)'),
    background: isActive ? (isLight ? 'rgba(99,102,241,0.1)' : 'rgba(165,180,252,0.07)') : 'transparent',
    borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
    fontSize: isMobile ? '14px' : '13px',
    fontWeight: isActive ? 600 : 400,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
});

const EMPTY_ALERTS: any[] = [];

export default function Layout() {
    const isMobile = useIsMobile();
    const user = useSelector(selectCurrentUser);
    const role = user?.role?.toUpperCase() || '';
    const sector = user?.sector?.toUpperCase() || '';
    const isAdmin = role === 'ADMIN';
    const isSupervisor = role === 'SUPERVISOR';
    const userSectors: string[] = user?.sectors && user.sectors.length > 0
        ? user.sectors.map((s: string) => s.toUpperCase())
        : (user?.sector ? user.sector.split(/[,;|]/).map((s: string) => s.trim().toUpperCase()).filter(Boolean) : []);

    const navigation = useNavigation();
    const isNavigating = navigation.state === 'loading';

    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPasswordVal, setNewPasswordVal] = useState('');
    const [changePassword] = useChangeMyPasswordMutation();
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        return (localStorage.getItem('app-theme') as 'dark' | 'light') || 'dark';
    });

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.setItem('app-theme', nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const { data: alerts = EMPTY_ALERTS } = useGetAlertsQuery(undefined, { pollingInterval: 120000 });
    const hasUnread = useSelector(selectHasUnreadNotifications);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (alerts && Array.isArray(alerts) && alerts.length > 0) {
            dispatch(setCurrentAlerts(alerts));
        } else if (alerts && Array.isArray(alerts) && alerts.length === 0) {
            dispatch(setCurrentAlerts([]));
        }
    }, [alerts, dispatch]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        const handleOpenMenu = () => setMobileMenuOpen(true);
        document.addEventListener('open-sidebar-menu', handleOpenMenu);
        return () => document.removeEventListener('open-sidebar-menu', handleOpenMenu);
    }, []);

    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [expandedSubGroups, setExpandedSubGroups] = useState<string[]>([]);

    const toggleGroup = (id: string) => {
        setExpandedGroups(prev =>
            prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
        );
    };

    const isAllowed = (to: string) => {
        if (isAdmin) return true;

        if (to === '/users' || to.startsWith('/admin/dashboard') || to === '/admin/auditoria') {
            return false;
        }

        const sectorRoutes: Record<string, string[]> = {
            DEPOSITO: [
                '/deposito/dashboard', '/deposito/centro-comando', '/deposito/tareas', '/deposito/programacion', '/stock', '/movimientos', '/deposito/picking',
                '/deposito/picking-produccion',
                '/remitos-entrada', '/remitos-salida',
                '/deposito/capacidad',
                '/reporte-consumo-detallado', '/tasks',
                '/chequeo-inventario', '/chequeo-categoria', '/reporte-chequeo', '/deposito/informes',
                '/deposito/materiales-estancados', '/deposito/completitud-materiales',
                '/deposito/informes-produccion',
                '/items', '/items/box-types', '/deposito', '/socios',
                '/admin/movements',
            ],
            COMPRAS: [
                '/compras/dashboard',
                '/compras/pedidos-deposito',
                '/deposito/tareas',
                '/reporte-consumo-detallado',
                '/compras/faltantes-produccion',
                '/compras/materiales-criticos-dashboard',
                '/compras/materiales-criticos',
                '/stock',
                '/items', '/items/box-types', '/deposito', '/socios',
            ],
            MANTENIMIENTO: [
                '/mantenimiento/dashboard', '/mantenimiento/monitoreo',
                '/mantenimiento/registro', '/mantenimiento/cambios', '/mantenimiento/historial',
                '/mantenimiento/historial-cambios',
                '/mantenimiento/buscador', '/mantenimiento/pendientes',
                '/mantenimiento/informe-turnos', '/mantenimiento/informe-cambios',
                '/mantenimiento/kpi/disponibilidad',
                '/mantenimiento/kpi/disponibilidad-v2',
            ],
            CALIDAD: ['/calidad/cuarentena'],
            VENTAS: ['/ventas/dashboard'],
            FINANZAS: ['/finanzas/dashboard'],
            RRHH: ['/rrhh/dashboard'],
            DESARROLLO: [
                '/desarrollo/articulos',
                '/desarrollo/estructuras',
                '/desarrollo/equivalencias',
                '/desarrollo/maquinas',
            ],
            PRODUCCION: [
                '/produccion/dashboard',
                '/produccion/programacion-gantt',
                '/produccion/planificacion',
                '/produccion/pedidos',
                '/produccion/informe-tejeduria',
                '/produccion/informe-cambios-dia',
                '/produccion/cambios',
                '/produccion/historial-cambios',
                '/produccion/informe-cambios',
            ],
        };

        // Coincidencia exacta: antes con startsWith, '/deposito' habilitaba TODAS las rutas /deposito/*
        // (por ejemplo a usuarios de Compras les aparecían ítems de Depósito en el menú).
        return userSectors.some(sec => {
            const routes = sectorRoutes[sec] || [];
            return routes.includes(to);
        });
    };

    const filteredGroups = navGroups.map(group => {
        if (group.id === 'administracion' && !isAdmin) {
            return null;
        }

        const filteredItems = group.items.map(item => {
            if ('isSubGroup' in item && item.isSubGroup) {
                const subItems = item.items.filter(subItem => isAllowed(subItem.to));
                if (subItems.length > 0) {
                    return { ...item, items: subItems };
                }
                return null;
            } else {
                const stdItem = item as NavItem;
                return isAllowed(stdItem.to) ? stdItem : null;
            }
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (filteredItems.length === 0) return null;

        return { ...group, items: filteredItems };
    }).filter((group): group is NonNullable<typeof group> => group !== null);

    // Hay rutas compartidas entre sectores (ej. /items y /socios están en Depósito y en Compras).
    // Recordamos desde qué grupo hizo click el usuario para expandir ESE grupo y no el último que coincida.
    const NAV_GROUP_KEY = 'nav-active-group';
    const rememberGroup = (groupId: string) => {
        try { sessionStorage.setItem(NAV_GROUP_KEY, groupId); } catch { /* ignore */ }
    };

    const resolveActiveGroup = (pathname: string) => {
        const candidates = filteredGroups.filter(g => flattenItems(g.items).some(i => i.to === pathname));
        if (candidates.length === 0) return null;
        let preferred: string | null = null;
        try { preferred = sessionStorage.getItem(NAV_GROUP_KEY); } catch { /* ignore */ }
        return candidates.find(g => g.id === preferred) || candidates[0];
    };

    const activeGroup = resolveActiveGroup(location.pathname);
    const allItems = activeGroup
        ? [...flattenItems(activeGroup.items), ...navGroups.flatMap(g => flattenItems(g.items))]
        : navGroups.flatMap(g => flattenItems(g.items));

    useEffect(() => {
        let activeGroupId: string | null = null;
        let activeSubGroupId: string | null = null;

        const group = resolveActiveGroup(location.pathname);
        if (group) {
            activeGroupId = group.id;
            rememberGroup(group.id);
            group.items.forEach(item => {
                if ('isSubGroup' in item && item.isSubGroup) {
                    if (item.items.some(sub => location.pathname === sub.to)) {
                        activeSubGroupId = item.id;
                    }
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps

        if (activeGroupId) {
            setExpandedGroups([activeGroupId]);
        } else {
            setExpandedGroups([]);
        }

        if (activeSubGroupId) {
            setExpandedSubGroups([activeSubGroupId]);
        } else {
            setExpandedSubGroups([]);
        }
    }, [location.pathname]);

    const handleLogout = () => {
        dispatch(api.util.resetApiState());
        dispatch(logout());
        navigate('/login', { replace: true });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            height: '100vh',
            background: 'var(--bg-primary, #0f1117)',
            color: 'var(--text-primary, #f3f4f6)',
            transition: 'background 0.3s ease, color 0.3s ease'
        }}>
            {isNavigating && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: 'linear-gradient(90deg, #6366f1, #a5b4fc, #8b5cf6)',
                    zIndex: 10000,
                    animation: 'loading-bar 1.8s infinite ease-in-out',
                    transformOrigin: '0% 50%',
                }}>
                    <style>{`
                        @keyframes loading-bar {
                            0% { transform: scaleX(0); }
                            50% { transform: scaleX(0.7); }
                            100% { transform: scaleX(1); opacity: 0; }
                        }
                    `}</style>
                </div>
            )}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-color, #2a2d3e); borderRadius: 10px; }
                .nav-overlay {
                    position: fixed; inset: 0; background: var(--bg-overlay-heavy, rgba(0, 0, 0, 0.7)); z-index: 998;
                    opacity: ${mobileMenuOpen ? 1 : 0}; visibility: ${mobileMenuOpen ? 'visible' : 'hidden'};
                    transition: all 0.3s ease;
                }
                @keyframes pulse-dot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.2); }
                }
            `}</style>

            {/* Mobile Header */}
            {isMobile && !['/mantenimiento/dashboard', '/deposito/dashboard', '/deposito/centro-comando'].includes(location.pathname) && (
                <header style={{
                    height: '56px', background: 'var(--bg-secondary, #1a1d2e)', borderBottom: '1px solid var(--border-color, #2a2d3e)',
                    display: 'flex', alignItems: 'center', padding: '0 12px', zIndex: 997,
                    justifyContent: 'space-between', flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            style={{
                                background: 'transparent', border: 'none', color: 'var(--text-primary, #f3f4f6)',
                                fontSize: '22px', cursor: 'pointer', padding: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                position: 'relative',
                            }}
                        >
                            ☰
                            {hasUnread && !mobileMenuOpen && (
                                <span style={{
                                    position: 'absolute', top: '2px', right: '0px',
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: '#ef4444', border: '2px solid var(--bg-secondary, #1a1d2e)',
                                    animation: 'pulse-dot 2s ease-in-out infinite',
                                }} />
                            )}
                        </button>
                        <span style={{
                            fontWeight: 700,
                            color: '#6366f1',
                            fontSize: '14px',
                            letterSpacing: '0.2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textTransform: 'uppercase'
                        }}>
                            {allItems.find(i => i.to === location.pathname.split('?')[0])?.label || 'WMS'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {(location.pathname === '/stock' || location.pathname === '/movimientos') && (isAdmin || (isSupervisor && sector === 'DEPOSITO')) && (
                            <button
                                onClick={() => {
                                    const sep = location.search ? '&' : '?';
                                    navigate(location.pathname + location.search + sep + 'qa=1', { replace: true });
                                }}
                                style={{
                                    background: '#6366f1',
                                    border: 'none',
                                    color: '#ffffff',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                                }}
                            >
                                +
                            </button>
                        )}
                    </div>
                </header>
            )}

            {(isMobile || location.pathname === '/mantenimiento/monitoreo') && <div className="nav-overlay" onClick={() => setMobileMenuOpen(false)} />}

            <aside style={{
                position: isMobile || location.pathname === '/mantenimiento/monitoreo' ? 'fixed' : 'relative',
                left: (isMobile || location.pathname === '/mantenimiento/monitoreo') && !mobileMenuOpen ? '-280px' : '0',
                top: 0, bottom: 0,
                width: isMobile || location.pathname === '/mantenimiento/monitoreo' ? '270px' : (collapsed ? '60px' : '230px'),
                background: theme === 'light' ? 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' : 'linear-gradient(180deg, var(--bg-secondary, #1a1d2e) 0%, #141622 100%)',
                borderRight: '1px solid var(--border-color, #2a2d3e)',
                display: 'flex', flexDirection: 'column',
                transition: 'all 0.3s ease',
                zIndex: 999,
                flexShrink: 0,
            }}>
                <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border-color, #2a2d3e)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Inventory2Outlined sx={{ fontSize: 20, color: theme === 'light' ? '#6366f1' : '#a5b4fc' }} />
                        {(!collapsed || isMobile) && (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ color: theme === 'light' ? '#0f172a' : '#f3f4f6', fontWeight: 700, fontSize: '14px', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>WMS INVENTARIO</span>
                                <span style={{ color: 'var(--text-subtle, #6b7280)', fontSize: '10px', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{role}</span>
                            </div>
                        )}
                    </div>
                    {!isMobile && (
                        <button
                            type="button"
                            onClick={() => setCollapsed(!collapsed)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-subtle, #6b7280)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                        >
                            {collapsed ? <ChevronRightOutlined sx={{ fontSize: 18 }} /> : <ChevronLeftOutlined sx={{ fontSize: 18 }} />}
                        </button>
                    )}
                </div>

                <nav className="custom-scrollbar" style={{ flex: 1, paddingTop: '8px', overflowY: 'auto' }}>
                    {filteredGroups.map((group) => {
                        const isExpanded = expandedGroups.includes(group.id);
                        const leafItems = flattenItems(group.items);
                        const isActiveGroup = activeGroup?.id === group.id;
                        const hasActiveChild = isActiveGroup;

                        return (
                            <div key={group.id} style={{ marginBottom: '6px' }}>
                                {(!collapsed || isMobile) && (
                                    <button
                                        type="button"
                                        onClick={() => toggleGroup(group.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            width: '100%', padding: '8px 14px',
                                            background: 'transparent', border: 'none',
                                            color: isExpanded || hasActiveChild ? (theme === 'light' ? '#6366f1' : '#a5b4fc') : (theme === 'light' ? 'var(--text-muted, #64748b)' : 'var(--text-subtle, #6b7280)'),
                                            fontSize: '11px', fontWeight: 700,
                                            textTransform: 'uppercase', letterSpacing: '0.8px',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}
                                    >
                                        <span style={{ display: 'flex', alignItems: 'center', opacity: 0.9 }}>{group.icon}</span>
                                        <span>{group.label}</span>
                                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                            <ChevronRightOutlined sx={{ fontSize: 15 }} />
                                        </span>
                                    </button>
                                )}

                                {collapsed && !isMobile && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'center',
                                        padding: '10px 0', borderBottom: theme === 'light' ? '1px solid rgba(0,0,0,0.06)' : '1px solid var(--bg-hover-dynamic, rgba(255,255,255,0.05))',
                                        color: hasActiveChild ? (theme === 'light' ? '#6366f1' : '#a5b4fc') : 'var(--text-subtle, #6b7280)'
                                    }}>
                                        {group.icon}
                                    </div>
                                )}

                                {(isExpanded || (collapsed && !isMobile)) && (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {collapsed && !isMobile ? (
                                            leafItems.map(({ to, label, icon }) => (
                                                <NavLink
                                                    key={to}
                                                    to={to}
                                                    end
                                                    title={label}
                                                    onClick={() => rememberGroup(group.id)}
                                                    style={({ isActive }) => ({
                                                        ...navStyle(isActive && isActiveGroup, isMobile, theme === 'light'),
                                                        justifyContent: 'center',
                                                        paddingLeft: 0,
                                                        paddingRight: 0,
                                                        opacity: !hasActiveChild ? 0.65 : 1
                                                    })}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
                                                </NavLink>
                                            ))
                                        ) : (
                                            group.items.map((item) => {
                                                if ('isSubGroup' in item && item.isSubGroup) {
                                                    const subId = item.id;
                                                    const isSubExpanded = expandedSubGroups.includes(subId);
                                                    const hasActiveSubChild = isActiveGroup && item.items.some(sub => location.pathname === sub.to);

                                                    return (
                                                        <div key={subId} style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setExpandedSubGroups(prev =>
                                                                        prev.includes(subId) ? prev.filter(g => g !== subId) : [...prev, subId]
                                                                    );
                                                                }}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                                    paddingTop: isMobile ? '12px' : '9px',
                                                                    paddingBottom: isMobile ? '12px' : '9px',
                                                                    paddingRight: isMobile ? '18px' : '14px',
                                                                    paddingLeft: '28px',
                                                                    background: 'transparent', border: 'none',
                                                                    color: isSubExpanded || hasActiveSubChild ? (theme === 'light' ? '#6366f1' : '#a5b4fc') : (theme === 'light' ? 'var(--text-dimmed, #4b5563)' : 'var(--text-muted, #9ca3af)'),
                                                                    fontSize: isMobile ? '14px' : '13px',
                                                                    fontWeight: isSubExpanded || hasActiveSubChild ? 600 : 400,
                                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                                    width: '100%', textAlign: 'left'
                                                                }}
                                                            >
                                                                <span style={{ display: 'flex', alignItems: 'center', opacity: 0.85 }}>{item.icon}</span>
                                                                <span>{item.label}</span>
                                                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', transition: 'transform 0.2s', transform: isSubExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                                    <ChevronRightOutlined sx={{ fontSize: 15 }} />
                                                                </span>
                                                            </button>
                                                            {isSubExpanded && (
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    {item.items.map(({ to, label, icon }) => (
                                                                        <NavLink
                                                                            key={to}
                                                                            to={to}
                                                                            end
                                                                            onClick={() => rememberGroup(group.id)}
                                                                            style={({ isActive }) => ({
                                                                                ...navStyle(isActive && isActiveGroup, isMobile, theme === 'light'),
                                                                                paddingLeft: '44px',
                                                                            })}
                                                                        >
                                                                            <span style={{ display: 'flex', alignItems: 'center', opacity: 0.85 }}>{icon}</span>
                                                                            <span>{label}</span>
                                                                        </NavLink>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                } else {
                                                    const std = item as NavItem;
                                                    return (
                                                        <NavLink
                                                            key={std.to}
                                                            to={std.to}
                                                            end
                                                            onClick={() => rememberGroup(group.id)}
                                                            style={({ isActive }) => ({
                                                                ...navStyle(isActive && isActiveGroup, isMobile, theme === 'light'),
                                                                paddingLeft: '28px',
                                                            })}
                                                        >
                                                            <span style={{ display: 'flex', alignItems: 'center', opacity: 0.85 }}>{std.icon}</span>
                                                            <span>{std.label}</span>
                                                        </NavLink>
                                                    );
                                                }
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <NavLink
                        to="/notificaciones"
                        style={({ isActive }) => ({
                            ...navStyle(isActive, isMobile, theme === 'light'),
                            marginTop: '12px',
                            borderTop: '1px solid var(--border-color, #2a2d3e)',
                            paddingTop: isMobile ? '14px' : '11px',
                        })}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                            <NotificationsNoneOutlined sx={ic} />
                            {hasUnread && (
                                <span style={{
                                    position: 'absolute', top: '-2px', right: '-2px',
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: '#ef4444', border: theme === 'light' ? '2px solid #ffffff' : '2px solid var(--bg-secondary, #1a1d2e)',
                                    animation: 'pulse-dot 2s ease-in-out infinite',
                                }} />
                            )}
                        </span>
                        {(!collapsed || isMobile) && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Notificaciones
                                {hasUnread && alerts.length > 0 && (
                                    <span style={{
                                        background: '#ef4444',
                                        color: '#ffffff',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: '10px',
                                        minWidth: '16px',
                                        textAlign: 'center' as const,
                                    }}>
                                        {alerts.length}
                                    </span>
                                )}
                            </span>
                        )}
                    </NavLink>

                    <NavLink
                        to="/ayuda"
                        style={({ isActive }) => ({
                            ...navStyle(isActive, isMobile, theme === 'light'),
                            marginTop: '2px',
                            borderTop: 'none',
                        })}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                            <HelpOutlineOutlined sx={ic} />
                        </span>
                        {(!collapsed || isMobile) && (
                            <span>Ayuda / Soporte</span>
                        )}
                    </NavLink>
                </nav>

                <div style={{ borderTop: '1px solid var(--border-color, #2a2d3e)', padding: '6px 0' }}>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: isMobile ? '14px 18px' : '9px 14px', width: '100%',
                            background: 'transparent', border: 'none',
                            color: theme === 'light' ? 'var(--border-strong, #374151)' : 'var(--text-muted, #9ca3af)', fontSize: isMobile ? '14px' : '13px',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                            {theme === 'dark' ? <LightModeOutlined sx={ic} /> : <DarkModeOutlined sx={ic} />}
                        </span>
                        {(!collapsed || isMobile) && <span>Modo {theme === 'dark' ? 'Claro' : 'Oscuro'}</span>}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowPasswordModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: isMobile ? '14px 18px' : '9px 14px', width: '100%',
                            background: 'transparent', border: 'none',
                            color: theme === 'light' ? 'var(--border-strong, #374151)' : 'var(--text-muted, #9ca3af)', fontSize: isMobile ? '14px' : '13px',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}><KeyOutlined sx={ic} /></span>
                        {(!collapsed || isMobile) && <span>Cambiar Contraseña</span>}
                    </button>
                    <button
                        type="button"
                        onClick={handleLogout}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: isMobile ? '14px 18px' : '9px 14px', width: '100%',
                            background: 'transparent', border: 'none',
                            color: '#ef4444', fontSize: isMobile ? '14px' : '13px',
                            cursor: 'pointer', transition: 'all 0.15s',
                            fontWeight: 500,
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center' }}><LogoutOutlined sx={ic} /></span>
                        {(!collapsed || isMobile) && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </aside>

            <main
                className="app-content"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    position: 'relative',
                    width: '100%',
                    background: theme === 'light' ? '#f0f2f5' : undefined,
                }}
            >
                {isNavigating && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--bg-overlay, rgba(15, 17, 23, 0.65))',
                        backdropFilter: 'blur(3px)',
                        zIndex: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <PageLoader />
                    </div>
                )}
                <ErrorBoundary key={location.pathname}>
                    <Suspense key={location.pathname} fallback={<PageLoader />}>
                        <Outlet />
                    </Suspense>
                </ErrorBoundary>
            </main>

            {showPasswordModal && (
                <Modal title="Cambiar mi Contraseña" onClose={() => { setShowPasswordModal(false); setNewPasswordVal(''); }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                        <Input
                            label="Nueva Contraseña"
                            type="password"
                            value={newPasswordVal}
                            onChange={setNewPasswordVal}
                        />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <Btn variant="secondary" onClick={() => { setShowPasswordModal(false); setNewPasswordVal(''); }}>Cancelar</Btn>
                        <Btn onClick={async () => {
                            if (!newPasswordVal) {
                                alert('Por favor ingresa una contraseña.');
                                return;
                            }
                            try {
                                await changePassword({ password: newPasswordVal }).unwrap();
                                alert('Contraseña actualizada correctamente.');
                                setShowPasswordModal(false);
                                setNewPasswordVal('');
                            } catch (e: any) {
                                alert(e?.data?.message || 'Error al cambiar contraseña');
                            }
                        }}>Guardar Contraseña</Btn>
                    </div>
                </Modal>
            )}
        </div>
    );
}
