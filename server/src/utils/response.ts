import { Response } from 'express';

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginatedData<T = any> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function success<T>(res: Response, data?: T, message = 'ok', httpStatus = 200): void {
  res.status(httpStatus).json({
    code: 0,
    message,
    data,
  });
}

export function error(res: Response, message: string, code = 1, httpStatus = 400): void {
  res.status(httpStatus).json({
    code,
    message,
  });
}

export function paginated<T>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number
): void {
  const totalPages = Math.ceil(total / pageSize);
  res.status(200).json({
    code: 0,
    message: 'ok',
    data: {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    },
  });
}
