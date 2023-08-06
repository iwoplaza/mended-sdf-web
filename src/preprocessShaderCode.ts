export function preprocessShaderCode(code: string, defines: Record<string, string>) {
  let preprocessed = code;

  Object.entries(defines).forEach(([key, value]) => {
    preprocessed = preprocessed.replace(`{{${key}}}`, value);
  });

  return preprocessed;
}