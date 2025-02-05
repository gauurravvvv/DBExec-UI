export interface IQbe_json {
  tab_name: string;
  control: string;
  items: ISection[];
}

export interface ISection {
  section_name: string;
  subItems: IPrompt[];
}

export interface IPrompt {
  prompt_id: string;
  prompt_name: string;
  prompt_input_type: string;
  filter?: boolean;
  grid?: boolean;
  placeholder?: string;
  group?: boolean;
  groupItems?: any;
  value?: any;
  control?: string;
  onButtonSelect?: string;
  buttonName?: string;
}

export interface IPromptValue {
  name: string;
  value: {
    name: string;
    value: string;
  };
}

export interface IViewQBEDetails {
  heading: any;
  heading_sequence: number;
  data: [
    { sub_heading: any; sub_data: [{ prompt_name: any; prompt_value: any }] }
  ];
}
export interface IOutputJson {
  id: string;
  name: string;
  value: any;
  type?: any;
  control: string;
}

export interface IDictionarySelection {
  criteriaNumber: number;
  level: string;
  terms: ISelection[] | string;
  isAll: boolean;
}

export interface ISelection {
  id: number;
  name: string;
  type: string;
  code: number;
  isActive: boolean;
}

export interface IProductData {
  [key: string]: any;
  id: number;
  ingredient_id: number;
  ingredient: string;
  family_id: number;
  family_name: string;
  product_id: number;
  prod_name: string;
  license_id: number;
  trade_name: string;
  trade_name_country: string;
}

export interface IProductData2 {
  [key: string]: any;
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  family_id: number;
  family_name: string;
  product_id: number;
  product_name: string;
  trade_id: number;
  trade_name: string;
  trade_name_country: string;
}

export interface IResult {
  id: number;
  type: string;
  name: string;
  code: number;
}

export interface ITabList {
  p_tab_control: string;
  p_tab_name: string;
  p_tab_sequence: number;
  disabled: boolean;
}
