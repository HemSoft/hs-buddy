/* global module */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular dependencies make refactoring fragile and can cause subtle runtime bugs.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'info',
      comment: 'Files not imported by any other file may be dead code.',
      from: {
        orphan: true,
        pathNot: [
          '\\.test\\.',
          '\\.bench\\.',
          '\\.spec\\.',
          '\\.steps\\.',
          'main\\.ts',
          'preload\\.ts',
          'index\\.html',
        ],
      },
      to: {},
    },
    {
      name: 'no-renderer-to-main',
      severity: 'error',
      comment:
        'Renderer code (src/) must not import directly from the main process (electron/). ' +
        'Use IPC contracts via the preload bridge instead.',
      from: { path: '^src/', pathNot: '\\.test\\.' },
      to: { path: '^electron/' },
    },
    {
      name: 'no-component-to-convex-internals',
      severity: 'warn',
      comment:
        'UI components should not import Convex internals directly. ' +
        'Use hooks or service layers that abstract Convex access.',
      from: { path: '^src/components/' },
      to: { path: '^convex/', pathNot: '^convex/_generated/' },
    },
    {
      name: 'no-convex-to-renderer',
      severity: 'error',
      comment:
        'Convex modules must not import from the renderer (src/). ' +
        'Convex runs server-side and cannot depend on client code. ' +
        'Pre-existing violations are tracked in .dependency-cruiser-known-violations.json.',
      from: { path: '^convex/', pathNot: '^convex/_generated/' },
      to: { path: '^src/' },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'dist-electron', 'coverage', '.modules'],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
