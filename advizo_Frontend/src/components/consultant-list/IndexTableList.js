import {
  IndexTable,
  LegacyCard,
  IndexFilters,
  useSetIndexFiltersMode,
  Pagination,
  Spinner,
} from '@shopify/polaris';
import { useState, useCallback } from 'react';

/**
 * Reusable IndexTableList component
 * @param {Array} itemStrings - Array of tab labels
 * @param {Array} sortOptions - Array of sort options
 * @param {Array} data - Array of data items to display
 * @param {Array} headings - Array of table column headings
 * @param {Function} renderRow - Function to render each row: (item, index) => JSX
 * @param {Object} resourceName - Object with singular and plural resource names
 * @param {String} queryPlaceholder - Placeholder text for search input
 * @param {Function} onTabChange - Optional callback when tab changes: (selectedIndex) => void
 * @param {Function} onQueryChange - Optional callback when query changes: (query) => void
 * @param {Function} onSortChange - Optional callback when sort changes: (sortValue) => void
 * @param {Number} page - Current page number (1-based)
 * @param {Function} setPage - Function to set page number
 * @param {Number} limit - Number of items per page
 * @param {Number} totalItems - Total number of items across all pages
 */
function IndexTableList({
  hideFilters = false,
  itemStrings = [],
  sortOptions = [],
  data = [],
  headings = [],
  renderRow,
  resourceName = { singular: 'item', plural: 'items' },
  queryPlaceholder = 'Search items',
  onTabChange,
  onQueryChange,
  onSortChange,
  page,
  setPage,
  limit,
  totalItems,
  setType,
  loading,
  onHandleCancel
}) {
  const tabs = itemStrings.map((item, index) => ({
    content: item,
    index,
    onAction: () => { },
    id: `${item}-${index}`,
    isLocked: index === 0,
  }));


  const [selected, setSelected] = useState(0);
  const [sortSelected, setSortSelected] = useState(sortOptions.length > 0 ? [sortOptions[0].value] : []);
  const { mode, setMode } = useSetIndexFiltersMode();
  const [queryValue, setQueryValue] = useState('');

  const handleTabChange = useCallback(
    (selectedIndex) => {
      setSelected(selectedIndex);
      if (setType) {
        setType(selectedIndex);
      }
    },
    [setType]
  );

  const handleFiltersQueryChange = useCallback(
    (value) => {
      setQueryValue(value);
      if (onQueryChange) {
        onQueryChange(value);
      }
    },
    [onQueryChange]
  );

  const handleQueryValueRemove = useCallback(() => {
    setQueryValue('');
    if (onQueryChange) {
      onQueryChange('');
    }
  }, [onQueryChange]);

  const handleSortChange = useCallback(
    (sortValue) => {
      setSortSelected(sortValue);
      if (onSortChange) {
        onSortChange(sortValue);
      }
    },
    [onSortChange]
  );



  const hasPagination = page !== undefined && setPage !== undefined && limit !== undefined;
  const totalPages = hasPagination && totalItems !== undefined ? Math.ceil(totalItems / limit) : 1;
  const currentPage = page || 1;
  const startItem = hasPagination ? (currentPage - 1) * limit + 1 : 1;
  const endItem = hasPagination ? Math.min(currentPage * limit, totalItems || data.length) : data.length;
  const totalCount = totalItems !== undefined ? totalItems : data.length;

  const handlePreviousPage = useCallback(() => {
    if (currentPage > 1 && setPage) {
      setPage(currentPage - 1);
    }
  }, [currentPage, setPage]);

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages && setPage) {
      setPage(currentPage + 1);
    }
  }, [currentPage, totalPages, setPage]);

  return (
    <LegacyCard>
      {!hideFilters && (
      <IndexFilters
        sortOptions={sortOptions}
        sortSelected={sortSelected}
        queryValue={queryValue}
        queryPlaceholder={queryPlaceholder}
        onQueryChange={handleFiltersQueryChange}
        onQueryClear={handleQueryValueRemove}
        onSort={handleSortChange}
        cancelAction={{
          onAction: onHandleCancel,
          disabled: false,
          loading: false,
        }}
        tabs={tabs}
        selected={selected}
        onSelect={handleTabChange}
        canCreateNewView={false}
        filters={[]}
        appliedFilters={[]}
        onClearAll={handleQueryValueRemove}
        mode={mode}
        setMode={setMode}
      />
      )}
      {/* No `condensed` mode: rows here are built from IndexTable.Cell, which
          condensed (mobile list) mode doesn't render — the table came up empty
          on phones. The regular table scrolls horizontally on small screens. */}
      <IndexTable
        selectable={false}
        resourceName={resourceName}
        itemCount={loading ? 1 : data.length}
        headings={headings}
      >
        {loading ? (
          <IndexTable.Row>
            <IndexTable.Cell colSpan={headings.length}>
              <div
                style={{
                  padding: '40px',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <Spinner size="large" />
              </div>
            </IndexTable.Cell>
          </IndexTable.Row>
        ) : (
          data.map((item, index) =>
            renderRow ? renderRow(item, index) : null
          )
        )}
      </IndexTable>

      {hasPagination && totalPages > 1 && (
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
          <Pagination
            label={`Showing ${startItem} to ${endItem} of ${totalCount} ${resourceName.plural}`}
            hasPrevious={currentPage > 1}
            onPrevious={handlePreviousPage}
            hasNext={currentPage < totalPages}
            onNext={handleNextPage}
          />
        </div>
      )}
    </LegacyCard>
  );
}

export default IndexTableList;