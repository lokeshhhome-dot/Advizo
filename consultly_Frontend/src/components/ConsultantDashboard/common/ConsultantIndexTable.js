import { useState, useEffect, useCallback } from "react";
import {
  Card,
  IndexTable,
  Spinner,
  Text,
  Pagination,
} from "@shopify/polaris";

const ConsultantIndexTable = ({
  headings = [],
  resourceName = { singular: "item", plural: "items" },
  data = [],
  renderRow,
  loading = false,
  pageSize = 10,
}) => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [data.length]);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const pageData = data.slice(startIndex, startIndex + pageSize);
  const startItem = totalItems === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  const handlePrevious = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPage((current) => Math.min(totalPages, current + 1));
  }, [totalPages]);

  return (
    <Card padding="0">
      <IndexTable
        selectable={false}
        resourceName={resourceName}
        itemCount={loading ? 1 : pageData.length}
        headings={headings}
      >
        {loading ? (
          <IndexTable.Row id="loading">
            <IndexTable.Cell colSpan={headings.length}>
              <div
                style={{
                  padding: "40px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Spinner size="large" />
              </div>
            </IndexTable.Cell>
          </IndexTable.Row>
        ) : pageData.length === 0 ? (
          <IndexTable.Row id="empty">
            <IndexTable.Cell colSpan={headings.length}>
              <div style={{ padding: "24px", textAlign: "center" }}>
                <Text as="p" tone="subdued">
                  No records found
                </Text>
              </div>
            </IndexTable.Cell>
          </IndexTable.Row>
        ) : (
          pageData.map((item, index) =>
            renderRow(item, startIndex + index),
          )
        )}
      </IndexTable>

      {!loading && totalPages > 1 ? (
        <div
          style={{
            padding: "16px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Pagination
            label={`Showing ${startItem} to ${endItem} of ${totalItems} ${resourceName.plural}`}
            hasPrevious={page > 1}
            onPrevious={handlePrevious}
            hasNext={page < totalPages}
            onNext={handleNext}
          />
        </div>
      ) : null}
    </Card>
  );
};

export default ConsultantIndexTable;
