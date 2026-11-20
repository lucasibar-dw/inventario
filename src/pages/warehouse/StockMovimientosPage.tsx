import StockPage from './StockPage';
import MovimientosPage from './MovimientosPage';
import { PageHeader } from '../../shared/ui';
import { useIsMobile } from '../../shared/ui';

export default function StockMovimientosPage() {
  const isMobile = useIsMobile();
  // Layout: two panels side by side on desktop, stacked on mobile
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: '24px',
    padding: isMobile ? '12px' : '24px',
    maxWidth: '100%',
    margin: '0 auto',
    boxSizing: 'border-box'
  };

  const panelStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0 // allow flex child to shrink properly
  };

  return (
    <>
      <PageHeader
        title="Stock & Movimientos"
        subtitle="Gestión combinada de inventario y transferencias"
        hideTitleOnMobile
      />
      <div style={containerStyle}>
        <div style={panelStyle}>
          {/* Stock management panel */}
          <StockPage />
        </div>
        <div style={panelStyle}>
          {/* Movimientos/transfer panel */}
          <MovimientosPage />
        </div>
      </div>
    </>
  );
}
