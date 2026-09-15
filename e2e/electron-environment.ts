const PASSTHROUGH_ENVIRONMENT = [
  'APPDATA',
  'CI',
  'COMSPEC',
  'DBUS_SESSION_BUS_ADDRESS',
  'DISPLAY',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'Path',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PSModulePath',
  'SHELL',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USER',
  'USERPROFILE',
  'WINDIR',
  'XAUTHORITY',
  'XDG_RUNTIME_DIR',
] as const

export function electronE2EEnvironment(
  additions: Record<string, string> = {}
): Record<string, string> {
  const environment = Object.fromEntries(
    PASSTHROUGH_ENVIRONMENT.flatMap(name => {
      const value = process.env[name]
      return value ? [[name, value]] : []
    })
  )
  return { ...environment, BUDDY_ELECTRON_E2E: '1', ...additions }
}
