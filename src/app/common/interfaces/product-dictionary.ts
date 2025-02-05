export interface IProductApiResponse {
  ingredient: IProductResult[];
  product_family: IProductResult[];
  product_name: IProductResult[];
  trade_name: IProductResult[];
}

export interface IProductResult {
  id: number;
  type: string;
  name: string;
  code: number;
  original_name: string;
}

export interface IProductSelection {
  id: number;
  name: string;
  type: string;
  code: number;
  isActive: boolean;
  original_name: string;
}
