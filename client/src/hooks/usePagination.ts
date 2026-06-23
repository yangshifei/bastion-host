import { useState, useCallback } from 'react';

interface UsePaginationOptions {
  defaultPage?: number;
  defaultPageSize?: number;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const [page, setPage] = useState(options.defaultPage || 1);
  const [pageSize, setPageSize] = useState(options.defaultPageSize || 20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const onChange = useCallback((pageInfo: { current: number; pageSize: number }) => {
    setPage(pageInfo.current);
    setPageSize(pageInfo.pageSize);
  }, []);

  const updateTotal = useCallback((t: number, ps?: number) => {
    setTotal(t);
    setTotalPages(Math.ceil(t / (ps || pageSize)));
  }, [pageSize]);

  const reset = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
    onChange,
    updateTotal,
    reset,
    paginationProps: {
      current: page,
      pageSize,
      total,
      showJumper: true,
      showPageSize: true,
      pageSizeOptions: [10, 20, 50, 100],
      onChange,
    },
  };
}
