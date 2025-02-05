import { ISelection } from './qbe';

export interface IMedDRAData {
  [key: string]: any;
  id: number;
  SMQ_CODE: number;
  SMQ_NAME: string;
  SMQ_LEVEL?: number;
  STATUS?: string;
  SOC_CODE: number;
  SOC_NAME: string;
  HLGT_CODE: number;
  HLGT_NAME: string;
  HLT_CODE: number;
  HLT_NAME: string;
  PT_CODE: number;
  PT_NAME: string;
  LLT_CODE: number;
  LLT_NAME: string;
}

export interface IResult {
  id: number;
  type: string;
  name: string;
  code: number;
}

export interface ITermsMapping {
  searched: ISelection[];
  selected: ISelection[];
}

export interface IMedDRAApiResponse {
  soc: IResult[];
  hlgt: IResult[];
  hlt: IResult[];
  pt: IResult[];
  llt: IResult[];
}

export interface ISmqCmqList {
  smq_name: string;
  smq_code: string;
}
