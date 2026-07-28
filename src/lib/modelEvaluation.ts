export const modelEvaluation = [
  { model: 'Mean prediction reference', mae: 23.722916, rmse: 29.730719, r2: -0.000015 },
  { model: 'Linear Regression', mae: 23.724022, rmse: 29.733552, r2: -0.000205 },
  { model: 'Random Forest', mae: 23.771296, rmse: 29.784403, r2: -0.003629 },
] as const;

export const modelEvaluationNote = 'No trained model meaningfully outperformed the mean prediction reference.';
