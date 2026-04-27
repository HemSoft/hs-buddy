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
      from: { orphan: true, pathNot: ['\\.test\\.', '\\.bench\\.', '\\.spec\\.', '\\.steps\\.', 'main\\.ts', 'preload\\.ts', 'index\\.html'] },
      to: {},
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
