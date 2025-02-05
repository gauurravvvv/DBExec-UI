export interface ICaseSeriesList {
  id: string;
  name: string;
  description: string;
  last_refresh_time: string;
  case_series_type: string;
  created_by: string;
  created_on: string;
  query_name: string;
  query_description: string;
  query_sql: string;
  shareDetails: string;
  enterprise_id: string;
  is_shared: boolean;
  total_case_numbers: string;
  last_case_number_update: string;
  view_config?: any;
  tag: any[];
}

export interface ICaseSeriesDetails {
  header: string;
  data: string;
  viewConfig?: any;
  list?: any;
  selectedTags?: any;
}

export interface ICaseSeriesListName {
  id: string;
  name: string;
}
