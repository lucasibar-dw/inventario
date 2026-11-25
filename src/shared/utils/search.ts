/**
 * Utilidades centrales de búsqueda inteligente para toda la aplicación:
 * - Ignora mayúsculas/minúsculas y tildes/diacríticos (NFD)
 * - Soporta búsqueda multipalabra en cualquier orden y entre múltiples campos
 *   (ej: "negro rontaltex" busca en descripción + proveedor + categoría + código + lote)
 */

export function normalizeSearchText(value: unknown): string {
    if (value == null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function tokenizeSearch(query: string): string[] {
    return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
}

/**
 * Retorna true si TODAS las palabras de `query` aparecen en al menos alguno de los `fields`.
 */
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
    const tokens = tokenizeSearch(query);
    if (tokens.length === 0) return true;
    const haystack = fields
        .filter(f => f != null && f !== '')
        .map(f => normalizeSearchText(f))
        .join(' ');
    return tokens.every(token => haystack.includes(token));
}

/**
 * Factory de `filterOptions` para MUI `<Autocomplete>` con soporte multipalabra,
 * insensible a tildes y búsqueda cruzada en todos los campos provistos.
 */
export function createSmartFilterOptions<T>(
    getSearchFields: (option: T) => unknown[],
    config?: { limit?: number; alwaysInclude?: (option: T) => boolean }
) {
    return (options: T[], state: { inputValue: string; getOptionLabel: (option: T) => string }): T[] => {
        const tokens = tokenizeSearch(state.inputValue);
        if (tokens.length === 0) {
            return config?.limit ? options.slice(0, config.limit) : options;
        }
        const matched = options.filter(option => {
            if (config?.alwaysInclude?.(option)) return true;
            const fields = getSearchFields(option);
            return matchesSearch(state.inputValue, state.getOptionLabel(option), ...fields);
        });
        return config?.limit ? matched.slice(0, config.limit) : matched;
    };
}

/**
 * Helper estándar para buscar en objetos de Material / Item (código, descripción,
 * proveedor, categoría, depósito, unidad, etc.).
 */
export function getItemSearchFields(item: any): unknown[] {
    if (!item) return [];
    return [
        item.codigoInterno,
        item.codigo,
        item.descripcion,
        item.supplier?.name,
        item.supplierName,
        item.proveedorNombre,
        item.proveedor,
        item.category?.nombre,
        item.categoriaNombre,
        item.categoria,
        item.depot?.nombre,
        item.category?.depot?.nombre,
        item.unidadPrincipal,
        item.unidadSecundaria,
    ];
}
