export type QueryScalarInput = string | number | boolean;
export type QueryRelationInput = Array<readonly [string, number]>;
export type QueryInput = QueryScalarInput | Array<string> | QueryRelationInput;

export interface QueryDef {
  inputs: Array<QueryInput>;
  query: string;
}
