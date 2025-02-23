import antfu from '@antfu/eslint-config'

export default await antfu(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.d.cts',
      '**/*.d.mts',
    ],
  },
)
