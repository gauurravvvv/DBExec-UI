import { IViewQBEDetails } from './qbe';
import { IUserGroupDetails } from './sharing';

export interface IQueryDetails {
  id: string;
  query_name: string;
  query_description: string;
  query: string;
  query_type: string;
  enterprise_id: string;
  case_series_name: string;
  case_series_description: string;
  is_shared: boolean;
  last_refresh_time: string;
  created_by: string;
  created_on: string;
  total_case_numbers: string;
  view_config?: any;
  last_case_number_update: string;
  tag: any[];
}

export interface IQueryMoreDetails {
  header: string;
  data: string;
  userGroupDetails?: IUserGroupDetails[];
  viewConfig?: any;
  list?: any;
  selectedTags?: any;
}
