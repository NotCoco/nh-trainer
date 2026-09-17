/** Action IDs have different meanings in these model schemas. Labels are diagnostic only. */
export type NhNeuralPolicyDecoder =
  | "nh-deployed-legacy"
  | "dmm-deployed-composite"
  | "current-action-vector";

export type NhPolicyDecoder = NhNeuralPolicyDecoder | "tabular";
