export type ConverterDefinition =
  | {
      type: 'enum'
      values: { [key: string]: number }
    }
  | { type: string; [key: string]: any }

export function converterDefinition(definition: ConverterDefinition) {
  return JSON.stringify({ autoConvert: true, ...definition }, null, 2)
}
