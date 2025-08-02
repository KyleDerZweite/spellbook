export interface ApiResponse<T> {
  data: T
  meta?: {
    total?: number
    page?: number
    per_page?: number
    total_pages?: number
    has_next?: boolean
    has_prev?: boolean
  }
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Array<{
      field: string
      message: string
    }>
  }
}

export interface PaginationParams {
  page?: number
  per_page?: number
}

export interface QueryParams extends PaginationParams {
  [key: string]: string | number | boolean | undefined
}